/**
 * 组件样式表缓存, 同一份 CSS 只解析一次, 通过 adoptedStyleSheets 在所有实例间共享
 */
export const sheetCache = new Map<string, CSSStyleSheet>();


/**
 * 已注入过全局样式的组件标识, 无隔离模式下避免每个实例都插一份 <style>
 */
export const lightStyled = new Set<string>();


/**
 * 获取组件共享样式表
 *
 * @param key - 缓存键
 * @param css - 样式文本
 * @returns 共享样式表; 环境不支持构造样式表时返回 null
 */
export const getStyleSheet = (key: string, css: string): CSSStyleSheet | null => {
    if (typeof CSSStyleSheet === "undefined" || typeof CSSStyleSheet.prototype.replaceSync !== "function") return null;
    let sheet = sheetCache.get(key);
    if (!sheet) {
        try {
            sheet = new CSSStyleSheet();
            sheet.replaceSync(css);
        } catch {
            return null;
        }
        sheetCache.set(key, sheet);
    }
    return sheet;
};


/**
 * 为 Shadow DOM 应用组件样式, 优先用 `adoptedStyleSheets` 共享同一份 CSSOM, 避免每个实例重复解析
 *
 * @param shadowRoot - 组件挂载的 Shadow Root
 * @param compName - 组件名
 * @param compId - 组件实例标识, 回退路径下标记 <style>
 * @param css - 样式文本
 */
export const applyStyle = (shadowRoot: ShadowRoot, compName: string, compId: string, css: string): void => {
    const sheet = getStyleSheet(compName + "\u0000" + css, css);
    
    // 构造样式表可用时走共享路径
    if (sheet !== null && "adoptedStyleSheets" in shadowRoot) {
        const current = shadowRoot.adoptedStyleSheets;
        if (!current.includes(sheet)) shadowRoot.adoptedStyleSheets = [...current, sheet];
        return;
    }
    
    // 回退注入 <style> 元素
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-comp", compName);
    styleEl.setAttribute("data-comp-id", compId);
    styleEl.textContent = css;
    shadowRoot.appendChild(styleEl);
};
