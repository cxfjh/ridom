import type { CompOptions } from "../../types";
import { cpInsts, domTpls, requestFrame, rootScope } from "../../utils/shared.ts";
import { compile } from "../compile.ts";
import { Ridom } from "../ridom.ts";
import { applyStyle, lightStyled } from "./style.ts";
import { getByIdAny } from "./lookup.ts";
import { LIFECYCLE_HOOKS, NON_LIFECYCLE_METHODS } from "./lifecycle.ts";
import { teardownTree } from "../../utils/lifecycle.ts";


/**
 * 组件定义与注册引擎
 *
 * @param compName - 组件唯一名称标识, 供 r-dom 指令引用和全局注册
 * @param options - 组件配置对象, 详见 {@link CompOptions}
 */
export const comp: (compName: string, options: CompOptions) => unknown = (compName, options) => {
    // 参数校验, 确保配置对象有效
    if (!options || typeof options !== "object") throw new Error("dom() 需传入组件名称和配置对象");
    const { template, style, script, props: propsDefs, to, sty = true } = options;
    if (!template) console.warn(`组件 "${ compName }" 缺少 template`);
    
    // 生成唯一实例标识
    const compId = `comp-${ compName }-${ Math.random().toString(36).substring(2, 9) }`;
    
    // 缓存模板 DocumentFragment
    let tplFrag: DocumentFragment;
    if (!domTpls.has(compName)) {
        tplFrag = document.createDocumentFragment();
        if (template) {
            const tempContainer = document.createElement("div");
            tempContainer.innerHTML = template.trim();
            while (tempContainer.firstChild) tplFrag.appendChild(tempContainer.firstChild);
        }
        domTpls.set(compName, tplFrag);
    } else tplFrag = domTpls.get(compName)!;
    
    // 冻结对象防止脚本意外修改, 同时确保所有组件实例共享同一份工具引用
    const utils = Object.freeze({
        ref: Ridom.ref,
        reactive: Ridom.reactive,
        provide: Ridom.provide,
        watch: Ridom.watch,
        dom: Ridom.dom,
        cpInsts: Ridom.cpInsts,
        router: Ridom.router,
        raf: Ridom.raf,
    });
    
    /**
     * 创建组件实例工厂
     *
     * @param props - 外部传入的组件属性, 默认为空对象
     * @param isoOverride - 可选的样式隔离覆盖, 供运行时动态控制
     * @returns 包含 `render` 方法的实例工厂对象
     */
    const compFactory = (props: Record<string, unknown> = {}, isoOverride?: boolean) => {
        // 合并属性 propsDefs 为基础层, 外部 props 为覆盖层
        const mergedProps = Object.create(null) as unknown as Record<string, unknown>;
        if (propsDefs) Object.assign(mergedProps, propsDefs);
        Object.assign(mergedProps, props);
        
        // 确定最终的样式隔离设置
        const finalStyleIso = isoOverride !== undefined ? isoOverride : sty;
        
        // 创建原始 refs 对象
        const rawRefs = Object.create(null);
        
        // 创建精简的响应式作用域
        const compScope = Ridom.reactive({ $props: mergedProps });
        (compScope as Record<string, unknown>).$refs = rawRefs;
        
        // 内部非响应式属性, 通过闭包访问, 避免污染作用域链和 getKeys
        const compInternals = {
            $compName: compName,
            $compId: compId,
            $sty: finalStyleIso,
        };
        
        // 执行脚本工厂函数
        let scriptResult: Record<string, unknown> = Object.create(null);
        if (typeof script === "function") {
            try {
                scriptResult = (script as Function)({ $props: compScope.$props, $refs: rawRefs, $sty: finalStyleIso }, utils) || {};
                
                // script 写成 async 时返回值是 Promise, setup 与生命周期钩子都会丢失, 明确提示
                if (typeof (scriptResult as unknown as PromiseLike<unknown>)?.then === "function") {
                    console.warn(`[dom] 组件 "${ compName }" 的 script 返回了 Promise: setup / mounted / unmounted 不会被注册, 异步逻辑请放进 mounted`);
                    scriptResult = Object.create(null);
                }
            } catch (e) {
                console.error(`[dom] 组件 "${ compName }" 脚本执行错误:`, e);
            }
        }
        
        // 执行 setup 函数
        if (typeof scriptResult.setup === "function") {
            try {
                const compCtx: Record<string, unknown> = Object.create(null);
                const setupFunc = scriptResult.setup as Function;
                let manualReturn: Record<string, unknown> | undefined;
                (function () {
                    "use strict";
                    manualReturn = setupFunc(compCtx) as unknown as Record<string, unknown> | undefined;
                })();
                
                // 合并 setup 返回值到组件作用域
                const setupResult = { ...compCtx, ...manualReturn };
                if (setupResult && typeof setupResult === "object") Object.assign(compScope, setupResult);
            } catch (e) {
                console.error(`[dom] 组件 "${ compName }" setup 函数执行错误:`, e);
            }
        }
        
        // 收集生命周期钩子
        const lifecycleHooks: Record<string, Function> = Object.create(null);
        LIFECYCLE_HOOKS.forEach(hook => (typeof scriptResult[hook] === "function") && (lifecycleHooks[hook] = scriptResult[hook] as Function));
        
        // 绑定用户方法到组件作用域
        Object.entries(scriptResult).forEach(([key, value]) => (typeof value === "function" && !NON_LIFECYCLE_METHODS.has(key)) && ((compScope as unknown as Record<string, unknown>)[key] = (value as Function).bind(compScope)));
        
        /**
         * 渲染组件到目标 DOM 元素
         *
         * @param targetEl - 挂载目标 DOM 元素, 必须是有效的元素节点
         * @param isoOverride - 可选的样式隔离覆盖, undefined 时使用组件默认配置
         * @returns 组件实例对象, 包含 compScope 的所有属性以及 root/del 方法
         */
        const render = (targetEl: HTMLElement, isoOverride?: boolean) => {
            if (!targetEl?.nodeType || targetEl.nodeType !== Node.ELEMENT_NODE) throw new Error(`组件 "${ compName }" 挂载失败, 无效的目标节点`);
            const iso = isoOverride !== undefined ? isoOverride : sty;
            const tplClone = tplFrag.cloneNode(true) as DocumentFragment;
            
            // 收集模板中的 ref 元素引用
            const refs = tplClone.querySelectorAll("[ref]");
            refs.forEach(el => {
                const refName = el.getAttribute("ref");
                if (refName && !rawRefs[refName]) rawRefs[refName] = el;
            });
            
            // 编译模板遍历 DOM 树建立响应式绑定
            compile(tplClone, compScope);
            
            // 已销毁标记, 保证 unmounted 只触发一次
            let disposed = false;
            
            /**
             * 销毁实例
             */
            const dispose = (): void => {
                if (disposed) return;
                disposed = true;
                
                if (lifecycleHooks.unmounted) lifecycleHooks.unmounted.call(compScope);
                
                // 同步执行所有绑定注册的清理回调(反订阅 Dep、清 WeakMap 缓存)
                const shadow = targetEl.shadowRoot;
                if (shadow) {
                    teardownTree(shadow as unknown as Node, true);
                    // 清空影子树, 立即释放已脱离文档的节点
                    shadow.replaceChildren();
                } else {
                    teardownTree(targetEl, false);
                    // 保留共享的组件样式节点, 其余内容与实例解绑
                    for (const node of Array.from(targetEl.childNodes)) {
                        const isStyle = node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "STYLE";
                        if (!isStyle) targetEl.removeChild(node);
                    }
                }
                
                // 切断 $refs 对内部元素的强引用, 这是整棵 DOM 无法回收的直接原因
                for (const key of Object.keys(rawRefs)) delete (rawRefs as Record<string, unknown>)[key];
                
                cpInsts.delete(targetEl);
                targetEl.remove();
            };
            
            // Shadow DOM 挂载路径
            if (iso) {
                // 这里清空会把 script 里挂进来的子组件一起抹掉
                const shadowRoot = targetEl.shadowRoot ?? targetEl.attachShadow({ mode: "open" });
                
                // 组件样式注入 Shadow DOM, 无需 CSS 选择器重写
                if (style) applyStyle(shadowRoot, compName, compId, style);
                
                shadowRoot.appendChild(tplClone);
                
                // 触发 mounted 生命周期
                if (lifecycleHooks.mounted) requestFrame(() => lifecycleHooks.mounted.call(compScope));
                
                // 缓存组件实例
                cpInsts.set(targetEl, compScope);
                
                return {
                    ...compScope,
                    ...compInternals,
                    root: () => shadowRoot.firstElementChild,
                    del: dispose,
                };
            }
            
            // 无隔离路径
            const fragment = document.createDocumentFragment();
            
            // 无隔离模式: 样式作用于全局, 同一组件仅注入一次
            if (style && !lightStyled.has(compName + "\u0000" + style)) {
                lightStyled.add(compName + "\u0000" + style);
                const styleEl = document.createElement("style");
                styleEl.setAttribute("data-comp", compName);
                styleEl.setAttribute("data-comp-id", compId);
                styleEl.textContent = style;
                fragment.appendChild(styleEl);
            }
            
            // 直接渲染到 Light DOM, 同样只做追加, 已有内容由 mount 阶段按需清理
            fragment.appendChild(tplClone);
            targetEl.appendChild(fragment);
            
            // 触发 mounted 生命周期
            if (lifecycleHooks.mounted) requestFrame(() => lifecycleHooks.mounted.call(compScope));
            cpInsts.set(targetEl, compScope);
            
            // 返回组件实例对象
            return {
                ...compScope,
                ...compInternals,
                root: () => targetEl.firstElementChild,
                del: dispose,
            };
        };
        
        // 返回包含 render 方法的实例工厂对象
        return { render };
    };
    
    /**
     * 判断值是否为元素节点
     *
     * @param value 待判断的值
     * @returns 是元素节点返回 true
     */
    const isEl = (value: unknown): value is HTMLElement => !!value && typeof value === "object" && (value as Node).nodeType === Node.ELEMENT_NODE;
    
    /**
     * 按单个路径段创建元素, 支持 `#id` / `.class` / 标签名, 其余复杂选择器无法凭空创建
     *
     * @param seg - 路径段, 如 "#app" / ".main" / "section"
     * @returns 新建元素, 无法创建时返回 null
     */
    const createSeg = (seg: string): HTMLElement | null => {
        const str = seg.trim();
        if (!str) return null;
        if (str[0] === "#") {
            const el = document.createElement("div");
            el.id = str.slice(1);
            return el;
        }
        if (str[0] === ".") {
            const el = document.createElement("div");
            el.className = str.slice(1);
            return el;
        }
        if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(str)) return document.createElement(str);
        return null;
    };
    
    /**
     * 在容器内查找路径段
     *
     * @param root - 查找范围
     * @param seg - 路径段选择器
     * @param deep - 是否允许跨 Shadow DOM 兜底查找, 仅首段开启
     * @returns 命中的元素, 未命中返回 null
     */
    const findSeg = (root: ParentNode, seg: string, deep: boolean): HTMLElement | null => {
        let hit: Element | null = null;
        try { hit = root.querySelector(seg); } catch { hit = null; }
        if (!hit && deep && seg[0] === "#") hit = getByIdAny(seg.slice(1));
        return hit as HTMLElement | null;
    };
    
    /**
     * 取元素的"绘制根"
     *
     * @param el - 宿主元素
     * @returns 实际用于查找和挂载的根节点
     */
    const paintRoot = (el: HTMLElement): ParentNode => el.shadowRoot ?? el;
    
    /**
     * 解析挂载目标
     *
     * @param to - 挂载目标数组, 元素为简单选择器(`#id` / `.class` / 标签名)
     * @returns 实际渲染目标元素
     */
    const resolveTarget = (to: string[] | HTMLElement): HTMLElement => {
        // 内部通路, r-dom 指令直接把宿主元素传进来, 不属于对外写法
        if (isEl(to)) return to;
        
        // 只认数组, 其余写法直接报错, 避免猜来猜去
        if (!Array.isArray(to)) {
            throw new Error(`组件 "${ compName }" 挂载失败, to 只接受数组写法, 例如 to: ["#app"] 或 to: ["#app", "#main"]`);
        }
        
        const path = to.map(seg => (typeof seg === "string" ? seg.trim() : "")).filter(Boolean);
        if (path.length !== to.length) throw new Error(`组件 "${ compName }" 挂载失败, to 数组的每一段都必须是选择器字符串`);
        if (!path.length) throw new Error(`组件 "${ compName }" 挂载失败, to 数组不能为空`);
        
        // 逐级查找或创建
        let node: HTMLElement | null = null;
        let createdLast = false;
        for (let i = 0; i < path.length; i++) {
            const seg = path[i];
            const last = i === path.length - 1;
            
            // 父级是组件宿主时, 子级要在它的 shadowRoot 里找和建
            const hit = findSeg(node ? paintRoot(node) : document, seg, i === 0);
            if (hit) {
                node = hit;
                createdLast = false;
                continue;
            }
            
            // 缺哪级补哪级
            const created = createSeg(seg);
            if (!created) throw new Error(`组件 "${ compName }" 挂载失败, 选择器 "${ seg }" 无法自动创建, 请用 #id / .class / 标签名`);
            (node ? paintRoot(node) : document.body).appendChild(created);
            node = created;
            createdLast = last;
        }
        if (!node) throw new Error(`组件 "${ compName }" 挂载失败, to 数组无效`);
        
        // 末级是本次新建的容器: 内容独占, 直接渲染
        if (createdLast) return node;
        
        // 末级本来就存在: 内部挂一个 slot 承载组件, 只增不改
        const slot = document.createElement("div");
        slot.setAttribute("data-comp", compName);
        paintRoot(node).appendChild(slot);
        return slot;
    };
    
    /**
     * 挂载组件到指定目标元素
     *
     * @param props - 组件属性对象, 传入 compFactory 合并
     * @param to - 挂载目标, 选择器字符串 / DOM 元素 / 路径数组
     * @param styOverride - 可选的样式隔离覆盖, 传入 render 做最终控制
     * @returns 组件实例对象, 含 root/del 方法
     */
    const mount = (props: Record<string, unknown>, to: string[] | HTMLElement, styOverride?: boolean) => {
        // 解析挂载目标
        const target = resolveTarget(to);
        const iso = styOverride !== undefined ? styOverride : sty;
        
        // 同一宿主重复挂载时, 先清掉上一轮的内容, 且必须早于 script 执行,
        if (cpInsts.has(target)) {
            const root: ParentNode = iso && target.shadowRoot ? target.shadowRoot : target;
            for (const node of Array.from(root.childNodes)) {
                const isStyle = node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "STYLE";
                if (iso || !isStyle) root.removeChild(node);
            }
        }
        
        // 预挂 Shadow Root, script 里再挂子组件时才有正确的落点
        if (iso && !target.shadowRoot) target.attachShadow({ mode: "open" });
        
        // 创建组件实例并渲染
        const { render } = compFactory(props, styOverride);
        return render(target, styOverride);
    };
    
    /**
     * 自动注册组件到全局根作用域
     */
    ((): void => {
        /**
         * 计算最终注册名称
         *
         * @returns 有效的组件注册名
         */
        const getRegName = (): string => {
            if (compName.trim()) return compName.trim();
            return `comp-${ Date.now() }-${ Math.random().toString(36).slice(2, 6) }`;
        };
        
        /**
         * 创建包装后的组件工厂函数
         *
         * @param targetCompName - 目标组件名
         * @returns 组件工厂函数, 接收 `{ props, to }` 格式的参数对象
         */
        const compFact = (targetCompName: string) => {
            return (...args: unknown[]) => {
                // 参数解构, 从 args[0] 中提取 props, to, sty
                const config = args[0] as unknown as Record<string, unknown>;
                const props = (config.props as unknown as Record<string, unknown>) || {};
                const to = config.to as string[] | HTMLElement | undefined;
                
                // to 参数校验, r-dom 指令会自动传入目标元素, 手动调用时必须提供
                if (!to) {
                    console.error(`组件 "${ targetCompName }" 挂载失败, 缺少 to 参数`);
                    return null;
                }
                
                return mount(props, to);
            };
        };
        
        /**
         * 注册组件到根作用域
         *
         * @param regName - 最终的注册名
         * @param targetCompName - 目标组件名, 传递给 compFact
         */
        const register = (regName: string, targetCompName: string): void => {
            /**
             * 尝试注册, 等待根作用域可用
             */
            const tryRegister = (): void => {
                if (rootScope) {
                    if (rootScope[regName]) return void console.warn(`[dom] 组件名 "${ regName }" 已被占用, 跳过注册`);
                    (rootScope as unknown as Record<string, unknown>)[regName] = compFact(targetCompName);
                }
            };
            
            // 根据 DOM 加载状态选择注册时机
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryRegister);
            else tryRegister();
        };
        
        // 计算注册名并执行注册
        const regName = getRegName();
        register(regName, compName);
    })();
    
    // 返回值分派, 根据 to 参数决定返回类型
    if (to) return mount({}, to);
    else return (...args: unknown[]) => {
        const config = args[0] as unknown as Record<string, unknown>;
        const props = (config.props as unknown as Record<string, unknown>) || {};
        const to = config.to as string[] | HTMLElement | undefined;
        const sty = config.sty as boolean | undefined;
        
        // 缺少 to 时给出明确报错, 避免落到解析阶段抛 TypeError
        if (!to) return void console.error(`组件 "${ compName }" 挂载失败, 缺少 to 参数`);
        return mount(props, to, sty);
    };
};
