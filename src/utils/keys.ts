/**
 * 作用域 key 缓存, 避免重复遍历原型链
 */
const _mergedKeys = new WeakMap<object, string[]>();


/**
 * 形状池, key 序列相同的作用域共享同一数组实例, 作为表达式编译缓存的桶键以复用编译结果
 */
const _shapes = new Map<string, string[]>();


/**
 * 形状池容量上限, 超出后按插入顺序淘汰
 */
const MAX_SHAPES = 512;


/**
 * 把 key 列表内联到形状池
 *
 * @param keys - 待内联的 key 列表
 * @returns 池中已有的等价实例, 或本次传入的实例
 */
const internShape = (keys: string[]): string[] => {
    const sig = keys.join("\u0001");
    const hit = _shapes.get(sig);
    if (hit !== undefined) return hit;
    if (_shapes.size >= MAX_SHAPES) _shapes.delete(_shapes.keys().next().value as string);
    _shapes.set(sig, keys);
    return keys;
};


/**
 * 校验字符串是否为合法的 JavaScript 标识符
 *
 * @param key - 待校验的字符串
 * @returns {boolean} 合法返回 true, 非法返回 false
 */
const isValidIdentifier = (key: string): boolean => {
    if (!key) return false;
    const first = key.charCodeAt(0);
    if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95 || first === 36)) return false;
    for (let i = 1; i < key.length; i++) {
        const c = key.charCodeAt(i);
        if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 36)) return false;
    }
    return true;
};


/**
 * 收集作用域的所有可枚举 key, 含原型链, 复用父级缓存避免每次遍历完整原型链
 *
 * @param scope - 作用域对象, 可能是通过 Object.create 创建的子作用域
 * @returns 合并后的 key 列表, 自有 key 排在前面, 仅包含合法 JS 标识符
 */
export const getKeys = (scope: object): string[] => {
    // 缓存命中, 直接返回之前计算的结果
    const cached = _mergedKeys.get(scope);
    if (cached) return cached;
    
    /**
     * 过滤掉非法的 JavaScript 标识符
     *
     * @param arr 待过滤的字符串数组
     * @returns 过滤后的合法字符串数组
     */
    const filter = (arr: string[]): string[] => {
        const result: string[] = [];
        for (let i = 0; i < arr.length; i++) if (isValidIdentifier(arr[i])) result.push(arr[i]);
        return result;
    };
    
    // 收集自有 key
    const rawOwnKeys = Object.keys(scope);
    const proto = Object.getPrototypeOf(scope);
    
    // 无原型链或原型为 Object.prototype, 直接返回过滤后的自有 key
    if (!proto || proto === Object.prototype) {
        const filtered = internShape(filter(rawOwnKeys));
        _mergedKeys.set(scope, filtered);
        return filtered;
    }
    
    // 递归获取父级 key, 第二次调用起命中缓存, `O(1)` 返回
    const parentKeys = getKeys(proto);
    const seen = new Set(rawOwnKeys);
    const merged = rawOwnKeys.slice();
    for (let i = 0; i < parentKeys.length; i++) {
        if (!seen.has(parentKeys[i])) {
            seen.add(parentKeys[i]);
            merged.push(parentKeys[i]);
        }
    }
    
    // 缓存过滤后的结果, 下次直接返回
    const filtered = internShape(filter(merged));
    _mergedKeys.set(scope, filtered);
    return filtered;
};
