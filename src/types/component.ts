/**
 * 组件配置选项
 */
export interface CompOptions {
    /**
     * 组件 HTML 模板字符串
     */
    template: string;

    /**
     * 组件 CSS 样式字符串, 可选
     */
    style?: string;

    /**
     * 组件脚本逻辑工厂函数, 可选
     */
    script?: (props: Record<string, unknown>, utils: Record<string, unknown>) => Record<string, unknown>;

    /**
     * 组件属性定义, 默认值, 可选
     */
    props?: Record<string, unknown>;

    /**
     * 自动挂载目标, 可选
     */
    to?: string[];

    /**
     * 是否启用 CSS 作用域隔离, 可选, 默认 true
     */
    sty?: boolean;
}
