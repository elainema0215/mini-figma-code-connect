/**
 * VARIANT 属性的定义住在 ComponentSet 上，其余属性也一并在那儿
 * （ComponentSet 的 componentPropertyDefinitions 同时包含 VARIANT 和 BOOLEAN/TEXT/INSTANCE_SWAP）。
 * 所以只取这一个 owner 不会漏属性，后面所有身份（key / name / id）都以它为准。
 */
export function definitionOwner(main) {
    return main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : main;
}
/** Step 3：组件 → 属性 schema */
export async function extractSchema(main) {
    const owner = definitionOwner(main);
    // 注意：这个 getter 在「是 variant 但拿不到所属 ComponentSet」时会 **抛错**，
    // 不是返回 undefined —— 所以必须 try/catch，`?? {}` 是无效防护。
    let defs = {};
    try {
        defs = owner.componentPropertyDefinitions;
    }
    catch {
        defs = {};
    }
    const properties = Object.keys(defs).map((key) => {
        const def = defs[key];
        return {
            // key 带 "#123:4" 后缀（VARIANT 除外）。只在展示层剥掉，查表时仍用完整 key
            name: key.split('#')[0],
            type: def.type,
            variantOptions: def.variantOptions ? def.variantOptions.slice() : undefined,
            defaultValue: typeof def.defaultValue === 'string' || typeof def.defaultValue === 'boolean'
                ? def.defaultValue
                : undefined,
        };
    });
    return {
        componentId: owner.id,
        componentKey: owner.key,
        componentName: owner.name,
        properties,
    };
}
