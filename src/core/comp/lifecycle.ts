/**
 * 生命周期钩子名称列表
 */
export const LIFECYCLE_HOOKS = ["mounted", "unmounted"] as const;


/**
 * 非用户方法的保留名称集合
 */
export const NON_LIFECYCLE_METHODS = new Set<string>(["setup", ...LIFECYCLE_HOOKS]);
