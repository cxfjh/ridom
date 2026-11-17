import type { ReactiveInterface } from "../types";
import { activeFns, depMap, elDeps } from "../utils/shared.ts";
import { collectUpdates, compile, parser } from "../core";
import { regDir } from "./regDir.ts";
import { initDir, onElRemove, resetTree, teardownTree } from "../utils/lifecycle.ts";
import { emitUpdate } from "../core";


/**
 * 注册 r-if 指令, 条件为假时默认隐藏节点, 加 `del` 属性则移出 DOM 并释放订阅
 *
 * @param el - 条件渲染的目标元素
 * @param expr - 条件表达式
 * @param scope - 当前数据作用域
 * @param deps - 依赖收集容器
 */
regDir("r-if", (el: HTMLElement, expr: string, scope: ReactiveInterface, deps: Set<string>): void => {
    if (!initDir(el, expr, scope, "r-if", "rIf")) return;
    const elMap = el as unknown as Record<string, unknown>;
    
    // 销毁模式开关, 条件为假时整棵子树移出 DOM 并释放订阅
    const destroyMode = el.hasAttribute("del");
    
    // 销毁模式下保存"原始模板", 首次编译时子节点仍是未解析的模板, 重新挂载时必须还原模板再编译, 否则会把上一次渲染结果当作新模板
    const template = destroyMode ? el.innerHTML : "";
    
    // 缓存原始内联 display 值, 首次初始化时读取一次
    let initDisplay = elMap.__ifInitDisplay as string | undefined;
    if (initDisplay === undefined) {
        initDisplay = el.style.display;
        elMap.__ifInitDisplay = initDisplay;
    }
    
    // 缓存修剪后的表达式, 避免每次 update 重复 trim
    const trimmedExpr = expr.trim();
    
    // 上次显示状态, 初始为 null 确保首次必然执行
    let prevShown: boolean | null = null;
    
    // 销毁模式下的挂载状态与占位注释节点, 记住原始位置
    let mounted = true;
    let placeholder: Comment | null = null;
    
    // 重挂载后子树的更新函数, 重新挂载由本指令发起, 外层收不到, 须自己保存并驱动
    let inner: Function[] = [];
    
    /**
     * 重跑子树自身的更新函数
     */
    const runInner = (): void => {
        for (let i = 0; i < inner.length; i++) inner[i]();
    };
    
    /**
     * 从 DOM 移除并拆除整棵子树
     */
    const removeFromDOM = (): void => {
        const parent = el.parentNode;
        if (!parent) return;
        
        // 插入占位注释, 保留原始位置供恢复时使用
        placeholder = document.createComment("r-if");
        parent.insertBefore(placeholder, el);
        
        // 同步拆除反订阅, 移除监听, 重置编译标记, 即使拆除过程出错也必须把节点移出 DOM, 否则会停留在"半隐藏"状态
        try {
            teardownTree(el);
        } finally {
            el.remove();
            mounted = false;
        }
    };
    
    /**
     * 重新挂载并编译整棵子树
     */
    const insertIntoDOM = (): void => {
        const parent = placeholder?.parentNode;
        if (parent) parent.insertBefore(el, placeholder);
        
        placeholder?.remove();
        placeholder = null;
        
        // 还原模板再编译, 保证重新挂载后拿到的是原始插值而非上次渲染结果
        el.innerHTML = template;
        
        resetTree(el);
        inner = [];
        collectUpdates(inner, () => compile(el, scope));
        mounted = true;
    };
    
    /**
     * 核心更新函数
     */
    const update = (): void => {
        let shown: boolean;
        
        // 解析表达式, 转换为布尔值表达式
        try {
            shown = Boolean(parser.parse(trimmedExpr, scope, deps));
        } catch (error) {
            console.error("[r-if] 条件表达式解析错误:", { expr: trimmedExpr, error: (error as Error).message, stack: (error as Error).stack?.slice(0, 300) });
            shown = false;
        }
        
        // 销毁模式通过增删 DOM 切换, 不能先做状态短路, 宿主整体替换时插值须重新取数
        if (destroyMode) {
            if (shown) {
                if (!mounted) insertIntoDOM();
                else runInner();
            } else if (mounted) {
                removeFromDOM();
                inner = [];
            }
            prevShown = shown;
            return;
        }
        
        // 状态未变化时跳过
        if (shown === prevShown) return;
        prevShown = shown;
        
        // 切换显示状态
        if (shown) el.style.display = initDisplay;
        else el.style.setProperty("display", "none", "important");
    };
    
    // 推入 activeFns 栈收集依赖, 首次执行并完成订阅
    activeFns.push(update);
    try {
        update();
    } catch (error) {
        console.error("[r-if] 首次渲染错误:", (error as Error).message);
        el.style.setProperty("display", "none", "important");
    } finally {
        activeFns.pop();
    }
    
    // 登记到外层收集上下文, 作为 r-for 条目的一部分时, 条目数据变化要重算条件
    emitUpdate(update);
    
    // 销毁模式下自身订阅须长期存活才能感知条件恢复, 因此不注册元素清理回调
    if (destroyMode) return;
    
    // 元素移除时清理
    onElRemove(el, () => {
        // 重置处理标记, 允许 SPA 路由返回时重新编译
        elMap.__ifProcessed = false;
        
        // 取消所有依赖订阅
        const depSet = elDeps.get(el);
        if (depSet) {
            depSet.forEach(varName => depMap.get(scope)?.unsubscribe(update, varName));
            elDeps.delete(el);
        }
        
        // 清理缓存的初始 display 值
        delete elMap.__ifInitDisplay;
    });
});
