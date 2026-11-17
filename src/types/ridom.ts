import { batch, bind, bindText, compile, Dep, parser, watch } from "../core";
import { initDir, onElRemove, raf } from "../utils/lifecycle.ts";
import { regDir } from "../directives";
import type { activeFns } from "../utils/shared.ts";
import type { ReactiveInterface, RefInterface } from "./reactive.ts";
import type { CompOptions } from "./component.ts";
import type { RouterInterface } from "./router.ts";


/**
 * 全局 API 接口, window.Ridom 的类型定义
 */
export interface RidomInterface {
    /**
     * 注册自定义指令
     */
    regDir: typeof regDir;
    
    /**
     * 表达式解析器
     */
    parser: typeof parser;
    
    /**
     * 批量更新管理器
     */
    batch: typeof batch;
    
    /**
     * DOM 编译函数
     */
    compile: typeof compile;
    
    /**
     * 元素绑定函数
     */
    bind: typeof bind;
    
    /**
     * 文本节点绑定函数
     */
    bindText: typeof bindText;
    
    /**
     * 依赖管理类
     */
    Dep: typeof Dep;
    
    /**
     * 元素移除监听
     */
    onElRemove: typeof onElRemove;
    
    /**
     * 指令初始化工具
     */
    initDir: typeof initDir;
    
    /**
     * 监听响应式数据变化
     */
    watch: typeof watch;
    
    /**
     * 创建响应式引用
     *
     * @param initialValue - 初始值
     * @returns RefInterface 实例
     */
    ref: <T>(initialValue: T) => RefInterface<T>;
    
    /**
     * 创建响应式代理对象
     *
     * @param target - 要代理的原始对象
     * @returns 传入字面量时返回 `T & ReactiveInterface`, 保留原始形状; 传入 `unknown` 时返回 `ReactiveInterface`
     */
    reactive: {
        <T extends object>(target: T): T & ReactiveInterface;
        (target: unknown): ReactiveInterface;
    };
    
    /**
     * 向根作用域注入数据
     *
     * @param key - 键名或键值对对象
     * @param value - 可选, 键对应的值
     */
    provide: (key: string | Record<string, unknown>, value?: unknown) => void;
    
    /**
     * 定义组件
     *
     * @param compName - 组件名称, 全局唯一
     * @param options - 组件配置选项, 模板, 样式, 脚本, 属性
     * @returns 组件工厂函数, 如果设置了自动挂载, 返回 undefined
     */
    dom: (compName: string, options: CompOptions) => unknown;
    
    /**
     * 注册挂载完成回调
     *
     * @param callback - 挂载完成时执行的回调函数
     */
    onMounted: (callback: Function) => void;
    
    /**
     * 路由管理器实例
     */
    router: RouterInterface;
    
    /**
     * 根作用域
     */
    readonly rootScope: ReactiveInterface | null;
    
    /**
     * 组件实例缓存
     *
     * Key: 组件根元素
     * Value: 组件实例
     */
    cpInsts: WeakMap<HTMLElement, unknown>;
    
    /**
     * 活跃的更新函数集合
     */
    activeFns: typeof activeFns;
    
    /**
     * 步执行函数, 确保在浏览器渲染完成后执行
     */
    raf: typeof raf;
}


/**
 * 全局 Window 类型
 */
declare global {
    interface Window {
        Ridom: RidomInterface;
    }
}
