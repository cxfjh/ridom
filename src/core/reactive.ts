import type { ReactiveInterface } from "../types";
import { activeFns, depMap } from "../utils/shared.ts";
import { Dep } from "./dep.ts";


/**
 * 已创建的 Proxy 集合用 WeakSet 判代理身份
 */
const proxySet = new WeakSet<object>();


/**
 * 原始对象到 Proxy 的映射
 */
const proxyOf = new WeakMap<object, object>();


/**
 * 判断值是否应被响应式包装, 仅纯对象与数组, 类实例与内置对象不参与包装
 *
 * @param value 待判断的值
 */
const isWrappable = (value: unknown): value is object => {
    if (value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return true;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};


/**
 * 是否为自己拥有的属性
 *
 * @param obj - 待检测对象
 * @param key - 属性名
 */
const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);


/**
 * 创建响应式代理对象
 *
 * @param target - 目标对象, 仅支持纯对象 `{}` 和数组 `[]`
 */
const reactiveImpl = (target: unknown): ReactiveInterface => {
    // 类型过滤
    if (typeof target !== "object" || target === null || target instanceof Date || target instanceof RegExp || target instanceof Function || target instanceof Map || target instanceof Set) {
        console.warn(`[reactive] 仅支持纯对象/数组类型, 当前类型: ${ typeof target } (${ (target as object)?.constructor?.name })`);
        return target as ReactiveInterface;
    }
    
    // 去重检查
    const obj = target as ReactiveInterface;
    
    // 已是 Proxy 直接返回, 避免套 Proxy, 用 WeakSet 而非 __isReactiveProxy 属性判断
    if (proxySet.has(obj)) return obj;
    
    // 已是 Ref 对象直接返回, 避免将 Ref 的 getter/setter 包裹在 Proxy 中
    if (hasOwn(obj, "__isRef")) return obj;
    
    // 已被标记为响应式原始对象从 depMap 取回缓存的 Proxy
    if (hasOwn(obj, "__isReactive")) return (proxyOf.get(obj) as ReactiveInterface) || obj;
    
    // 保存原始对象引用并创建依赖管理器
    const original = obj;
    const dep = new Dep();
    depMap.set(original, dep);
    
    // 标记原始对象, 不可枚举, 不可配置, 避免被外部遍历或删除
    Object.defineProperties(original, {
        __isReactive: { value: true, enumerable: false, configurable: false },
        __raw: { value: original, enumerable: false, configurable: false },
    });
    
    // 深度递归处理嵌套对象
    if (Array.isArray(original)) {
        // 把 Dep 挂在数组自身, 变异方法从 `this` 上取, 见文件末尾的共享原型
        Object.defineProperty(original, ARR_DEP, { value: dep, enumerable: false, configurable: false });
        
        // 共享原型: 所有响应式数组改用同一份中间原型, 不再逐数组创建
        Object.setPrototypeOf(original, arrayProto);
        original.forEach((item: unknown, index: number) => isWrappable(item) && !(item as ReactiveInterface).__isReactive && (original[index] = reactiveImpl(item)));
    } else {
        // 用 Object.keys 递归包装自有属性, for...in 会枚举原型链上的键
        const ownKeys = Object.keys(original);
        for (let i = 0; i < ownKeys.length; i++) {
            const value = original[ownKeys[i]];
            if (isWrappable(value) && !(value as ReactiveInterface).__isReactive) original[ownKeys[i]] = reactiveImpl(value);
        }
    }
    
    /**
     * 创建 Proxy 代理
     */
    const proxy = new Proxy(original, {
        /**
         * Get 陷阱, 属性读取拦截
         *
         * @param targetObj - 原始目标对象
         * @param prop - 被访问的属性名, 字符串或 Symbol
         * @param receiver - 触发访问的代理对象
         * @returns 属性值, 嵌套对象会被自动包装为响应式
         */
        get(targetObj: ReactiveInterface, prop: string | symbol, receiver: unknown): unknown {
            // 内置属性跳过依赖收集, 直接返回原始值, ARR_DEP 一并放行
            if (prop === ARR_DEP || SKIP_GET_PROPS.has(prop as string)) return Reflect.get(targetObj, prop, receiver);
            
            // 依赖收集, 将当前 activeFn 订阅到对应 key 的 dep
            if (activeFns.length > 0) {
                const activeFn = activeFns[activeFns.length - 1];
                if (Array.isArray(targetObj) && /^\d+$/.test(String(prop))) dep.subscribe(activeFn, `index:${ String(prop) }`);
                else dep.subscribe(activeFn, prop as string);
            }
            
            // 通过 Reflect 获取原始值, 保持正确的 this 绑定
            const value = Reflect.get(targetObj, prop, receiver);
            
            // 惰性深层代理, 值是非响应式对象时递归包装
            if (typeof value === "object" && value !== null && !(value as ReactiveInterface).__isReactive) return reactiveImpl(value);
            return value;
        },
        
        /**
         * Set 陷阱, 属性写入拦截
         *
         * @param targetObj - 原始目标对象
         * @param prop - 被修改的属性名
         * @param value - 新值
         * @param receiver - 触发写入的代理对象
         * @returns 操作是否成功, 始终返回 `true`, 失败时在内部 warn
         */
        set(targetObj: ReactiveInterface, prop: string | symbol, value: unknown, receiver: unknown): boolean {
            // 禁止修改内置标记属性
            if (SKIP_SET_PROPS.has(prop as string)) {
                console.warn(`[reactive] 禁止修改内置属性: ${ String(prop) }`);
                return true;
            }
            
            // 获取旧值, 相同则跳过通知
            const oldValue = Reflect.get(targetObj, prop, receiver);
            if (oldValue === value || (Number.isNaN(oldValue as number) && Number.isNaN(value as number))) return true;
            
            // 数组 length 缩小, 通知被删除的索引位置
            if (Array.isArray(targetObj) && prop === "length" && typeof value === "number") {
                const oldLength = targetObj.length;
                if (value === oldLength) return true;
                if (value < oldLength) for (let i = value; i < oldLength; i++) dep.notify(`index:${ i }`);
            }
            
            // 新值若是纯对象/数组, 自动转为响应式再写入
            const reactiveVal = isWrappable(value) ? reactiveImpl(value) : value;
            const success = Reflect.set(targetObj, prop, reactiveVal, receiver);
            
            // 仅当写入落在本代理上时通知, receiver 指向子对象时改的是子对象
            if (!dep._paused && receiver === proxy) {
                if (Array.isArray(targetObj) && /^\d+$/.test(prop as string)) dep.notify(`index:${ String(prop) }`);
                else dep.notify(prop as string);
            }
            
            return success;
        },
        
        /**
         * DeleteProperty 陷阱, 属性删除拦截
         *
         * @param targetObj - 原始目标对象
         * @param prop - 被删除的属性名
         * @returns 删除是否成功; 内置属性返回 `false`
         */
        deleteProperty(targetObj: ReactiveInterface, prop: string | symbol): boolean {
            // 禁止删除内置标记属性
            if (SKIP_DEL_PROPS.has(prop as string)) {
                console.warn(`[reactive] 禁止删除内置属性: ${ String(prop) }`);
                return false;
            }
            
            const hadProp = Reflect.has(targetObj, prop);
            const deleteResult = Reflect.deleteProperty(targetObj, prop);
            
            // 删除成功, 属性原本存在, 通知未暂停就通知订阅者
            if (hadProp && deleteResult && !dep._paused) {
                if (Array.isArray(targetObj) && /^\d+$/.test(prop as string)) dep.notify(`index:${ String(prop) }`);
                else dep.notify(prop as string);
            }
            
            return deleteResult;
        },
    });
    
    // 在 Proxy 上标记, 防止后续 reactive 调用再次包装
    Object.defineProperty(proxy, "__isReactiveProxy", { value: true, enumerable: false, configurable: false });
    
    // 记录到集合, 作为"是否已是代理"的唯一可靠判据, 属性会随原型链被继承
    proxySet.add(proxy);
    
    // 用独立 WeakMap 记录原始对象 Proxy 的映射
    proxyOf.set(original, proxy);
    return proxy;
};


/**
 * 创建响应式代理对象
 */
export const reactive = reactiveImpl as {
    <T extends object>(target: T): T & ReactiveInterface;
    (target: unknown): ReactiveInterface;
};


/**
 * Get 陷阱跳过属性集合
 */
const SKIP_GET_PROPS = new Set(["__proto__", "__isReactive", "__isReactiveProxy"]);


/**
 * Set 陷阱禁止修改属性集合
 */
const SKIP_SET_PROPS = new Set(["__isReactive", "__raw", "__isReactiveProxy"]);


/**
 * DeleteProperty 陷阱禁止删除属性集合
 */
const SKIP_DEL_PROPS = new Set(["__isReactive", "__raw", "__isReactiveProxy"]);


/**
 * 数组"新增元素"方法集合
 */
const ARR_ADD_METHODS = new Set(["splice", "push", "unshift"]);


/**
 * 数组变异方法列表
 */
const ARR_MUT_METHODS = ["push", "pop", "shift", "unshift", "splice", "sort", "reverse"] as const;


/**
 * 数组 Dep 的取用键, 用 Symbol 而非字符串: 不参与 `Object.keys` / `JSON.stringify`, 读它时 get 陷阱也直接放行
 */
const ARR_DEP = Symbol("rdArrayDep");


/**
 * 响应式数组共享中间原型, 方法从 `this[ARR_DEP]` 取 Dep, 不再逐数组建原型与闭包
 */
const arrayProto = Object.create(Array.prototype) as Record<string | symbol, unknown>;


/**
 * 数组变异方法拦截
 */
for (let i = 0; i < ARR_MUT_METHODS.length; i++) {
    const method = ARR_MUT_METHODS[i];
    const raw = (Array.prototype as unknown as Record<string, Function>)[method];
    
    /**
     * 数组变异方法拦截, 通知订阅者数组变更
     *
     * @param args - 数组变异方法参数
     * @returns 数组变异方法执行结果
     */
    arrayProto[method] = function (this: Record<string | symbol, unknown>, ...args: unknown[]): unknown {
        const dep = this[ARR_DEP] as Dep | undefined;
        
        // 未经 reactive 包装的数组, 理论上不会走到这里 直接透传
        if (dep === undefined) return raw.apply(this, args);
        
        // 保存当前暂停状态, 方法执行完毕后恢复
        const wasPaused = dep._paused;
        dep._paused = true;
        
        // 调用原始数组方法, 通过 apply 绑定 this 和参数
        const result = raw.apply(this, args);
        
        try {
            // 新增元素自动转为响应式
            if (ARR_ADD_METHODS.has(method)) {
                const items = method === "splice" ? args.slice(2) : args;
                for (let j = 0; j < items.length; j++) {
                    const item = items[j];
                    if (isWrappable(item) && !(item as ReactiveInterface).__isReactive) reactiveImpl(item);
                }
            }
            
            // 恢复通知状态, 若未被外部禁用则触发数组变更通知
            dep._paused = wasPaused;
            // 数组变异无法定位到具体索引, 走全量通知
            if (!dep._paused) dep.notify();
            return result;
        } catch (e) {
            console.error(`[reactive] 数组方法 ${ method } 执行失败:`, e);
            dep._paused = wasPaused;
            return result;
        }
    };
}
