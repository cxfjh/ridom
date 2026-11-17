/**
 * 全局元素查找函数, 可在主文档和所有 shadowRoot 中查找元素
 *
 * @param id - 元素 ID
 * @returns 元素元素
 */
export const getByIdAny = (id: string) => {
    // 先在主文档找
    let el = document.getElementById(id);
    if (el) return el;
    
    // 找不到就遍历所有带 open shadowRoot 的宿主, 进 shadow 里找
    const all = document.querySelectorAll("*");
    for (const node of all) {
        if (node.shadowRoot) {
            el = node.shadowRoot.getElementById(id);
            if (el) return el;
        }
    }
    
    // 所有地方都没有找到, 返回 null
    return null;
};
