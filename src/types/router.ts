/**
 * 路由条目信息
 */
export interface RouteInfo {
    /**
     * 路由处理函数, 负责渲染该路由对应的页面内容
     */
    handler: Function;
    
    /**
     * 路由对应的目标容器名, 供多容器路由场景
     */
    target: string;
}


/**
 * 路由页面容器信息
 */
export interface RoutePageInfo {
    /**
     * 页面容器 DOM 元素, 即带 r-page 属性的元素
     */
    container: HTMLElement;
    
    /**
     * 所属目标容器名, 对应 route 属性值, 默认 "default"
     */
    target: string;
}


/**
 * 路由管理器接口
 */
export interface RouterInterface {
    /**
     * 已注册的路由映射表
     *
     * Key: 路由路径, 如 "/home", "/about"
     * Value: 路由处理函数和目标容器名
     */
    routes: Map<string, RouteInfo>;
    
    /**
     * 各目标容器当前激活的路径
     *
     * Key: 目标容器名, 如 "default"
     * Value: 当前激活的路由路径, 如 "/home"
     */
    activePaths: Map<string, string>;
    
    /**
     * 页面容器映射
     *
     * Key: 路由路径, 如 "/home", "/about"
     * Value: 页面容器信息
     */
    pages: Map<string, RoutePageInfo>;
    
    /**
     * 原始页面元素内容备份
     *
     * Key: 路径字符串
     * Value: 页面的原始 HTML 和目标容器名
     */
    origPages: Map<string, {html: string; target: string}>;
    
    /**
     * 路由目标容器 DOM 引用
     *
     * Key: 目标容器名
     * Value: 容器 DOM 元素
     */
    targets: Map<string, HTMLElement>;
    
    /**
     * popstate 事件处理器引用
     */
    _popstateHandler: () => void;
    
    /**
     * 所有 r-route 元素集合
     */
    _routeEls: Set<HTMLElement>;
    
    
    /**
     * 注册 r-route 元素到路由系统
     *
     * @param el 要注册的 r-route 元素
     */
    _registerRouteEl(el: HTMLElement): void;
    
    
    /**
     * 从路由系统注销 r-route 元素
     *
     * @param el 要注销的 r-route 元素
     */
    _unregisterRouteEl(el: HTMLElement): void;
    
    
    /**
     * 注册路由
     *
     * @param path - 路由路径, 如 "/home", "/about"
     * @param handler - 路由处理函数, 负责渲染页面内容
     * @param target - 目标容器名, 默认 "default"
     */
    add(path: string, handler: Function, target?: string): void;
    
    
    /**
     * 导航到指定路径
     *
     * @param path - 目标路径
     * @param replace - 是否替换当前历史记录, false 则新增一条记录
     * @param unload - 是否卸载旧页面, 默认 false
     */
    nav(path: string, replace?: boolean, unload?: boolean): void;
    
    
    /**
     * 初始化路由系统
     */
    init(): void;
    
    
    /**
     * 解析当前 URL 中的路径参数
     *
     * @returns 路径字符串, 无 path 参数时返回 "/"
     */
    _parsePath(): string;
    
    
    /**
     * 执行指定路径的路由处理
     *
     * @param path - 目标路径
     * @param unload 是否卸载旧页面, 默认 false
     */
    _execRoute(path: string, unload?: boolean): void;
    
    
    /**
     * 预渲染所有已注册的路由页面
     */
    _preRenderAll(): void;
    
    
    /**
     * 渲染单个路由页面
     *
     * @param path - 路由路径
     * @param targetName - 目标容器名
     */
    _renderPage(path: string, targetName: string): void;
    
    
    /**
     * 卸载路由页面, 拆除绑定并从 DOM 移除
     *
     * @param path - 路由路径
     */
    _unloadPage(path: string): void;
    
    
    /**
     * 收集并移除 DOM 中的原始页面元素
     */
    _collectOrigPages(): void;
}
