import type { ReactiveInterface } from "../types";
import { parser } from "../core";
import { regDir } from "./regDir.ts";
import { initDir, onElRemove } from "../utils/lifecycle.ts";
import { elDeps } from "../utils/shared.ts";
import { Ridom } from "../core/ridom.ts";


/**
 * r-route 指令
 *
 * @param el - 当前元素
 * @param expr - 路由路径表达式
 * @param scope - 当前响应式作用域
 * @param deps - 依赖变量集合, 存储路径表达式中引用的变量名
 */
regDir("r-route", (el: HTMLElement, expr: string, scope: ReactiveInterface, deps: Set<string>): void => {
    // 防重复处理
    if (!initDir(el, expr, scope, "r-route", "rRoute")) return;
    
    // 解析路由路径
    const routePath = parser.parse(expr, scope, deps) as string;
    
    // 路径为空
    if (!routePath) return;
    
    // 将元素作为动态属性容器
    const elMap = el as unknown as Record<string, unknown>;
    
    // 清理旧的事件处理器
    if (elMap._routeHandler) el.removeEventListener("click", elMap._routeHandler as EventListener);
    
    // 创建并绑定新的事件处理器
    elMap._routeHandler = (event: Event): void => {
        event.preventDefault();
        if (Ridom.router.routes.has(routePath)) Ridom.router.nav(routePath);
    };
    
    // 绑定 click 事件监听器
    el.addEventListener("click", elMap._routeHandler as EventListener);
    
    // 注册到路由器的元素集合
    Ridom.router._registerRouteEl(el);
    
    // 元素移除时完整清理
    onElRemove(el, () => {
        // 移除事件监听器
        el.removeEventListener("click", elMap._routeHandler as EventListener);
        delete elMap._routeHandler;  // 释放函数引用, 帮助 GC
        
        // 从路由器的元素集合中注销
        Ridom.router._unregisterRouteEl(el);
        
        // r-route 只在初始化时解析一次路径, 不持有任何订阅, 这里只需丢弃依赖收集结果
        elDeps.delete(el);
        
        // 重置处理标记
        elMap.__rRouteProcessed = false;
    });
});
