/**
 * 响应式引用对象, Ref 模式
 *
 * @template T 响应式值的类型, 默认为 `unknown`
 */
export interface RefInterface<T = unknown> {
    /**
     * 引用的实际值
     */
    value: T;
    
    /**
     * 内部标识, 标记当前对象为 `RefInterface` 类型
     */
    __isRef: boolean;
}


/**
 * 响应式代理对象, Reactive Proxy 模式
 */
export interface ReactiveInterface {
    /**
     * 内部标识, 标记原始对象已被 `reactive` 处理
     */
    __isReactive?: boolean;
    
    /**
     * 指向原始, 未代理 对象的引用
     */
    __raw?: unknown;
    
    /**
     * 内部标识, 标记当前实例为 Proxy 代理对象
     */
    __isReactiveProxy?: boolean;
    
    
    /**
     * 允许动态属性访问, 使用 `unknown` 保证类型安全
     *
     * @param key - 动态属性名
     * @returns 动态属性值
     */
    [key: string]: unknown;
}


/**
 * 依赖管理器接口
 */
export interface DepInterface {
    /**
     * 全量订阅者集合, 仅存放未指定变量的订阅者, 按需创建
     */
    subs?: Set<Function>;
    
    /**
     * 按变量名分组的精准订阅者映射
     *
     * Key: 变量名, 如 "count"
     * Value: 订阅该函数的订阅者集合
     */
    varSubs: Map<string, Set<Function>>;
    
    /**
     * 通知禁用标志
     */
    _paused?: boolean;
    
    
    /**
     * 添加订阅者
     *
     * @param fn - 订阅者函数, 当数据变化时被调用
     * @param variable - 可选, 订阅的变量名; null 或 undefined 表示全量订阅
     */
    subscribe(fn: Function, variable?: string | null): void;
    
    
    /**
     * 移除订阅者
     *
     * @param fn - 要移除的订阅者函数
     * @param variable - 可选, 指定变量名; null 或 undefined 表示从所有位置移除
     */
    unsubscribe(fn: Function, variable?: string | null): void;
    
    
    /**
     * 通知订阅者执行更新
     *
     * @param variable - 可选, 变化的变量名; null 或 undefined 表示通知所有订阅者
     */
    notify(variable?: string | null): void;
}
