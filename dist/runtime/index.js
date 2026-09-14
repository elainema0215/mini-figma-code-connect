/**
 * 包的公开入口。消费方的 .figma.ts 文件从这里导入，不用相对路径 `'../runtime/define'`——
 * .figma.ts 现在就放在消费方自己的仓库里（比如 trex-website/apps/rexy/figma-mappings/），
 * 跟这个引擎仓库没有相对路径关系，只能靠包名导入：
 *
 *   import { defineTemplate, code } from 'mini-figma-code-connect'
 */
export { defineTemplate } from './define';
export { code } from './tagged';
