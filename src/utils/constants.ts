/**
 * 插值表达式正则, 带 `g` 标志, 用于全局匹配
 */
export const INTERP_REGEX = /(\\)?\{\{([^}]+?)}}/g;


/**
 * 插值表达式正则, 无 `g` 标志, 用于检测单个实例
 */
export const INTERP_TEST = /(\\)?\{\{([^}]+?)}}/;


/**
 * 判断字符串中是否包含 `{{ }}` 插值, 用无状态正则避免全局 `lastIndex` 残留漏判
 *
 * @param value - 待检测的字符串
 * @returns 包含插值返回 `true`
 */
export const hasInterp = (value: string): boolean => INTERP_TEST.test(value);


/**
 * JS 变量路径正则, 用于匹配变量名或属性访问路径
 */
export const VARIABLE_REGEX = /[a-zA-Z_$][\w$]*(?:\.[\w$]+)*/g;


/**
 * DOM 事件名称映射表
 */
export const EVENT_MAP: Readonly<Record<string, string>> = Object.freeze({
    click: "click",
    dblclick: "dblclick",
    mousedown: "mousedown",
    mouseup: "mouseup",
    mouseover: "mouseover",
    mouseout: "mouseout",
    mousemove: "mousemove",
    keydown: "keydown",
    keyup: "keyup",
    keypress: "keypress",
    focus: "focus",
    blur: "blur",
    input: "input",
    change: "change",
    submit: "submit",
    contextmenu: "contextmenu",
    scroll: "scroll",
    resize: "resize",
});


/**
 * 键盘按键别名映射表
 */
export const KEY_MAP: Readonly<Record<string, string>> = Object.freeze({
    enter: "Enter",
    esc: "Escape",
    escape: "Escape",
    tab: "Tab",
    space: " ",
    backspace: "Backspace",
    delete: "Delete",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    ctrl: "Control",
    shift: "Shift",
    alt: "Alt",
    meta: "Meta",
});
