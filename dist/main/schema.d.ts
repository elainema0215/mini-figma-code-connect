import type { ComponentSchema } from '../runtime/types';
/**
 * VARIANT 属性的定义住在 ComponentSet 上，其余属性也一并在那儿
 * （ComponentSet 的 componentPropertyDefinitions 同时包含 VARIANT 和 BOOLEAN/TEXT/INSTANCE_SWAP）。
 * 所以只取这一个 owner 不会漏属性，后面所有身份（key / name / id）都以它为准。
 */
export declare function definitionOwner(main: ComponentNode): ComponentNode | ComponentSetNode;
/** Step 3：组件 → 属性 schema */
export declare function extractSchema(main: ComponentNode): Promise<ComponentSchema>;
/**
 * 把当前实例上的可读取值写进 schema（面板「取值」列用）。
 * INSTANCE_SWAP 解析为绑定该属性的子实例图层名；其余类型直接用 property value。
 */
export declare function withCurrentLabels(schema: ComponentSchema, node: InstanceNode): ComponentSchema;
