import type { ReactiveInterface } from "../types";


/**
 * 创建 r-for 循环项作用域, 仅含 index 与 value 两个普通可写属性
 *
 * @param parent - 父作用域, 通过原型链继承, 不拷贝键
 * @param data - 本作用域自有的键值对
 * @returns 仅具普通读写能力的作用域对象
 */
export const createItemScope = (parent: object, data: Record<string, unknown>): ReactiveInterface => {
    const scope = Object.create(parent) as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) Object.defineProperty(scope, key, { value, writable: true, enumerable: true, configurable: true });
    return scope as ReactiveInterface;
};
