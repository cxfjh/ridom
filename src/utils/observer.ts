import { hasInterp } from "./constants.ts";
import { dirs, rootScope } from "./shared.ts";
import { batch, compile, rebind } from "../core";


/**
 * 全局 DOM 变更监听器, 新增节点自动编译, 指令属性变更自动增量重绑
 */
let _observer: MutationObserver | null = null;


/**
 * 创建全局观察器
 */
const createObserver = (): MutationObserver => new MutationObserver((mutations) => {
    const toProcess = new Set<HTMLElement>();
    const toRebind = new Set<HTMLElement>();
    
    mutations.forEach(mutation => {
        // 处理新增节点, 仅收集尚未编译的元素, 已编译元素 compile 会直接早退
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (!(node as unknown as Record<string, unknown>).__processed) toProcess.add(node as HTMLElement);
            } else if (node.nodeType === Node.TEXT_NODE && hasInterp(node.textContent || "")) {
                if (node.parentNode) toProcess.add(node.parentNode as HTMLElement);
            }
        });
        
        // 指令属性变更, 元素已编译过, 走增量重新绑定, compile 对已处理元素会直接早退
        if (mutation.type === "attributes") {
            const target = mutation.target as HTMLElement;
            if (dirs.has(mutation.attributeName || "")) toRebind.add(target);
        }
    });
    
    // 没有任何待处理节点时直接返回, 避免每帧创建一个空批次任务
    if (toProcess.size === 0 && toRebind.size === 0) return;
    
    // 批量处理变化的元素, 通过 batch 合并同一帧内的多次变更
    batch.add(() => {
        toProcess.forEach(el => compile(el, rootScope!));
        toRebind.forEach(el => rebind(el, rootScope!));
    });
});


/**
 * 全局 DOM 变更监听器, 首次调用 `observe` 时才真正创建
 */
export const observer = {
    /**
     * 开始监听目标节点
     *
     * @param target - 监听的根节点
     * @param options - MutationObserver 配置
     */
    observe(target: Node, options?: MutationObserverInit): void {
        if (typeof MutationObserver === "undefined") return;
        if (_observer === null) _observer = createObserver();
        _observer.observe(target, options);
    },
    
    /**
     * 停止监听并释放观察器
     */
    disconnect(): void {
        if (_observer !== null) {
            _observer.disconnect();
            _observer = null;
        }
    },
};
