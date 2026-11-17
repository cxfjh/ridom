import type { ReactiveInterface } from "../types";
import { INTERP_REGEX, VARIABLE_REGEX } from "../utils/constants.ts";
import { getKeys } from "../utils/keys.ts";


/**
 * 表达式解析器单例
 */
export const parser: ParserInterface = {
    /**
     * 全局变量白名单
     */
    _globals: new Set(["window", "document", "console", "alert"]),
    
    /**
     * 解析单个 JavaScript 表达式并求值
     *
     * @param expr - 待解析的表达式字符串, 可能包含 `{{ }}` 包裹
     * @param scope - 响应式作用域对象, 提供表达式变量的运行时值
     * @param deps - 依赖收集器, 解析过程中自动添加引用的根变量名
     * @param unwrapRef - 是否自动解包 `RefInterface` 对象, 默认 `true`;
     */
    parse(expr: string, scope: ReactiveInterface = {} as ReactiveInterface, deps: Set<string> = new Set(), unwrapRef: boolean = true): unknown {
        try {
            // 去除 {{ }} 包裹
            if (expr.charCodeAt(0) === 123 && expr.charCodeAt(1) === 123 && expr.charCodeAt(expr.length - 2) === 125 && expr.charCodeAt(expr.length - 1) === 125) expr = expr.slice(2, -2).trim();
            
            // 提取作用域键名
            const keys = getKeys(scope);
            
            // 按作用域形状分桶共享编译函数, 避免每个循环项各 new Function 一次
            let scopeCache = cache.get(keys);
            if (scopeCache === undefined) {
                scopeCache = new Map<string, CacheEntry>();
                cache.set(keys, scopeCache);
            }
            
            // unwrapRef 极少为 false, 仅在该分支追加后缀, 常规路径直接用表达式作为键
            const bucketKey = unwrapRef ? expr : expr + "\u0000raw";
            let entry = scopeCache.get(bucketKey);
            
            // 缓存未命中就编译表达式
            if (!entry) {
                // 静态分析提取表达式中的变量名, 供依赖收集
                const vars: string[] = expr.match(VARIABLE_REGEX) || [];
                
                // 归并出根变量名, 供依赖收集与形参裁剪使用
                const usedRoots = new Set<string>();
                for (let i = 0; i < vars.length; i++) {
                    const v = vars[i];
                    const dotIdx = v.indexOf(".");
                    usedRoots.add(dotIdx === -1 ? v : v.slice(0, dotIdx));
                }
                
                // 只保留作用域中真实存在且被表达式引用的键作形参, 避免读整个作用域造成依赖爆炸
                const params: string[] = [];
                for (let i = 0; i < keys.length; i++) if (usedRoots.has(keys[i])) params.push(keys[i]);
                
                // FIFO 淘汰, 单个作用域的缓存满时删除最早插入的条目
                if (scopeCache.size >= MAX_SCOPE_CACHE) scopeCache.delete(scopeCache.keys().next().value as string);
                entry = { fn: new Function(...params, "return " + expr + ";"), params };
                scopeCache.set(bucketKey, entry);
            }
            
            // 依赖收集, 形参即"表达式引用到的真实作用域键", 直接用它登记
            const { params } = entry;
            const globals = this._globals;
            
            for (let i = 0; i < params.length; i++) {
                const rootVar = params[i];
                if (!globals.has(rootVar) && !deps.has(rootVar)) deps.add(rootVar); // 跳过全局变量和已收集变量, 避免重复订阅
            }
            
            // 注入作用域值并执行, 只读取表达式实际用到的键
            const pl = params.length;
            const values: unknown[] = new Array(pl);
            for (let i = pl; i--;) values[i] = scope[params[i]];
            const result = entry.fn(...values);
            
            // Ref 自动解包
            return unwrapRef && (result as Record<string, unknown>)?.__isRef ? (result as Record<string, unknown>).value : result;
        } catch (e) {
            console.warn("[parser] 解析错误:", expr, e);
            return expr;
        }
    },
    
    /**
     * 解析包含 `{{ }}` 插值语法的文本字符串
     *
     * @param text - 包含零个或多个 `{{ }}` 插值的模板文本
     * @param scope - 响应式作用域对象, 传给 `parse` 做变量求值
     * @param deps - 依赖收集器, 传给 `parse` 做依赖收集
     * @param unwrapRef - 是否自动解包 Ref 对象, 默认 `true`
     * @returns 所有插值已被替换为求值结果的纯文本字符串
     */
    text(text: string, scope: ReactiveInterface = {} as ReactiveInterface, deps: Set<string> = new Set(), unwrapRef: boolean = true): string {
        return text.replace(INTERP_REGEX, (_match, slash, expr) => {
            if (slash) return "{{" + expr.trim() + "}}"; // 转义处理: `\{{ }}` 保留原文, 不进行求值
            return String(this.parse(expr.trim(), scope, deps, unwrapRef));
        });
    },
};


/**
 * 编译函数缓存池
 */
const cache = new WeakMap<string[], Map<string, CacheEntry>>();


/**
 * 单个作用域的缓存条目上限
 */
const MAX_SCOPE_CACHE = 64;


/**
 * 表达式解析器接口
 */
export interface ParserInterface {
    /**
     * 全局变量白名单, 可运行时扩展
     */
    _globals: Set<string>;
    
    
    /**
     * 解析单个 JavaScript 表达式并求值
     *
     * @param expr - 表达式字符串
     * @param scope - 响应式作用域对象
     * @param deps - 依赖收集器
     * @param unwrapRef - Ref 自动解包开关
     * @returns 表达式计算结果
     */
    parse(expr: string, scope?: ReactiveInterface, deps?: Set<string>, unwrapRef?: boolean): unknown;
    
    
    /**
     * 解析包含 `{{ }}` 插值的文本字符串
     *
     * @param text - 模板文本
     * @param scope - 响应式作用域对象
     * @param deps - 依赖收集器
     * @param unwrapRef - Ref 自动解包开关
     * @returns 插值替换后的纯文本
     */
    text(text: string, scope?: ReactiveInterface, deps?: Set<string>, unwrapRef?: boolean): string;
}


/**
 * 表达式编译缓存条目
 */
interface CacheEntry {
    /**
     * 编译好的表达式求值函数
     */
    fn: Function;
    
    /**
     * 求值函数形参名列表, 仅包含表达式中实际引用且作用域中存在的键
     */
    params: string[];
}
