import type { ReactiveInterface } from "../types";
import { activeFns, deadFns, depMap, elDeps } from "../utils/shared.ts";
import { beginTrack, collectUpdates, compile, endTrack, emitUpdate, parser } from "../core";
import type { Dep } from "../core";
import { regDir } from "./regDir.ts";
import { initDir, onElRemove } from "../utils/lifecycle.ts";
import { createItemScope } from "../utils/scope.ts";


/**
 * 循环条目
 */
interface Entry {
    /** 该条目的根节点, 模板可能有多个根节点 */
    nodes: Node[];
    
    /** 该条目的作用域, 只含 index / value 两个普通属性 */
    scope: ReactiveInterface;
    
    /** 编译期收集到的更新函数 */
    updates: Function[];
    
    /** 当前渲染的值, 用于判断是否需要重算 */
    value: unknown;
    
    /** 当前渲染的索引, 用于判断是否需要重算 */
    index: number;
}


/**
 * 循环条目容器上的属性, 不下发到条目容器
 */
const SKIP_ATTRS = new Set(["r-for", "index", "value", "key", "start", "shallow", "class", "style"]);


/**
 * 对象类型数组项的临时 ID 映射表
 */
const objIdMap = new WeakMap<object, number>();


/**
 * 注册 r-for 指令
 *
 * @param el - 挂载目标元素, 组件将被渲染到此元素内部
 * @param expr - 循环表达式
 * @param scope - 当前数据作用域, 供 props 表达式解析和组件工厂查找
 * @param deps - 依赖收集容器, 追踪 props 中引用的响应式变量
 */
regDir("r-for", (el: HTMLElement, expr: string, scope: ReactiveInterface, deps: Set<string>): void => {
    if (!initDir(el, expr, scope, "r-for", "rFor")) return;
    
    // 缓存原始模板, 后续更新不再从 DOM 读取
    const tplHTML = el.innerHTML.trim();
    if (!tplHTML) return void console.warn("[r-for] 模板不能为空");
    
    const indexVar = el.getAttribute("index") || "index";     // 索引变量名
    const valueVar = el.getAttribute("value") || "value";     // 值变量名
    const keyAttr = el.getAttribute("key") || "id";           // 唯一标识字段
    const startOffset = parseInt(el.getAttribute("start") || "0", 10) || 0;
    
    // 缓存元素上的基础属性, 每个条目容器都要带上
    const baseAttrs: Array<[string, string]> = [];
    const attrList = el.attributes;
    for (let i = 0; i < attrList.length; i++) {
        const { name, value } = attrList[i];
        if (SKIP_ATTRS.has(name)) continue;
        baseAttrs.push([name, parser.text(value.trim(), scope, deps)]);
    }
    
    const cls = el.className.trim();
    const style = el.style.cssText.trim();
    
    // 模板片段缓存, 首次解析后复用, 每个条目只做 cloneNode
    let tplFrag: DocumentFragment | null = null;
    const cloneTpl = (): DocumentFragment => {
        if (tplFrag === null) {
            const box = document.createElement("div");
            box.innerHTML = tplHTML;
            tplFrag = document.createDocumentFragment();
            tplFrag.append(...box.childNodes);
        }
        
        return tplFrag.cloneNode(true) as DocumentFragment;
    };
    
    // 对象项的临时 id 计数器
    let nextObjId = 0;
    
    /**
     * 生成数组项的唯一 key
     *
     * @param item - 数组项
     * @param index - 索引, 仅基础类型使用
     * @returns 唯一标识字符串
     */
    const getKey = (item: unknown, index: number): string => {
        if (item !== null && typeof item === "object") {
            const keyVal = (item as Record<string, unknown>)[keyAttr];
            if (keyVal !== undefined) return String(keyVal);
            let id = objIdMap.get(item);
            if (id === undefined) objIdMap.set(item, id = nextObjId++);
            return "$" + id;
        }
        return index + ":" + String(item);
    };
    
    const cache = new Map<string, Entry>();
    
    // 上一次渲染的 key 顺序, 判定"顺序未变"与"纯追加"
    let prevOrder: string[] = [];
    
    // 数字模式下上一次渲染的数量
    let prevCount = -1;
    
    /**
     * 创建条目, 克隆模板, 建作用域, 编译并收集该条目的更新函数
     *
     * @param value - 当前项的值
     * @param index - 当前项的索引, 含 start 偏移
     * @returns 新的条目实例
     */
    const createItem = (value: unknown, index: number): Entry => {
        const box = document.createElement("div");
        if (cls) box.className = cls;
        if (style) box.style.cssText = style;
        for (let i = 0; i < baseAttrs.length; i++) box.setAttribute(baseAttrs[i][0], baseAttrs[i][1]);
        box.appendChild(cloneTpl());
        
        const itemScope = createItemScope(scope, { [indexVar]: index, [valueVar]: value });
        const updates: Function[] = [];
        
        // collectUpdates 内部完成 compile, 期间创建的更新函数全部收进 updates
        const nodes = collectUpdates(updates, () => {
            compile(box, itemScope);
            return [...box.childNodes];
        });
        
        return { nodes, scope: itemScope, updates, value, index };
    };
    
    /**
     * 条目数据变更, 只写作用域普通属性并逐个调用更新函数, 节点不重建, 焦点与组件状态保留
     *
     * @param entry - 目标条目
     * @param value - 新的值
     * @param index - 新的索引
     */
    const applyItem = (entry: Entry, value: unknown, index: number): void => {
        let dirty = false;
        
        if (!Object.is(entry.value, value)) {
            entry.scope[valueVar] = value;
            entry.value = value;
            dirty = true;
        }
        
        if (entry.index !== index) {
            entry.scope[indexVar] = index;
            entry.index = index;
            dirty = true;
        }
        
        if (!dirty) return;
        
        const updates = entry.updates;
        for (let i = 0; i < updates.length; i++) updates[i]();
    };
    
    /**
     * 取条目并搬运到目标片段, 缺失则新建, 命中则就地重算, 供四条渲染路径复用
     *
     * @param key - 条目的 key
     * @param value - 当前项的值
     * @param index - 当前项的索引, 含 start 偏移
     * @param fragment - 目标片段
     */
    const takeItem = (key: string, value: unknown, index: number, fragment: DocumentFragment): void => {
        let entry = cache.get(key);
        
        if (entry === undefined) {
            entry = createItem(value, index);
            cache.set(key, entry);
        } else applyItem(entry, value, index);
        
        const nodes = entry.nodes;
        for (let i = 0; i < nodes.length; i++) fragment.appendChild(nodes[i]);
    };
    
    
    /**
     * 丢弃条目, 把它的节点移出 DOM 并从缓存中移除
     *
     * @param key - 条目的 key
     */
    const dropItem = (key: string): void => {
        const entry = cache.get(key);
        if (entry === undefined) return;
        const nodes = entry.nodes;
        for (let i = 0; i < nodes.length; i++) nodes[i].parentNode?.removeChild(nodes[i]);
        cache.delete(key);
    };
    
    /**
     * 裁剪缓存, 移除本次渲染不再使用的条目
     */
    const prune = (keep: Set<string>): void => {
        for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key);
    };
    
    /**
     * 数字模式渲染
     */
    const renderCount = (count: number): void => {
        // 数量未变, 索引与值均由下标推导, 无事可做
        if (count === prevCount) return;
        
        // 纯增长, 已有条目原位保留, 只创建并追加新增项
        if (prevCount >= 0 && count > prevCount) {
            const fragment = document.createDocumentFragment();
            
            for (let i = prevCount; i < count; i++) {
                const displayIndex = i + startOffset;
                takeItem(String(i), displayIndex, displayIndex, fragment);
            }
            
            el.appendChild(fragment);
            prevCount = count;
            prevOrder = [];
            return;
        }
        
        const fragment = document.createDocumentFragment();
        const keep = new Set<string>();
        
        for (let i = 0; i < count; i++) {
            const key = String(i);
            const displayIndex = i + startOffset;
            keep.add(key);
            takeItem(key, displayIndex, displayIndex, fragment);
        }
        
        prune(keep);
        prevCount = count;
        prevOrder = [];
        el.replaceChildren(fragment);
    };
    
    /**
     * 数组模式渲染, 按顺序未变, 追加, 头尾增删, 中间插删, 整体重排七条路径做最小 DOM 变更
     *
     * @param arr - 数组项列表
     */
    const renderList = (arr: unknown[]): void => {
        const len = arr.length;
        const nextKeys = new Array<string>(len);
        
        // `len > 0` 不可省, 空数组走"顺序未变"会直接返回, 模板子节点残留且被外层误编译
        let sameOrder = len > 0 && prevOrder.length === len;
        
        for (let i = 0; i < len; i++) {
            const key = getKey(arr[i], i);
            nextKeys[i] = key;
            if (sameOrder && (prevOrder[i] !== key || !cache.has(key))) sameOrder = false;
        }
        
        // 快路径, key 序列完全一致, 只为数据真正变化的条目重算绑定
        if (sameOrder) {
            for (let i = 0; i < len; i++) applyItem(cache.get(nextKeys[i])!, arr[i], i + startOffset);
            return;
        }
        
        // 快路径, 旧序列是新序列的前缀, 纯追加, 已有条目原地不动
        if (prevOrder.length > 0 && prevOrder.length < len) {
            let isPrefix = true;
            for (let i = 0; i < prevOrder.length; i++) {
                if (prevOrder[i] !== nextKeys[i]) {
                    isPrefix = false;
                    break;
                }
            }
            
            if (isPrefix) {
                for (let i = 0; i < prevOrder.length; i++) applyItem(cache.get(prevOrder[i])!, arr[i], i + startOffset);
                const fragment = document.createDocumentFragment();
                for (let i = prevOrder.length; i < len; i++) takeItem(nextKeys[i], arr[i], i + startOffset, fragment);
                el.appendChild(fragment);
                prevOrder = nextKeys;
                return;
            }
        }
        
        const prevLen = prevOrder.length;
        
        // 快路径, 纯头部插入, unshift / splice 头部, 旧序列是新序列的后缀
        if (prevLen > 0 && prevLen < len) {
            const offset = len - prevLen;
            let isSuffix = true;
            for (let i = 0; i < prevLen; i++) {
                if (nextKeys[offset + i] !== prevOrder[i]) {
                    isSuffix = false;
                    break;
                }
            }
            
            if (isSuffix) {
                const fragment = document.createDocumentFragment();
                for (let i = 0; i < offset; i++) takeItem(nextKeys[i], arr[i], i + startOffset, fragment);
                el.insertBefore(fragment, el.firstChild);
                
                // 原有条目整体右移, 索引须重算, 内容不变时 applyItem 不会产生重建
                for (let i = 0; i < prevLen; i++) applyItem(cache.get(prevOrder[i])!, arr[offset + i], offset + i + startOffset);
                
                prevOrder = nextKeys;
                return;
            }
        }
        
        // 快路径, 纯头部删除, shift, 新序列是旧序列的后缀
        if (len > 0 && len < prevLen) {
            const offset = prevLen - len;
            let isSuffix = true;
            
            for (let i = 0; i < len; i++) {
                if (nextKeys[i] !== prevOrder[offset + i]) {
                    isSuffix = false;
                    break;
                }
            }
            
            if (isSuffix) {
                for (let i = 0; i < offset; i++) dropItem(prevOrder[i]);
                
                // 剩余条目整体左移, 索引须重算
                for (let i = 0; i < len; i++) applyItem(cache.get(nextKeys[i])!, arr[i], i + startOffset);
                
                prevOrder = nextKeys;
                return;
            }
        }
        
        // 快路径, 纯尾部删除, pop, 前缀不变, 只摘掉尾部条目
        if (len > 0 && len < prevLen) {
            let isPrefix = true;
            
            for (let i = 0; i < len; i++) {
                if (nextKeys[i] !== prevOrder[i]) {
                    isPrefix = false;
                    break;
                }
            }
            
            if (isPrefix) {
                for (let i = len; i < prevLen; i++) dropItem(prevOrder[i]);
                
                // 保留下来的条目内容仍可能被替换, 同 key 新对象, 须过一遍
                for (let i = 0; i < len; i++) applyItem(cache.get(nextKeys[i])!, arr[i], i + startOffset);
                
                prevOrder = nextKeys;
                return;
            }
        }
        
        // 快路径, 中间插入或删除, 定位公共前后缀只动差异段
        if (prevLen > 0 && len > 0) {
            const minLen = len < prevLen ? len : prevLen;
            
            let head = 0;
            while (head < minLen && nextKeys[head] === prevOrder[head]) head++;
            
            let tail = 0;
            while (tail < minLen - head && nextKeys[len - 1 - tail] === prevOrder[prevLen - 1 - tail]) tail++;
            
            // 差异段落在中间时 head / tail 都非零
            if (head > 0 && tail > 0) {
                if (len < prevLen && head + tail === len) {
                    // 中间纯删除, 摘掉 prev[head .. prevLen-tail] 区间的条目, 其余节点原位不动
                    for (let i = head; i < prevLen - tail; i++) dropItem(prevOrder[i]);
                    
                    // 前缀索引不变, 后缀左移
                    for (let i = 0; i < len; i++) applyItem(cache.get(nextKeys[i])!, arr[i], i + startOffset);
                    prevOrder = nextKeys;
                    return;
                }
                
                if (len > prevLen && head + tail === prevLen) {
                    // 中间纯插入, 只新建差异段, 插到后缀首个条目之前
                    const fragment = document.createDocumentFragment();
                    for (let i = head; i < len - tail; i++) takeItem(nextKeys[i], arr[i], i + startOffset, fragment);
                    const anchor = cache.get(nextKeys[len - tail]);
                    el.insertBefore(fragment, anchor === undefined ? null : (anchor.nodes[0] ?? null));
                    
                    // 前缀索引不变, 后缀右移
                    for (let i = 0; i < len; i++) applyItem(cache.get(nextKeys[i])!, arr[i], i + startOffset);
                    
                    prevOrder = nextKeys;
                    return;
                }
            }
        }
        
        // 通用路径, 顺序发生变化, 逐项重算后按新顺序重排
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < len; i++) takeItem(nextKeys[i], arr[i], i + startOffset, fragment);
        
        prune(new Set(nextKeys));
        prevOrder = nextKeys;
        el.replaceChildren(fragment);
    };
    
    /**
     * 核心更新函数
     */
    const update = (): void => {
        let parsed: unknown;
        try {
            parsed = parser.parse(expr.trim(), scope, deps);
        } catch (err) {
            console.error("[r-for] 表达式解析错误:", { expr: expr.trim(), error: (err as Error).message });
            return;
        }
        
        if (typeof parsed === "number") return renderCount(Math.max(0, Math.floor(parsed)));
        if (Array.isArray(parsed)) return renderList(parsed);
        
        // 表达式不可用时清空容器, 否则模板节点会留在 DOM 里被外层 compile 用父作用域误编译
        if (el.childNodes.length > 0) el.replaceChildren();
        console.warn("[r-for] 表达式必须解析为数字或数组, 实际类型:", typeof parsed);
    };
    
    // 首次渲染期间订阅到的 Dep 集合, 销毁时逐个反订阅
    let trackedDeps: Set<Dep> | undefined;
    
    // 依赖收集并首次执行
    activeFns.push(update);
    beginTrack(update, trackedDeps);
    try {
        update();
    } catch (error) {
        console.error("[r-for] 初始化错误:", (error as Error).message);
        el.textContent = "";
    } finally {
        activeFns.pop();
        const tracked = endTrack();
        if (tracked !== undefined) trackedDeps = tracked;
    }
    
    // 登记到外层收集上下文, 嵌套在别的 r-for 条目里时, 上层数据变化要重算本列表
    emitUpdate(update);
    
    // 订阅父作用域变量
    elDeps.get(el)?.forEach(varName => depMap.get(scope)?.subscribe(update, varName));
    
    // 元素移除时清理
    onElRemove(el, () => {
        deadFns.add(update);
        
        for (const entry of cache.values()) {
            // 移除残留节点
            for (let i = 0; i < entry.nodes.length; i++) entry.nodes[i].parentNode?.removeChild(entry.nodes[i]);
            
            // 调用 destroy 生命周期方法
            (entry.scope as unknown as {destroy?: () => void}).destroy?.();
            
            entry.nodes.length = 0;
            entry.updates.length = 0;
        }
        
        cache.clear();
        prevOrder = [];
        prevCount = -1;
        
        // 追踪集合覆盖首次渲染期间的自动订阅
        if (trackedDeps !== undefined) {
            for (const dep of trackedDeps) dep.unsubscribe(update);
            trackedDeps.clear();
        }
        
        const depsSet = elDeps.get(el);
        if (depsSet !== undefined) {
            depsSet.forEach(varName => depMap.get(scope)?.unsubscribe(update, varName));
            elDeps.delete(el);
        }
        
        // 重置处理标记, 允许 SPA 路由返回时重新挂载
        (el as unknown as Record<string, unknown>).__forProcessed = false;
    });
});
