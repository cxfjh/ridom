import { deadFns, requestFrame } from "../utils/shared.ts";


/**
 * 批量更新管理器
 */
export const batch: BatchInterface = {
    /**
     * 待执行的更新函数队列
     */
    _queue: new Set<Function>(),
    
    /**
     * 批次执行状态标志
     */
    _pending: false,
    
    /**
     * 将更新函数加入执行队列
     *
     * @param fn - 待延迟执行的更新函数
     */
    add(fn: Function): void {
        if (typeof fn !== "function") return;
        this._queue.add(fn);
        if (!this._pending) this._schedule();
    },
    
    /**
     * 调度批次执行下一帧
     */
    _schedule(): void {
        this._pending = true;
        requestFrame(() => this._execute());
    },
    
    /**
     * 执行队列中的所有更新函数
     */
    _execute(): void {
        // 创建队列快照并清空原队列
        const snapshot = new Set(this._queue);
        this._queue.clear();
        
        // 先复位批次标志, 执行中产生的新更新才能被重新调度, 否则会滞留
        this._pending = false;
        
        // 逐个执行更新函数, 异常隔离
        snapshot.forEach((fn: Function): void => {
            // 元素已拆除的更新函数直接丢弃, 避免它在下一帧重新订阅已清理的依赖
            if (deadFns.has(fn)) return;
            try {
                fn.call(null);
            } catch (e) {
                console.error("[batch] 更新执行失败: ", e, "关联函数: ", fn);
            }
        });
        
        // 兜底执行期间入队但未触发调度的更新, 安排到下一帧
        if (this._queue.size > 0 && !this._pending) this._schedule();
    },
};


/**
 * 批量更新管理器接口
 */
export interface BatchInterface {
    /**
     * 待执行的更新函数队列
     */
    _queue: Set<Function>;
    
    /**
     * 批次执行状态标志
     */
    _pending: boolean;
    
    
    /**
     * 将更新函数添加到队列
     */
    add(fn: Function): void;
    
    
    /**
     * 调度下一帧执行队列
     */
    _schedule(): void;
    
    
    /**
     * 执行队列中的所有更新函数
     */
    _execute(): void;
}
