import type { ReactiveInterface } from "../types";
import { activeFns, deadFns, depMap, elDeps } from "../utils/shared.ts";
import { regDir } from "./regDir.ts";
import { initDir, onElRemove } from "../utils/lifecycle.ts";
import { beginTrack, endTrack, emitUpdate } from "../core";
import type { Dep } from "../core";
import { Ridom } from "../core/ridom.ts";


/**
 * 注册 r-model 指令
 *
 * @param el - 表单控件元素 a
 * @param expr - 模型路径表达式
 * @param scope - 当前数据作用域
 */
regDir("r-model", (el: HTMLElement, expr: string, scope: ReactiveInterface): void => {
    if (!initDir(el, expr, scope, "r-model", "rModel")) return;
    
    // 提前检测控件类型, 后续在 updateView 和 updateModel 中分支处理
    const inputEl = el as HTMLInputElement;
    const selectEl = el as HTMLSelectElement;
    const isCheckbox = inputEl.type === "checkbox";
    const isRadio = inputEl.type === "radio";
    
    /**
     * 解析模型路径
     *
     * @param path - 模型路径表达式
     * @param currentScope - 当前数据作用域
     * @returns 包含 getter 和 setter 的对象
     */
    const resolvePath = (path: string, currentScope: ReactiveInterface): {get: () => unknown; set: (v: unknown) => void} => {
        const dotIdx = path.indexOf(".");
        const scopeRec = currentScope as unknown as Record<string, unknown>;
        
        // 单段路径快路径
        if (dotIdx === -1) {
            return {
                get: (): unknown => {
                    const val = scopeRec[path];
                    return (val as Record<string, unknown> | undefined)?.__isRef ? (val as Record<string, unknown>).value : val;
                },
                
                set: (newValue: unknown): void => {
                    const cur = scopeRec[path];
                    if ((cur as Record<string, unknown> | undefined)?.__isRef) (cur as Record<string, unknown>).value = newValue;
                    else scopeRec[path] = newValue;
                },
            };
        }
        
        // 多段路径
        const segments = path.split(".");
        
        /**
         * 导航到倒数第二级的目标对象
         *
         * @returns 目标对象, 倒数第二级 或 null, 路径无效
         */
        const navToParent = (): Record<string, unknown> | null => {
            let target = scopeRec;
            for (let i = 0, end = segments.length - 1; i < end; i++) {
                const seg = segments[i];
                const segVal = target[seg] as Record<string, unknown> | undefined;
                if (segVal?.__isRef) target = segVal.value as unknown as Record<string, unknown>;
                else if (segVal?.__isReactive) target = segVal;
                else return null;  // 路径中断, 返回 null 表示无法继续导航
            }
            return target;
        };
        
        // 最后一级键名
        const lastKey = segments[segments.length - 1];
        
        return {
            get: (): unknown => {
                const parent = navToParent();
                if (!parent) return undefined;  // 路径无效, 返回 undefined
                const val = parent[lastKey];
                return (val as Record<string, unknown> | undefined)?.__isRef ? (val as Record<string, unknown>).value : val;
            },
            
            set: (newValue: unknown): void => {
                let target = scopeRec;
                
                // 导航到倒数第二级, 如果中间路径不存在则自动创建响应式对象
                for (let i = 0, end = segments.length - 1; i < end; i++) {
                    const seg = segments[i];
                    const segVal = target[seg] as Record<string, unknown> | undefined;
                    if (segVal?.__isRef) target = segVal.value as unknown as Record<string, unknown>;
                    else if (segVal?.__isReactive) target = segVal;
                    else {
                        // 中间路径不存在自动创建响应式对象
                        target[seg] = Ridom.reactive({});
                        target = target[seg] as unknown as Record<string, unknown>;
                    }
                }
                
                // 设置最终目标键值对, 处理 Ref 包装
                const cur = target[lastKey];
                if ((cur as Record<string, unknown> | undefined)?.__isRef) (cur as Record<string, unknown>).value = newValue;
                else target[lastKey] = newValue;
            },
        };
    };
    
    // 解析模型路径, 获取标准化的 getter/setter
    const { get: getVal, set: setVal } = resolvePath(expr, scope);
    
    /**
     * DOM 初始值回填
     */
    {
        const modelValue = getVal();
        const isEmpty = modelValue === undefined || modelValue === null || modelValue === "";
        
        if (isEmpty) {
            if (isCheckbox) {
                // checkbox, 以 DOM 的 checked 状态为准
                if (inputEl.checked) setVal(true);
            } else if (isRadio) {
                // radio, 如果当前被选中, 回写其 value
                if (inputEl.checked) setVal(inputEl.value);
            } else if (el.tagName === "SELECT") {
                // select, 回写当前选中的 option 值
                if (selectEl.value) setVal(selectEl.value);
            } else {
                // text/number/textarea, 回写 value 属性值
                if (inputEl.value) setVal(inputEl.value);
            }
        }
    }
    
    /**
     * 数据变化时同步到 DOM
     */
    const updateView = (): void => {
        const modelValue = getVal();
        if (isCheckbox) {
            // checkbox 模型值 -> checked 属性
            if (inputEl.checked !== !!modelValue) inputEl.checked = !!modelValue;
        } else if (isRadio) {
            // radio 模型值匹配当前 radio 的 value 时设为选中
            const checked = inputEl.value === modelValue;
            if (inputEl.checked !== checked) inputEl.checked = checked;
        } else {
            // text/number/select/textarea, 模型值 -> 字符串
            const strVal = modelValue != null ? String(modelValue) : "";
            if (el.tagName === "SELECT") {
                if (selectEl.value !== strVal) selectEl.value = strVal;
            } else if (inputEl.value !== strVal) inputEl.value = strVal;
        }
    };
    
    
    /**
     * 用户输入时同步到响应式数据
     */
    const updateModel = (): void => {
        let newValue: unknown;
        if (isCheckbox) newValue = inputEl.checked;
        else if (isRadio) {
            // radio 仅在被选中时写入, 取消选中的 radio 跳过
            if (!inputEl.checked) return;
            newValue = inputEl.value;
        } else if (el.tagName === "SELECT") newValue = selectEl.value;
        else newValue = inputEl.type === "number" && !isNaN(inputEl.valueAsNumber) ? inputEl.valueAsNumber : inputEl.value;
        if (getVal() !== newValue) setVal(newValue);
    };
    
    // 事件类型选择
    const eventType = el.tagName === "SELECT" || CHANGE_TYPES.has(inputEl.type) ? "change" : "input";
    
    // 事件处理器管理
    const elMap = el as unknown as Record<string, unknown>;
    if (elMap.__modelHandler) el.removeEventListener(elMap.__modelEventType as string, elMap.__modelHandler as EventListener);
    elMap.__modelHandler = updateModel;
    elMap.__modelEventType = eventType;
    el.addEventListener(eventType, updateModel);
    
    // 本次绑定订阅到的 Dep 集合, 销毁时逐个反订阅
    let trackedDeps: Set<Dep> | undefined;
    
    /**
     * 依赖收集并首次同步
     */
    activeFns.push(updateView);
    beginTrack(updateView, trackedDeps);
    try {
        updateView();
    } finally {
        activeFns.pop();
        const tracked = endTrack();
        if (tracked !== undefined) trackedDeps = tracked;
    }
    
    // 登记到外层收集上下文, 作为 r-for 条目的一部分时, 条目数据变化要重算视图
    emitUpdate(updateView);
    
    /**
     * 元素移除时完整清理
     *
     * @param el - 指令绑定的 DOM 元素
     */
    onElRemove(el, () => {
        deadFns.add(updateView);
        
        // 移除 DOM 事件监听器, 防止内存泄漏
        if (elMap.__modelHandler) {
            el.removeEventListener(elMap.__modelEventType as string, elMap.__modelHandler as EventListener);
            elMap.__modelHandler = null;
            elMap.__modelEventType = null;
        }
        
        // 取消依赖订阅模型变化不再驱动 updateView
        if (trackedDeps !== undefined) {
            for (const dep of trackedDeps) dep.unsubscribe(updateView);
            trackedDeps.clear();
        }
        
        const depSet = elDeps.get(el);
        if (depSet) {
            depSet.forEach(varName => depMap.get(scope)?.unsubscribe(updateView, varName));
            elDeps.delete(el);
        }
        
        // 重置处理标记, 允许 SPA 路由返回时重新绑定 r-model
        (elMap as Record<string, unknown>).__rModelProcessed = false;
    });
});


// 使用 change 事件类型的表单控件类型集合
const CHANGE_TYPES = new Set(["checkbox", "radio"]);
