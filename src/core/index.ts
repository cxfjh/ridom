/**
 * @module core
 * @description 核心模块统一导出, 按依赖层级自底向上排列
 */
export { Dep, beginTrack, endTrack } from "./dep.ts";
export { batch } from "./batch.ts";
export { ref } from "./ref.ts";
export { reactive } from "./reactive.ts";
export { watch } from "./watch.ts";
export { parser } from "./parser.ts";
export { bind, bindText, compile, rebind, collectUpdates, emitUpdate } from "./compile.ts";
export { comp } from "./comp/index.ts";