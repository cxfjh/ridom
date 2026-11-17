import type { ReactiveInterface } from "../../types";
import { activeFns, depMap, elDeps } from "../../utils/shared.ts";
import { compile, parser } from "../../core";
import { regDir } from "../regDir.ts";
import { initDir, onElRemove } from "../../utils/lifecycle.ts";
import { emitUpdate } from "../../core";
import { Ridom } from "../../core/ridom.ts";
import { BODY_METHODS, fastEqual, moveChild } from "./utils.ts";


/**
 * 注册 r-api 指令
 *
 * @param el - 指令元素
 * @param expr - 表达式字符串, 解析后得到 API URL
 * @param scope - 指令作用域, 数据将注入到此作用域的扩展中
 * @param deps - 依赖项集合, 追踪表达式中的响应式变量
 */
regDir("r-api", async (el: HTMLElement, expr: string, scope: ReactiveInterface, deps: Set<string>): Promise<void> => {
    // 同一元素上的 r-api 指令仅执行一次
    if (!initDir(el, expr, scope, "r-api", "rApi")) return;
    
    // 数据状态管理
    let loaded = false;
    let data: unknown = null;
    let prevData: unknown = null;
    
    // 节点缓存, 保存编译后的真实节点, 重新挂载时直接搬运, 克隆会导致绑定丢失
    const cache = new Map<string, {nodes: Node[]; scope: ReactiveInterface}>();
    
    // 上一次渲染的有序 key 列表, 供快路径判定
    let prevOrder: string[] = [];
    
    // 缓存原始模板 HTML, 供创建新的模板实例
    const tplHTML = el.innerHTML;
    
    // 立刻清空模板子节点, 避免被外层 compile 用父作用域误编译
    el.replaceChildren();
    
    // 静态配置提取
    const keyAttr = el.getAttribute("key") || "id";           // 数组项的唯一标识字段, 默认 "id"
    const valueAttr = el.getAttribute("value") || "value";    // 数据值在作用域中的别名, 默认 "value"
    const indexAttr = el.getAttribute("index") || "index";    // 索引在作用域中的别名, 默认 "index"
    const listAttr = el.getAttribute("list");             // 从响应 JSON 中提取列表的路径, 如 "data.items"
    const arrAttr = el.getAttribute("arr");               // 数组数据在作用域中的变量名, 如 "users"
    const manualMode = el.hasAttribute("manual");           // 手动加载模式, 不自动发起请求
    
    // 动态配置解析
    const parseDynamicConfig = () => ({ refresh: parser.text(el.getAttribute("refresh") || "", scope, deps) });
    let config = parseDynamicConfig();
    
    /**
     * 创建 arr 模式的基础作用域
     *
     * @param d - 注入到作用域的数据, 赋值给 arrAttr 变量
     * @returns 新的响应式作用域对象
     */
    const createScope = (d: unknown) => {
        const base = Object.create(scope) as Record<string, unknown>;
        if (arrAttr) base[arrAttr] = d;
        base._manual = loaded;
        return Ridom.reactive(base);
    };
    
    // arr 模式的常驻作用域, 模板只编译一次
    let arrScope: ReactiveInterface | null = null;
    
    /**
     * arr 模式渲染
     *
     * @param d - 注入到 arrAttr 变量上的数组数据
     */
    const renderArr = (d: unknown): void => {
        if (arrScope === null) {
            arrScope = createScope(d);
            const tempContainer = document.createElement("div");
            tempContainer.innerHTML = tplHTML;
            compile(tempContainer, arrScope);
            const fragment = document.createDocumentFragment();
            moveChild(tempContainer, fragment);
            el.replaceChildren(fragment);
            return;
        }
        
        // 已编译, 只改作用域数据, 内部绑定自行完成增删改
        const s = arrScope as unknown as Record<string, unknown>;
        s[arrAttr as string] = d;
        s._manual = loaded;
    };
    
    /**
     * 创建一个条目的作用域与节点
     *
     * @param item - 数据项
     * @param index - 索引
     * @returns 包含节点数组和作用域对象的记录
     */
    const createItem = (item: unknown, index: number): {nodes: Node[]; scope: ReactiveInterface} => {
        const itemScope = Ridom.reactive({ ...scope, [valueAttr]: item, [indexAttr]: index, _manual: loaded });
        const tempContainer = document.createElement("div");
        tempContainer.innerHTML = tplHTML;
        compile(tempContainer, itemScope);
        return { nodes: Array.from(tempContainer.childNodes), scope: itemScope };
    };
    
    /**
     * 同步条目作用域数据, 响应式赋值会自动驱动该条目的 DOM 更新
     *
     * @param entry - 包含节点数组和作用域对象的记录
     * @param item - 当前项的数据
     * @param index - 当前项的索引
     */
    const syncItem = (entry: {scope: ReactiveInterface}, item: unknown, index: number): void => {
        entry.scope[valueAttr] = item;
        entry.scope[indexAttr] = index;
        (entry.scope as unknown as Record<string, unknown>)._manual = loaded;
    };
    
    /**
     * 取条目并搬运到目标片段, 缺失则新建, 命中则同步作用域数据
     *
     * @param key - 条目的 key
     * @param item - 当前项的数据
     * @param index - 当前项的索引
     * @param fragment - 目标 DocumentFragment
     */
    const takeItem = (key: string, item: unknown, index: number, fragment: DocumentFragment): void => {
        let entry = cache.get(key);
        if (entry === undefined) {
            entry = createItem(item, index);
            cache.set(key, entry);
        } else syncItem(entry, item, index);
        const nodes = entry.nodes;
        for (let i = 0; i < nodes.length; i++) fragment.appendChild(nodes[i]);
    };
    
    
    /**
     * 渲染数组数据, 缓存编译后的真实节点做增量渲染, 克隆副本会丢失 WeakMap 绑定导致项失去响应性
     *
     * @param arr - 要渲染的数组
     */
    const renderArray = (arr: unknown[]): void => {
        const len = arr.length;
        const nextKeys: string[] = new Array(len);
        let allCached = true;
        
        for (let i = 0; i < len; i++) {
            const item = arr[i] as Record<string, unknown> | null;
            const key = String(item?.[keyAttr] ?? i);
            nextKeys[i] = key;
            if (allCached && !cache.has(key)) allCached = false;
        }
        
        // 快路径, key 序列未变, 只同步作用域, 零 DOM 操作
        if (allCached && prevOrder.length === len) {
            let sameOrder = true;
            for (let i = 0; i < len; i++) {
                if (prevOrder[i] !== nextKeys[i]) {
                    sameOrder = false;
                    break;
                }
            }
            
            if (sameOrder) {
                for (let i = 0; i < len; i++) syncItem(cache.get(nextKeys[i])!, arr[i], i);
                return;
            }
        }
        
        // 快路径, 纯追加, 已有节点原地不动
        if (prevOrder.length > 0 && prevOrder.length < len) {
            let isPrefix = true;
            for (let i = 0; i < prevOrder.length; i++) {
                if (prevOrder[i] !== nextKeys[i]) {
                    isPrefix = false;
                    break;
                }
            }
            
            if (isPrefix) {
                for (let i = 0; i < prevOrder.length; i++) syncItem(cache.get(prevOrder[i])!, arr[i], i);
                const fragment = document.createDocumentFragment();
                for (let i = prevOrder.length; i < len; i++) takeItem(nextKeys[i], arr[i], i, fragment);
                el.appendChild(fragment);
                prevOrder = nextKeys;
                return;
            }
        }
        
        // 通用路径, 顺序变化, 按新顺序重建
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < len; i++) takeItem(nextKeys[i], arr[i], i, fragment);
        
        const keep = new Set(nextKeys);
        for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key);
        
        prevOrder = nextKeys;
        el.replaceChildren(fragment);
    };
    
    /**
     * 渲染对象数据, 单次模板实例化
     *
     * @param obj - 要渲染的对象, 会作为 value 属性注入到作用域
     */
    const renderObject = (obj: unknown): void => {
        const objScope = Ridom.reactive({ ...scope, [valueAttr]: obj, _manual: loaded });
        const tempContainer = document.createElement("div");
        tempContainer.innerHTML = tplHTML;
        compile(tempContainer, objScope);
        const fragment = document.createDocumentFragment();
        moveChild(tempContainer, fragment);
        el.replaceChildren(fragment);
        prevOrder = [];
    };
    
    /**
     * 渲染函数
     *
     * @param d - 要渲染的数据, 可是数组, 对象, null 或 undefined
     */
    const render = (d: unknown): void => {
        // 快速深度比较 数据未变化时跳过渲染, 避免不必要的 DOM 操作
        if (fastEqual(d, prevData)) return;
        
        if (arrAttr) {
            // arr 模式, 复用首次编译好的子树, 只更新作用域数据
            renderArr(d);
        } else if (Array.isArray(d)) {
            renderArray(d);
        } else if (d && typeof d === "object") {
            renderObject(d);
        } else {
            // 空数据, 清空内容
            el.replaceChildren();
            prevOrder = [];
        }
        
        prevData = d;
    };
    
    /**
     * 发起 API 请求并渲染结果
     */
    const fetchData = async (): Promise<void> => {
        // 重新解析动态配置, 确保 method 和 refresh 反映最新的响应式值
        config = parseDynamicConfig();
        
        // 请求中状态, loaded=false, 模板可通过 _manual 显示加载中 UI
        loaded = false;
        render(data);
        
        try {
            // URL 以 / 开头直接当字面量, 否则会按正则字面量解析报错
            const rawUrl = expr.trim();
            const url = rawUrl.startsWith("/") ? rawUrl : String(parser.parse(rawUrl, scope, deps));
            if (!url) new Error("API URL 不能为空");
            
            // method 缺省时不要走表达式解析, 否则 "GET" 会被当成未定义变量并每次都打一条警告
            const methodAttr = el.getAttribute("method");
            const method = methodAttr ? String(parser.parse(methodAttr, scope, deps)) : "GET";
            
            // 构建请求体, 仅 POST/PUT/PATCH 方法携带 body
            const hasBody = BODY_METHODS.has(method);
            const body = hasBody ? JSON.stringify(parser.parse(el.getAttribute("data-body") || "{}", scope, deps)) : null;
            
            // 请求头, 支持表达式, 默认 Content-Type: application/json
            const headers = parser.parse(el.getAttribute("headers") || "{'Content-Type': 'application/json'}", scope, deps) as HeadersInit;
            const response = await fetch(url, { method, headers, body });
            
            // 处理非 2xx 响应状态
            if (!response.ok) new Error(`请求失败: ${ response.status } ${ response.statusText }`);
            
            // 解析 JSON 响应体
            const resData = await response.json();
            
            // 如果指定了 list 属性, 从响应中提取嵌套的列表数据
            data = listAttr ? (resData as Record<string, unknown>)[listAttr] : resData;
            
            // 请求成功, 更新数据并渲染
            loaded = true;
            render(data);
        } catch (error) {
            console.error("[r-api] 请求错误:", (error as Error).message);
            // 异常时仍设置 loaded = true, 避免永久显示加载中状态
            loaded = true;
            render(data);
        }
    };
    
    /**
     * 手动加载模式的初始渲染
     */
    const init = (): void => {
        // 创建初始作用域
        const initScope = createScope(null);
        const fragment = document.createDocumentFragment();
        const itemFragment = document.createDocumentFragment();
        
        // 克隆子节点到 itemFragment, 保留原始模板结构
        const children = el.childNodes;
        for (let i = 0; i < children.length; i++) itemFragment.appendChild(children[i].cloneNode(true));
        fragment.appendChild(itemFragment);
        
        // 在 activeFns 上下文中编译, 确保依赖收集正确
        activeFns.push((): void => compile(fragment as unknown as HTMLElement, initScope));
        try {
            activeFns[activeFns.length - 1]();
        } finally {
            activeFns.pop(); // 编译完成后弹出, 依赖已收集完毕
        }
        
        // 清空旧节点缓存, 追加编译后的内容
        el.textContent = "";
        el.appendChild(fragment);
        
        // 渲染空状态
        render(null);
    };
    
    // 刷新按钮绑定
    const refreshSelector = config.refresh;
    if (refreshSelector) {
        // 使用 document.querySelector 查找刷新按钮
        const refreshBtn = document.querySelector(refreshSelector);
        
        // 防止重复绑定, 使用 __apiRefreshHandler 标记
        if (refreshBtn && !(refreshBtn as unknown as Record<string, unknown>).__apiRefreshHandler) {
            const refreshHandler = async () => await fetchData();
            (refreshBtn as unknown as Record<string, unknown>).__apiRefreshHandler = refreshHandler;
            refreshBtn.addEventListener("click", refreshHandler as EventListener);
            
            // 元素移除时自动解绑刷新按钮事件
            onElRemove(el, () => {
                refreshBtn.removeEventListener("click", refreshHandler as EventListener);
                (refreshBtn as unknown as Record<string, unknown>).__apiRefreshHandler = undefined;
            });
        }
    }
    
    // 首次执行并依赖收集
    activeFns.push(fetchData);
    try {
        if (manualMode) init(); // 手动模式, 仅渲染空模板, 不发起请求
        else await fetchData(); // 自动模式, 立即发起请求, 渲染数据
    } catch (error) {
        console.error("[r-api] 初始化错误:", (error as Error).message);
        el.textContent = "";
    } finally {
        activeFns.pop();
    }
    
    // 登记到外层收集上下文, 作为 r-for 条目的一部分时, 条目数据变化要重新请求
    emitUpdate(fetchData);
    
    // 元素移除时清理
    onElRemove(el, () => {
        // 清空节点缓存, 释放内存
        cache.clear();
        prevOrder = [];
        arrScope = null;
        
        // 从依赖管理器中取消订阅, 防止内存泄漏
        const depsSet = elDeps.get(el);
        if (depsSet) {
            depsSet.forEach(varName => depMap.get(scope)?.unsubscribe(fetchData, varName));
            elDeps.delete(el);
        }
        
        // 清空数据引用, 帮助 GC
        data = null;
        prevData = null;
    });
});
