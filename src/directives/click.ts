import type { ReactiveInterface } from "../types";
import { EVENT_MAP, KEY_MAP, VARIABLE_REGEX } from "../utils/constants.ts";
import { regDir } from "./regDir.ts";
import { getKeys } from "../utils/keys.ts";
import { initDir, onElRemove } from "../utils/lifecycle.ts";


/**
 * 注册 r-click 指令
 *
 * @param el - 绑定事件的 DOM 元素
 * @param expr - 事件表达式, JavaScript 代码字符串
 * @param scope - 当前数据作用域, 其属性会作为参数注入到编译后的函数中
 */
regDir("r-click", (el: HTMLElement, expr: string, scope: ReactiveInterface): void => {
    // 防重复处理
    if (!initDir(el, expr, scope, "r-click", "rClick")) return;
    const elProps = el as unknown as Record<string, unknown>;
    
    // 事件类型检测
    let type = "click";
    for (let i = 0; i < EVENT_ENTRIES.length; i++) {
        if (el.hasAttribute(EVENT_ENTRIES[i][0])) {
            type = EVENT_ENTRIES[i][1];
            break;
        }
    }
    
    // 键盘事件按键过滤
    const isKey = type.startsWith("key");
    const targetKey = isKey ? (el.getAttribute(type)?.toLowerCase() || null) : null;
    
    // 避免 compile 重复执行时多次注册事件监听器
    if (elProps.__clickEventType === type && elProps.__clickCode === expr) return;
    
    /**
     * 清理旧事件处理器
     */
    const cleanup = (): void => {
        if (elProps.__clickHandler) {
            el.removeEventListener(elProps.__clickEventType as string, elProps.__clickHandler as EventListener);
            elProps.__clickHandler = undefined;
            elProps.__clickFn = undefined;
            elProps.__clickEventType = undefined;
            elProps.__clickCode = undefined;
            elProps.__clickRDataEl = undefined;
        }
    };
    
    cleanup();
    
    // 表达式编译, 只把表达式实际引用到的作用域名作为形参, 避免深层作用域下每次点击都构造一个大数组并逐个读取
    const scopeKeys = getUsedKeys(scope, expr).filter((key) => key !== EVENT_PARAM);
    let compiledFn: Function;
    try {
        compiledFn = new Function(...scopeKeys, EVENT_PARAM, `"use strict"; ${ expr }`);
    } catch (err) {
        console.error(`[r-click] ${ type } 编译错误:`, (err as Error).message);
        return;
    }
    
    // 缓存编译后的函数, 供后续事件触发时执行
    elProps.__clickFn = compiledFn;
    elProps.__clickCode = expr;
    
    /**
     * 事件处理器
     *
     * @param event - 原生 DOM 事件对象, 同时以 `$e` 的形式注入表达式
     */
    const handler = (event: Event): void => {
        const evt = event as KeyboardEvent | MouseEvent;
        
        // 键盘事件按键过滤
        if (isKey && targetKey) {
            // 用 KEY_MAP 做别名映射
            const normKey = KEY_MAP[targetKey] || targetKey;
            const evtKey = (evt as KeyboardEvent).key;
            
            // 双重匹配
            if (evtKey.toLowerCase() !== normKey.toLowerCase() && evtKey !== normKey) return;
            if (type === "keydown" && evtKey === "Enter" && (evt.target as HTMLElement).tagName !== "TEXTAREA") event.preventDefault();
        }
        
        // 右键菜单阻止默认行为
        if (type === "contextmenu") event.preventDefault();
        
        // 从 scope 读取最新值, 末尾补上事件对象, 对应形参 $e
        const scopeLen = scopeKeys.length;
        const values = new Array(scopeLen + 1);
        for (let i = 0; i < scopeLen; i++) values[i] = scope[scopeKeys[i]];
        values[scopeLen] = event;
        
        // r-data 作用域注入, 作为事件处理函数的 this
        let rDataEl = elProps.__clickRDataEl as HTMLElement | null | undefined;
        if (rDataEl === undefined) {
            rDataEl = findRDataParent(el);
            elProps.__clickRDataEl = rDataEl || null; // null 标记"已查找但未找到"
        }
        
        // 执行表达式, this 指向最近的 r-data 作用域, 无 r-data 时为 undefined
        try {
            compiledFn.apply(rDataEl ? (rDataEl as unknown as Record<string, unknown>)._data : undefined, values);
        } catch (error) {
            console.error("[r-click] 执行错误:", error);
        }
    };
    
    // 缓存事件处理器和事件类型, 供后续清理和防重复绑定
    elProps.__clickHandler = handler;
    elProps.__clickEventType = type;
    
    // 注册事件监听
    el.addEventListener(type, handler, { passive: !NON_PASSIVE_EVENTS.has(type) });
    
    // 元素移除时自动清理事件监听器, 防止内存泄漏
    onElRemove(el, cleanup);
});


// EVENT_MAP 预提取 entries
const EVENT_ENTRIES = Object.entries(EVENT_MAP);


// 事件对象在表达式里的保留形参名
const EVENT_PARAM = "$e";


// 非 passive 模式的事件类型集合
const NON_PASSIVE_EVENTS = new Set(["contextmenu", "keydown", "keyup"]);


/**
 * 向上查找最近带有 r-data 属性的祖先节点
 *
 * @param el - 起始元素, 从此元素开始向上查找
 * @returns 找到的 r-data 祖先节点, 未找到返回 `null`
 */
const findRDataParent = (el: HTMLElement | null): HTMLElement | null => {
    let current = el;
    while (current && current !== document.body) {
        if (current.hasAttribute("r-data")) return current;
        current = current.parentElement;
    }
    if (current === document.body && current.hasAttribute("r-data")) return current;
    return null;
};


/**
 * 从作用域中筛出表达式实际引用到的键
 *
 * @param scope - 当前作用域
 * @param expr - 事件表达式
 * @returns 作为形参传入的键名列表
 */
const getUsedKeys = (scope: object, expr: string): string[] => {
    const allKeys = getKeys(scope);
    
    // 静态提取表达式中的根变量名
    const used = new Set<string>();
    const found = expr.match(VARIABLE_REGEX) || [];
    
    for (let i = 0; i < found.length; i++) {
        const v = found[i];
        const dotIdx = v.indexOf(".");
        used.add(dotIdx === -1 ? v : v.slice(0, dotIdx));
    }
    
    // 保持作用域中的原始顺序, 保证形参与取值一一对应
    const params: string[] = [];
    for (let i = 0; i < allKeys.length; i++) if (used.has(allKeys[i])) params.push(allKeys[i]);
    return params;
};
