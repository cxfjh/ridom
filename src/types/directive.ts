import type { ReactiveInterface } from "./reactive.ts";


/**
 * 指令处理函数签名
 *
 * @param el - 指令绑定的 DOM 元素
 * @param expr - 指令表达式字符串
 * @param scope - 当前响应式作用域
 * @param deps - 依赖变量集合, 收集表达式中的变量引用
 * @returns void 或 Promise<void>, 异步指令
 */
export interface DirectiveFn {
    (el: HTMLElement, expr: string, scope: ReactiveInterface, deps: Set<string>): void | Promise<void>;
}
