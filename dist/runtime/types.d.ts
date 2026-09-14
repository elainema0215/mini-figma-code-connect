/**
 * 迷你 Code Connect 运行时的类型定义。
 *
 * 关键一点，也是整套实现的地基：模板的输出不是字符串，而是 ResultSection[]。
 * 这样才能在拼装时保留实例身份、并让错误就地降级而不是拖垮整段 snippet。
 */
/** 一段普通代码文本 */
export type CodeSection = {
    type: 'CODE';
    code: string;
};
/** 「有实例但没有映射」的占位段：保留实例身份，真实 CC 在这里渲染成可展开的 pill */
export type InstanceSection = {
    type: 'INSTANCE';
    guid: string;
    symbolId: string;
    name: string;
};
/** 就地降级的错误段 */
export type ErrorSection = {
    type: 'ERROR';
    message: string;
};
export type ResultSection = CodeSection | InstanceSection | ErrorSection;
/** Figma 组件属性的封闭类型集（真实 CC 还有 SLOT，简版不做） */
export type FigmaPropertyType = 'TEXT' | 'BOOLEAN' | 'VARIANT' | 'INSTANCE_SWAP';
export type PropertyDef = {
    name: string;
    type: FigmaPropertyType;
    variantOptions?: string[];
    defaultValue?: string | boolean;
};
/** Step 3 的产出：组件的属性 schema —— 映射的「左手边」 */
export type ComponentSchema = {
    componentId: string;
    componentKey: string;
    componentName: string;
    properties: PropertyDef[];
};
export type TemplateResult = {
    example: ResultSection[];
    id: string;
    imports?: string[];
    metadata?: {
        nestable?: boolean;
        props?: Record<string, unknown>;
    };
};
/** 头部三行绑定注释的结构化版本（真实 CC 是在构建时解析注释） */
export type TemplateMeta = {
    url: string;
    source: string;
    component: string;
};
export type Template = {
    meta: TemplateMeta;
    id: string;
    /** 怎么认出这个模板对应哪个 Figma 组件：优先 componentKey，退回组件名 */
    match: {
        componentName: string;
        componentKey?: string;
    };
    /**
     * 映射的实体是这个函数，不是任何一段固定代码。
     * 写一份，覆盖该组件的全部 variant 组合。
     */
    render: (instance: InstanceLike) => TemplateResult;
};
/** 模板能看到的实例接口（accessor 层） */
export interface InstanceLike {
    readonly type: 'INSTANCE';
    readonly name: string;
    getString(prop: string): string;
    getBoolean(prop: string): boolean;
    getBoolean<T>(prop: string, mapping: {
        true: T;
        false: T;
    }): T;
    getEnum<T>(prop: string, mapping: Record<string, T>): T | undefined;
    getInstanceSwap(prop: string): InstanceLike | ErrorLike | null;
    findInstance(layerName: string): InstanceLike | ErrorLike;
    findText(layerName: string): TextLike | ErrorLike;
    hasCodeConnect(): boolean;
    codeConnectId(): string | null;
    executeTemplate(): TemplateResult | null;
}
/** 注意 type 是 'ERROR' 而不是 null —— 查找失败返回的是 truthy 的句柄。
 *  这是真实 CC 的实现权衡：为了把 message 带下去渲染成 ERROR 段而放弃 null 惯例。
 *  代价就是模板里每次都得写 `x.type === 'INSTANCE'` 检查。 */
export interface ErrorLike {
    readonly type: 'ERROR';
    readonly message: string;
}
export interface TextLike {
    readonly type: 'TEXT';
    readonly name: string;
    readonly textContent: string;
}
/** 一次 accessor 调用的记录，供 Step 6 的自动校验使用 */
export type AccessorCall = {
    depth: number;
    prop: string;
    method: 'getString' | 'getBoolean' | 'getEnum' | 'getInstanceSwap';
    mappingKeys?: string[];
    ok: boolean;
    note?: string;
};
