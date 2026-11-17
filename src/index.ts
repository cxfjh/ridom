import { compile, reactive } from "./core";
import { Ridom } from "./core/ridom.ts";
import "./directives/index.ts";
import { router } from "./router";
import { dirs, mountCbs, pendProv, requestFrame, setRootScope } from "./utils/shared.ts";
import { observer } from "./utils/observer.ts";


/**
 * 是否运行在浏览器环境, 保证模块可在 SSR / Node 测试中被安全导入
 */
const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";


/**
 * 是否已经启动
 */
let started = false;


/**
 * 启动应用
 *
 * @param root - 应用根节点或选择器, 缺省时依次查找 `[r-app]` 与 `document.body`
 */
const start = (root?: HTMLElement | string): void => {
    if (started || !isBrowser) return;
    started = true;
    
    // 创建根作用域
    const rootScope = reactive({});
    setRootScope(rootScope);
    
    // 查找应用根元素
    const target = typeof root === "string" ? document.querySelector(root) : root;
    const appRoot = (target as HTMLElement | null) || document.querySelector("[r-app]") || document.body;
    
    // 注入 Provide 数据
    pendProv.forEach(([key, value]) => (rootScope as Record<string, unknown>)[key] = value);
    pendProv.length = 0;
    
    // 编译 DOM
    compile(appRoot, rootScope);
    
    // 启动 DOM 变更监听
    observer.observe(appRoot, { childList: true, subtree: true, attributes: true, attributeFilter: Array.from(dirs.keys()) });
    
    // 初始化路由系统
    router.init();
    
    // 延迟执行 onMounted 回调
    requestFrame(() => {
        // 执行所有通过 Ridom.onMounted 注册的回调
        mountCbs.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error("[onMounted] 回调函数执行出错:", error);
            }
        });
        
        // 清空回调队列, 释放内存
        mountCbs.length = 0;
    });
};


/**
 * 应用是否已启动
 */
const isStarted = (): boolean => started;


// 挂载到 Ridom 类上, 与 onMounted / dom 等其他静态 API 保持一致
Ridom.start = start;
Ridom.isStarted = isStarted;


if (isBrowser) {
    // 挂载 API 到全局 window 对象
    window.Ridom = Ridom;
    
    // 支持通过 `window.__RIDOM_MANUAL__ = true` 关闭自动启动, 由业务代码自行调用 start
    if (!(window as unknown as Record<string, unknown>).__RIDOM_MANUAL__) {
        // 脚本晚于 DOMContentLoaded 加载时, defer / 动态插入 直接启动, 否则等事件
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start());
        else start();
    }
}


export default Ridom;
