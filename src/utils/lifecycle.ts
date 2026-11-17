import type { ReactiveInterface } from "../types";
import { requestFrame } from "./shared.ts";


/**
 * 指令通用初始化工具
 *
 * @param el - 目标 DOM 元素
 * @param expr - 指令表达式字符串
 * @param scope - 当前响应式作用域, 供表达式解析
 * @param dirName - 指令名称, 仅作 warn 日志中的标识
 * @param flag - 唯一标记后缀
 * @returns `true` 表示通过校验, 应继续执行指令逻辑; `false` 表示应终止指令处理
 */
export const initDir = (el: HTMLElement, expr: string, scope: ReactiveInterface | null | undefined, dirName: string, flag: string): boolean => {
    // 表达式为空或仅含空白字符时, 指令无执行意义
    if (!expr || expr.trim() === "") {
        console.warn(`[${ dirName }] 表达式不能为空`);
        return false;
    }
    
    // 作用域无效时无法解析表达式中的变量, 提前终止
    if (!scope || typeof scope !== "object") {
        console.warn(`[${ dirName }] 作用域无效`);
        return false;
    }
    
    // 生成唯一标记键名
    const key = `__${ flag }Processed`;
    if ((el as unknown as Record<string, unknown>)[key]) return false;
    
    // 打上已处理标记, 后续调用直接命中上面的检查, 跳过重复处理
    (el as unknown as Record<string, unknown>)[key] = true;
    return true;
};


/**
 * 全局元素移除监听器
 */
const remWatcher: {elMap: WeakMap<HTMLElement, Set<() => void>>; obs: MutationObserver | null; tid: ReturnType<typeof setTimeout> | null; count: number;} = {
    elMap: new WeakMap(),
    obs: null,
    tid: null,
    count: 0,
};


/**
 * 处理 MutationObserver 回调
 *
 * @param mutations - 浏览器传入的 MutationRecord 数组, 存储到闭包中
 */
const onMutate = (mutations: MutationRecord[]): void => {
    // 已有待处理的合批任务, 本轮 mutations 将被一并处理, 直接返回
    if (remWatcher.tid !== null) return;
    
    // 设置异步合批定时器, 延迟到当前事件循环之后执行
    remWatcher.tid = setTimeout(() => {
        // 清除定时器标记, 允许后续 mutation 触发新的合批
        remWatcher.tid = null;
        const { elMap } = remWatcher;
        
        // 收集所有已脱离 DOM 且注册了清理回调的元素
        const removed: Array<[HTMLElement, Set<() => void>]> = [];
        
        // 遍历所有积压的 mutation records
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            for (let j = 0; j < m.removedNodes.length; j++) collectAndCheck(m.removedNodes[j], elMap, removed);
        }
        
        // 统一执行清理, 先收集完再执行, 避免在执行回调时修改数据结构
        for (let i = 0; i < removed.length; i++) {
            const [el, cbs] = removed[i];
            elMap.delete(el);  // 从 WeakMap 中移除, 释放对元素的引用
            remWatcher.count -= cbs.size;  // 递减全局计数器
            for (const cb of cbs) {
                try {
                    cb();
                } catch {
                    // 静默吞掉清理回调中的异常, 确保一个回调的异常不影响其他回调
                }
            }
        }
        
        // 所有回调已清理完毕, 如果没有任何待清理的元素, 释放 observer 资源
        if (remWatcher.count <= 0 && remWatcher.obs) {
            remWatcher.obs.disconnect();
            remWatcher.obs = null;
        }
        
        // 清空 mutations 数组, 释放对 MutationRecord 的引用
        mutations.length = 0;
    });
};


/**
 * 元素已脱离文档且注册了清理回调时, 加入待清理列表
 *
 * @param el - 待检查的元素
 * @param elMap - 元素到回调集合的映射
 * @param removed - 收集结果数组
 */
const pushIfTracked = (el: HTMLElement, elMap: WeakMap<HTMLElement, Set<() => void>>, removed: Array<[HTMLElement, Set<() => void>]>): void => {
    const cbs = elMap.get(el);
    if (cbs && !el.isConnected) removed.push([el, cbs]);
};


/**
 * 递归收集元素及其子树中所有被追踪的已脱离节点
 *
 * @param node - mutation.removedNodes 中的单个节点
 * @param elMap - 元素到回调集合的映射, 从 `remWatcher` 传入
 * @param removed - 收集结果数组, 元素为单位 [HTMLElement, Set<回调函数>]
 */
const collectAndCheck = (node: Node, elMap: WeakMap<HTMLElement, Set<() => void>>, removed: Array<[HTMLElement, Set<() => void>]>): void => {
    if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        
        // 元素已脱离 DOM 且注册了清理回调, 加入待清理列表
        pushIfTracked(el, elMap, removed);
        
        // 宿主元素带有影子树时, 先递归扫描影子树内部
        if (el.shadowRoot) collectAndCheck(el.shadowRoot as unknown as Node, elMap, removed);
        
        // 递归检查子树中的所有后代元素
        _checkChildren(el, elMap, removed);
    } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        // DocumentFragment 或 ShadowRoot 被移除: 遍历其子元素
        const children = (node as DocumentFragment).children;
        for (let i = 0; i < children.length; i++) collectAndCheck(children[i], elMap, removed);
    }
};


/**
 * 遍历元素子树, 收集所有被追踪的已脱离节点
 *
 * @param el - 要遍历子树的根元素
 * @param elMap - 元素到回调集合的映射
 * @param removed - 收集结果数组, 元素为单位 [HTMLElement, Set<回调函数>]
 */
const _checkChildren = (el: HTMLElement, elMap: WeakMap<HTMLElement, Set<() => void>>, removed: Array<[HTMLElement, Set<() => void>]>): void => {
    // TreeWalker 是深度优先遍历, 与 DOM 树的自然结构一致
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
    
    // 从根元素的第一个子元素开始遍历
    let child = walker.nextNode() as HTMLElement | null;
    
    while (child) {
        // 检查当前子孙元素是否注册了清理回调
        pushIfTracked(child, elMap, removed);
        
        // 子孙元素若自身也是组件宿主, 同样需要进入其影子树
        const shadow = child.shadowRoot;
        if (shadow) {
            const shadowChildren = shadow.children;
            for (let i = 0; i < shadowChildren.length; i++) collectAndCheck(shadowChildren[i], elMap, removed);
        }
        
        // 移动到下一个元素, 深度优先
        child = walker.nextNode() as HTMLElement | null;
    }
};


/**
 * 注册元素移除时的清理回调, 自动资源管理
 *
 * @param el - 要监听的 DOM 元素
 * @param cleanup - 元素被移除时执行的清理函数, 通常包含取消订阅, 清空缓存等操作
 */
export const onElRemove = (el: HTMLElement, cleanup: () => void) => {
    // 获取或创建该元素的回调集合
    let cbs = remWatcher.elMap.get(el);
    if (!cbs) {
        cbs = new Set();
        remWatcher.elMap.set(el, cbs);
    }
    
    // 将清理回调加入集合, 同一元素可注册多个回调
    cbs.add(cleanup);
    
    // 递增全局计数器, 判断是否须保持 observer
    remWatcher.count++;
    
    // 按需启动全局 observer: 仅在首次注册时创建
    if (!remWatcher.obs) {
        remWatcher.obs = new MutationObserver(onMutate);
        
        // 监听整个 document 的子树变更, 这是唯一能捕获任意位置元素被移除的方式
        remWatcher.obs.observe(document, { childList: true, subtree: true });
    }
};


/**
 * 遍历元素及其子树中的所有元素节点
 *
 * @param root - 遍历起点, 可以是元素、ShadowRoot 或文档片段
 * @param includeSelf - 是否包含起点元素本身
 * @param fn - 对每个元素执行的回调
 */
const walkElements = (root: Node, includeSelf: boolean, fn: (el: HTMLElement) => void): void => {
    if (includeSelf && root.nodeType === Node.ELEMENT_NODE) {
        const self = root as HTMLElement;
        fn(self);
        if (self.shadowRoot) walkElements(self.shadowRoot as unknown as Node, false, fn);
    }
    
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode() as HTMLElement | null;
    while (node !== null) {
        fn(node);
        if (node.shadowRoot) walkElements(node.shadowRoot as unknown as Node, false, fn);
        node = walker.nextNode() as HTMLElement | null;
    }
};


/**
 * 同步拆除元素及其子树, 立即执行清理回调并重置编译标记, 供 r-if 销毁模式与路由卸载
 *
 * @param root - 拆除的子树根元素
 * @param includeSelf - 是否同时拆除根元素自身的绑定, r-if 须保留自身以感知条件恢复
 */
export const teardownTree = (root: Node, includeSelf: boolean = true): void => {
    const targets: HTMLElement[] = [];
    walkElements(root, includeSelf, (el) => targets.push(el));
    
    for (let i = 0; i < targets.length; i++) {
        const el = targets[i];
        const cbs = remWatcher.elMap.get(el);
        
        if (cbs) {
            remWatcher.elMap.delete(el);
            remWatcher.count -= cbs.size;
            for (const cb of cbs) {
                try {
                    cb();
                } catch {
                    // 单个清理回调异常不影响其余回调
                }
            }
        }
        
        // 允许该元素在重新挂载时被再次编译
        delete (el as unknown as Record<string, unknown>).__processed;
    }
    
    // 没有待清理元素时释放 observer 资源
    if (remWatcher.count <= 0 && remWatcher.obs) {
        remWatcher.obs.disconnect();
        remWatcher.obs = null;
    }
};


/**
 * 重置元素及其子树的编译标记, 使整棵子树可重新编译
 *
 * @param root - 子树根元素
 */
export const resetTree = (root: Node): void => {
    walkElements(root, true, (el) => {
        delete (el as unknown as Record<string, unknown>).__processed;
    });
};


/**
 * 异步执行函数, 确保在浏览器渲染完成后执行
 *
 * @param fn - 要执行的函数
 * @returns 执行结果
 */
export const raf = (fn: any) => new Promise(r => requestFrame(() => r(fn())));
