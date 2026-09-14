// templates 数组不再手写维护 —— 由 scripts/generate-registry.mjs 扫 .figma.ts 自动生成，
// 每次 build 前重跑，文件挪了/加了/删了自动跟上，不需要手动加 import。
// 真实 Code Connect 是把模板发布到 Figma 服务端（CLI publish 或 MCP add_code_connect_map），
// 由 Figma 在读取时执行；这里为了「装进插件就能跑」，改成插件内注册表。
import { templates } from './registry.generated';
export { templates };
/** 先按 componentKey 精确匹配（绑定过的），再退回组件名 */
export function lookup(componentKey, componentName) {
    const byKey = templates.find((t) => t.match.componentKey && t.match.componentKey === componentKey);
    if (byKey)
        return byKey;
    return templates.find((t) => t.match.componentName === componentName) ?? null;
}
