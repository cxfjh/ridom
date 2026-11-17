import type { DepInterface } from "../types";
import { batch } from "./batch.ts";


/**
 * 订阅追踪栈
 */
const trackFns: Function[] = [];
const trackSets: Array<Set<Dep> | undefined> = [];


/**
 * 开始追踪指定函数的订阅关系
 *
 * @param fn - 待追踪的函数
 * @param deps - 复用的结果集合, 缺省时在首次真正订阅处创建; 传入已有集合可跨多次执行累积
 */
export const beginTrack = (fn: Function, deps?: Set<Dep>): void => {
    trackFns.push(fn);
    trackSets.push(deps);
};


/**
 * 结束最近一次追踪
 *
 * @returns 本次追踪收集到的集合; 全程没有发生订阅时为 `undefined`
 */
export const endTrack = (): Set<Dep> | undefined => {
    trackFns.pop();
    return trackSets.pop();
};


/**
 * 依赖管理类
 */
export class Dep implements DepInterface {
    /**
     * 全量订阅者集合, 仅存放"未指定变量"的订阅者
     */
    subs?: Set<Function>;
    
    /**
     * 按变量名分组的精准订阅者映射表
     */
    varSubs: Map<string, Set<Function>> = new Map();
    
    /**
     * 通知禁用标志
     */
    _paused: boolean | undefined;
    
    /**
     * 添加订阅者函数
     *
     * @param fn - 订阅函数, 数据变化时将被 `notify` 调度执行
     * @param variable - 可选的变量名字符串, 指定后建立精准订阅关系
     */
    subscribe(fn: Function, variable: string | null = null): void {
        // 类型守卫, 非函数类型静默忽略
        if (typeof fn !== "function") return;
        
        // 处于追踪状态且被追踪函数就是 fn 时记录订阅, 平行数组入栈避免临时对象
        const top = trackFns.length - 1;
        if (top >= 0 && trackFns[top] === fn) {
            let tracked = trackSets[top];
            if (tracked === undefined) trackSets[top] = tracked = new Set<Dep>();
            tracked.add(this);
        }
        
        // 具名订阅只进入精准集合, 全量通知时再统一遍历 varSubs
        if (variable) {
            let set = this.varSubs.get(variable);
            if (set === undefined) {
                set = new Set<Function>();
                this.varSubs.set(variable, set);
            }
            set.add(fn);
            return;
        }
        
        // 未指定变量: 加入全量订阅者集合
        (this.subs ??= new Set<Function>()).add(fn);
    }
    
    /**
     * 通知订阅者执行更新
     *
     * @param variable - 可选的变量名, 指定后尝试精准通知, 未指定或变量无订阅者时全量通知
     */
    notify(variable: string | null = null): void {
        // 指定变量, 只通知该变量的订阅者, 找不到订阅者说明该键无人关心, 直接返回, 不能退化为全量通知
        if (variable !== null) {
            const precise = this.varSubs.get(variable);
            if (precise === undefined) return;
            for (const fn of precise) batch.add(fn);
            return;
        }
        
        // 不指定变量时全量通知, 具名订阅分散在 varSubs 中须一并遍历
        if (this.subs !== undefined) for (const fn of this.subs) batch.add(fn);
        for (const set of this.varSubs.values()) for (const fn of set) batch.add(fn);
    }
    
    /**
     * 移除订阅者函数
     *
     * @param fn - 要移除的订阅函数, 非函数类型会被静默忽略
     * @param variable - 可选的变量名, 指定后仅从该变量的精准集合中移除
     */
    unsubscribe(fn: Function, variable: string | null = null): void {
        // 类型守卫, 非函数类型静默忽略
        if (typeof fn !== "function") return;
        
        // 从全量订阅者集合中移除
        this.subs?.delete(fn);
        
        if (variable && this.varSubs.has(variable)) {
            // 指定变量名, 从对应变量的精准订阅者集合中移除
            const targetSubs = this.varSubs.get(variable)!;
            targetSubs.delete(fn);
            
            // 订阅者集合为空时清理该条目, 防止 Map 中积累空 Set
            if (targetSubs.size === 0) this.varSubs.delete(variable);
        } else if (!variable) {
            // 未指定变量名, 从所有变量的精准订阅者映射中移除该函数
            for (const [_, entrySubs] of this.varSubs) entrySubs.delete(fn);
            
            // 清理所有已空的变量订阅者条目
            for (const [varName, entrySubs] of this.varSubs) if (entrySubs.size === 0) this.varSubs.delete(varName);
        }
    }
}
