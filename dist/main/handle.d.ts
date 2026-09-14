import type { AccessorCall, ErrorLike, InstanceLike, TemplateResult, TextLike } from '../runtime/types';
/** 预解析好的主组件身份 */
export type MainRef = {
    id: string;
    key: string;
    name: string;
};
/**
 * render() 是同步的（跟真实 CC 一致），但 Figma 的 getMainComponentAsync 是异步的。
 * 解法：执行模板前先把整棵实例子树的主组件身份解析好塞进 ctx，句柄层就能保持同步。
 */
export type RenderCtx = {
    mainByNode: Map<string, MainRef>;
    calls: AccessorCall[];
    depth: number;
    /**
     * 探测模式：所有 getBoolean 一律返回 true。
     * 用来跑第二遍 render，收集「模板最多会碰到哪些属性」——
     * 否则条件分支里的属性（Has Icon 为 false 时的 Icon）会被误报成「未映射」。
     */
    probe?: boolean;
};
export declare class ErrorHandle implements ErrorLike {
    readonly message: string;
    readonly type: "ERROR";
    constructor(message: string);
}
export declare class InstanceHandle implements InstanceLike {
    private node;
    private ctx;
    readonly type: "INSTANCE";
    constructor(node: InstanceNode, ctx: RenderCtx);
    get name(): string;
    private entryKey;
    /** 保留 type —— 否则 getString 之类无法察觉自己读错了属性类型 */
    private entry;
    private log;
    getString(prop: string): string;
    getBoolean(prop: string): boolean;
    getBoolean<T>(prop: string, mapping: {
        true: T;
        false: T;
    }): T;
    /** 字典查表。命中不了就返回 undefined —— 跟真实 CC 一样静默，靠 validate() 事后揪出来 */
    getEnum<T>(prop: string, mapping: Record<string, T>): T | undefined;
    /** 绑插槽而不是绑图层名：找到把 mainComponent 绑在这个属性上的后代实例 */
    getInstanceSwap(prop: string): InstanceLike | ErrorLike | null;
    findInstance(layerName: string): InstanceLike | ErrorLike;
    findText(layerName: string): TextLike | ErrorLike;
    private template;
    hasCodeConnect(): boolean;
    codeConnectId(): string | null;
    /** 递归求值：子模板的输出直接插进父模板的字面量 */
    executeTemplate(): TemplateResult | null;
}
