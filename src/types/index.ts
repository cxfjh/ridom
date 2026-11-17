/**
 * @module types
 * @description 类型定义统一出口, 按领域拆分为独立模块, 便于按需引用
 */

export type { RefInterface, ReactiveInterface, DepInterface } from "./reactive.ts";
export type { DirectiveFn } from "./directive.ts";
export type { CompOptions } from "./component.ts";
export type { RouteInfo, RoutePageInfo, RouterInterface } from "./router.ts";
export type { RidomInterface } from "./ridom.ts";
