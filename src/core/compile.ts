import type { ReactiveInterface } from "../types";
import { hasInterp } from "../utils/constants.ts";
import { onElRemove } from "../utils/lifecycle.ts";
import { beginTrack, endTrack } from "./dep.ts";
import type { Dep } from "./dep.ts";
import { activeFns, deadFns, dirs, elDeps } from "../utils/shared.ts";
import { parser } from "./parser.ts";


/**
 * 更新函数收集栈, 供 r-for 收集条目的更新函数, 用栈以支持嵌套编译
 */
const sinks: Array<Function[] | null> = [];


/**
 * 在收集上下文中执行一段编译
 *
 * @param sink - 收集结果的数组
 * @param fn - 编译逻辑
 * @returns fn 的返回值
 */
export const collectUpdates = <T>(sink: Function[], fn: () => T): T => {
    sinks.push(sink);
    try {
        return fn();
    } finally {
        sinks.pop();
    }
};


/**
 * 把更新函数登记到当前的收集上下文
 *
 * @param update - 编译过程中创建的更新函数
 */
export const emitUpdate = (update: Function): void => {
    sinks.at(-1)?.push(update);
};


/**
 * 将 NamedNodeMap 转换为静态数组, 避免每次访问动态集合的开销
 *
 * @param el - 目标元素
 * @returns 静态属性数组
 */
const toAttrArray = (el: HTMLElement): Array<{name: string; value: string}> => {
    const attrs = el.attributes;
    const len = attrs.length;
    const result: Array<{name: string; value: string}> = new Array(len);
    for (let i = 0; i < len; i++) {
        const a = attrs[i];
        result[i] = { name: a.name, value: a.value };
    }
    return result;
};


/**
 * 为指定 DOM 元素创建或获取缓存的更新函数
 *
 * @param el - 目标 DOM 元素, 必须是 HTMLElement 实例
 * @param scope - 当前响应式作用域对象, 默认为空对象
 * @returns 更新函数, 每次调用会重新执行指令处理和插值更新
 */
export const bind = (el: HTMLElement, scope: ReactiveInterface = {} as ReactiveInterface): Function => {
    // 缓存命中检查, 重新绑定的增量更新走 rebind, 这里直接复用已有闭包
    const cached = elUpds.get(el);
    if (cached !== undefined) return cached;
    
    // 初始化或复用依赖集合
    let depSet = elDeps.get(el);
    if (!depSet) {
        depSet = new Set<string>();
        elDeps.set(el, depSet);
    }
    
    // 预分类, 将动态 NamedNodeMap 转为静态数组, 后续 update 不再访问 DOM 属性列表
    const staticAttrs = toAttrArray(el);
    const directives: Array<{name: string; value: string; handler: Function}> = [];
    const interpolations: Array<{name: string; value: string}> = [];
    
    for (let i = 0; i < staticAttrs.length; i++) {
        const { name, value } = staticAttrs[i];
        if (dirs.has(name)) {
            directives.push({ name, value, handler: dirs.get(name)! });
        } else if (hasInterp(value)) {
            interpolations.push({ name, value });
        }
    }
    
    // 缓存指令列表引用, rebind 向同一个数组追加后重新执行 update
    elDirCache.set(el, directives);
    
    // 缓存插值属性的上次设置值, 避免每次 update 先 getAttribute 再 setAttribute
    const lastValues: Record<string, string> = {};
    
    // 追踪本次 update 订阅的 Dep, 集合首次真正订阅时才创建
    let trackedDeps: Set<Dep> | undefined;
    
    // 是否已登记清理回调, 无任何订阅的元素不必登记
    let cleanupBound = false;
    
    /**
     * 执行元素的指令和插值更新
     */
    const update = (): void => {
        // 既无指令也无插值属性: 无依赖可收集, 直接返回, rebind 可能后续追加指令, 因此这里用运行时长度判断而非一次性标志
        if (directives.length === 0 && interpolations.length === 0) return;
        
        // 清空旧依赖, 每次更新时重新收集
        depSet!.clear();
        
        activeFns.push(update);
        beginTrack(update, trackedDeps);
        
        try {
            // 每个指令处理器内部通过 parser 访问 scope, 自动完成依赖收集
            for (let i = 0; i < directives.length; i++) {
                const { name, value, handler } = directives[i];
                try {
                    handler(el, value, scope, depSet!);
                } catch (e) {
                    console.error(`[update] 指令 "${ name }" 执行错误:`, e);
                }
            }
            
            // 解析并更新插值属性, 通过 lastValues 缓存避免不必要的 DOM 读写
            for (let i = 0; i < interpolations.length; i++) {
                const { name, value } = interpolations[i];
                const parsed = parser.text(value, scope, depSet!);
                if (lastValues[name] !== parsed) {
                    lastValues[name] = parsed;
                    el.setAttribute(name, parsed);
                }
            }
        } finally {
            // 避免栈状态异常导致后续依赖收集错乱
            const deps = endTrack();
            activeFns.pop();
            if (deps !== undefined) trackedDeps = deps;
        }
        
        // 首次执行后按需登记清理, 无订阅不必付出闭包与 WeakMap 记录
        if (!cleanupBound && trackedDeps !== undefined) {
            cleanupBound = true;
            const deps = trackedDeps;
            onElRemove(el, () => {
                deadFns.add(update);
                for (const dep of deps) dep.unsubscribe(update);
                elUpds.delete(el);
                elDeps.delete(el);
            });
        }
    };
    
    // 缓存更新函数到 WeakMap
    elUpds.set(el, update);
    
    // 登记到外层收集上下文, 纯容器不登记避免条目攥住容器节点
    if (directives.length > 0 || interpolations.length > 0) emitUpdate(update);
    
    return update;
};


/**
 * 为包含插值的文本节点建立响应式关联
 *
 * @param node - 包含 `{{ }}` 插值语法的文本节点
 * @param scope - 当前响应式作用域对象
 */
export const bindText = (node: Text, scope: ReactiveInterface): void => {
    // 缓存原始模板内容
    if (!textCache.has(node)) textCache.set(node, node.textContent || "");
    
    // 追踪本次 update 订阅过的所有 Dep, 供销毁时精确反订阅, 首次真正订阅时才创建
    let trackedDeps: Set<Dep> | undefined;
    
    /**
     * 更新文本节点的插值内容
     */
    const update = (): void => {
        const original = textCache.get(node) || "";
        activeFns.push(update);
        beginTrack(update, trackedDeps);
        try {
            // 内容没变就不写, 避免生成无意义的 characterData 变更
            const next = parser.text(original, scope);
            if (node.textContent !== next) node.textContent = next;
        } finally {
            const deps = endTrack();
            activeFns.pop();
            if (deps !== undefined) trackedDeps = deps;
        }
    };
    
    // 首次执行并完成依赖收集
    update();
    
    // 登记到外层的收集上下文, r-for 条目的数据变化时直接调用它重算
    emitUpdate(update);
    
    // 清理回调挂父元素, 文本节点自身被移除不会被观测到
    const host = node.parentNode;
    const deps = trackedDeps;
    if (deps !== undefined && host !== null) {
        onElRemove(host as unknown as HTMLElement, () => {
            deadFns.add(update);
            for (const dep of deps) dep.unsubscribe(update);
            textCache.delete(node);
        });
    }
};


/**
 * 递归处理 DOM 元素树, 建立响应式关联
 *
 * @param el - 根元素, HTMLElement 或文档片段, DocumentFragment
 * @param scope - 当前响应式作用域对象, 默认为空对象
 * @param isRoot - 是否为根元素, 默认为 true
 */
export const compile = (el: HTMLElement | DocumentFragment, scope: ReactiveInterface = {} as ReactiveInterface, isRoot: boolean = true): void => {
    // 防止重复处理
    if (!el || (el as unknown as Record<string, unknown>).__processed) return;
    (el as unknown as Record<string, unknown>).__processed = true;
    const nodeType = el.nodeType;
    
    // 跳过 <script> 和 <style> 元素, 避免把脚本/样式内容当模板解析
    if (nodeType === Node.ELEMENT_NODE) {
        const tag = (el as HTMLElement).tagName;
        if (tag === "SCRIPT" || tag === "STYLE") return;
        bind(el as HTMLElement, scope)();
        
        // 指令可能在绑定过程中把元素自身移出 DOM, r-if 销毁模式, 此时无需再向下编译
        if (!isRoot && (el as HTMLElement).parentNode === null) return;
    }
    
    // 处理子文本节点中的插值
    const childNodes = el.childNodes;
    if (childNodes && childNodes.length) {
        for (let i = 0, len = childNodes.length; i < len; i++) {
            const node = childNodes[i];
            if (node.nodeType === Node.TEXT_NODE && hasInterp(node.textContent || "")) bindText(node as Text, scope);
        }
    }
    
    // 递归处理子元素, childNodes 快照遍历, 避免 live HTMLCollection 的索引访问开销
    if (nodeType === Node.ELEMENT_NODE || nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const cn = el.childNodes;
        const cnLen = cn.length;
        for (let i = 0; i < cnLen; i++) {
            const child = cn[i];
            if (child.nodeType === Node.ELEMENT_NODE) compile(child as HTMLElement, scope, false);
        }
    }
};


/**
 * 增量重新绑定元素上的指令, 元素已编译后又动态新增 `r-xxx` 属性时, 把新指令追加到已有列表并复用原 update, 仅支持新增属性
 *
 * @param el - 目标元素
 * @param scope - 作用域, 缺省为空对象, 与 `compile` 保持一致
 */
export const rebind = (el: HTMLElement, scope: ReactiveInterface = {} as ReactiveInterface): void => {
    const update = elUpds.get(el);
    const directives = elDirCache.get(el);
    
    // 该元素从未编译过, 走常规编译流程
    if (!update || !directives) {
        compile(el, scope);
        return;
    }
    
    const attrs = el.attributes;
    let added = false;
    
    for (let i = 0; i < attrs.length; i++) {
        const name = attrs[i].name;
        const value = attrs[i].value;
        if (!dirs.has(name)) continue;
        
        let exists = false;
        for (let j = 0; j < directives.length; j++) {
            if (directives[j].name !== name) continue;
            exists = true;
            // 表达式热更新须由指令自行销毁旧绑定, 当前不支持
            if (directives[j].value !== value) console.warn(`[rebind] 指令 "${ name }" 的表达式已变更 (${ directives[j].value } -> ${ value }), 不支持热更新, 请重新创建元素`);
            break;
        }
        
        if (!exists) {
            directives.push({ name, value, handler: dirs.get(name)! });
            added = true;
        }
    }
    
    // 指令处理器内部有幂等守卫, 重复执行不会造成重复绑定
    if (added) update();
};


/**
 * 元素上已绑定的指令列表缓存, `rebind` 向其中追加新指令后重新执行更新
 */
const elDirCache = new WeakMap<HTMLElement, Array<{name: string; value: string; handler: Function}>>();


/**
 * 元素更新函数缓存
 */
const elUpds = new WeakMap<HTMLElement, Function>();


/**
 * 文本节点原始内容缓存
 */
const textCache = new WeakMap<Node, string>();