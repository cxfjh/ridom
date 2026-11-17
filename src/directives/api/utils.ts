/**
 * 带请求体的 HTTP 方法集合
 */
export const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);


/**
 * 快速深度相等比较
 *
 * @param a - 比较值 A, 可是任意类型
 * @param b - 比较值 B, 必须与 A 同类型才可能深度相等
 * @param depth - 当前递归深度, 内部使用, 从 0 开始, 最大 50
 * @returns `true` 表示两个值深度相等, `false` 表示不相等
 */
export const fastEqual = (a: unknown, b: unknown, depth = 0): boolean => {
    // 最大递归深度 50, 防止循环引用导致栈溢出
    if (depth > 50) return a === b;
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
    
    // 数组比较, 逐元素递归比较
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!fastEqual(a[i], b[i], depth + 1)) return false;
        return true;
    }
    
    // 对象比较, 比较键数量, 然后逐键递归比较值
    if (typeof a === "object" && typeof b === "object") {
        const keysA = Object.keys(a as Record<string, unknown>);
        const keysB = Object.keys(b as Record<string, unknown>);
        
        // 键数量不同, 不可能相等
        if (keysA.length !== keysB.length) return false;
        for (let i = 0; i < keysA.length; i++) {
            const k = keysA[i];
            
            // 使用 hasOwnProperty 确保只比较自有属性, 不涉及原型链
            if (!Object.hasOwn(b as object, k)) return false;
            if (!fastEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth + 1)) return false;
        }
        return true;
    }
    
    return false;
};


/**
 * 移动子节点到目标 DocumentFragment
 *
 * @param from - 源节点, 其子节点将被移出
 * @param to - 目标 DocumentFragment, 接收移动过来的子节点
 */
export const moveChild = (from: Node, to: DocumentFragment): void => {
    const children = from.childNodes;
    let child = children[0];
    while (child) {
        to.appendChild(child);
        child = children[0];
    }
};
