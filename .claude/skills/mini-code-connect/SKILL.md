---
name: mini-code-connect
description: 把 Figma 组件 schema.json（单个或数组）映射成 (a) 消费方项目里的 .figma.ts 模板，(b) 纯数据版的 figma-mapping-table.json（供其他项目/skill 直接查表，不依赖运行时）。用户提到"映射"、"mapping"、提供 schema.json，或要求"跑一下 mini-code-connect"时使用。**跟官方 figma-code-connect skill 的区别**：不需要 Organization/Enterprise plan，读的是插件导出的 schema.json（不是实时 Figma MCP），产出格式是 defineTemplate/code，不是官方 figma.connect()/parser 格式——两者不兼容，不要混用。
disable-model-invocation: false
---

# Mini Code Connect

将 Figma 组件 schema 关联到真实代码组件，生成 `.figma.ts`（`defineTemplate`/`code` 格式，区别于官方 `figma.connect()` 格式，见下方“格式参考”）。

**这个 skill 本身（`mini-figma-code-connect` 引擎）不装真实映射数据**——它是被各个消费方项目（比如 `trex-website/apps/rexy`）以 npm 依赖（或本地 `link:`）装进去用的一个纯引擎包。真正的 `.figma.ts`、`figma-mapping-table.json`、`figma-mapping.config.json` 都应该生成在**消费方项目自己的目录里**，不是这个引擎仓库里。执行前先确认当前要处理的是哪个消费方项目（通常从用户的上下文或已打开的项目判断；如果不确定，问一句）。

这是 agent 驱动的工作流，不是脚本——由 agent 直接阅读代码判断组件对应关系。`scripts/figma-mapping/` 下有一套本地正则打分 CLI 作为无 agent 场景的兜底方案，运行时以**当前工作目录**（即消费方项目根目录，而不是这个引擎仓库）为准来读 config、写 `.figma.ts`。

## 输入

单个 `ComponentSchema`，或其数组（插件"导出全部 schema.json"的产出）。数组按顺序逐个处理：完成一个（写入文件）再处理下一个；遇到需要用户确认的项先跳过，继续处理数组中其余可确定的项，待遇到的问题集中在最后一并询问，避免整批阻塞。

## 步骤

1. **查重。** 检查消费方项目 `figma-mappings/*.figma.ts` 中是否已存在同名或同 key 的 `match`（`registry.generated.ts` 是自动生成的，不体现实际列表，查重要看 `.figma.ts` 文件本身）。已存在时询问用户保留、覆盖还是作为新映射处理——同一批 schema 可能混合了已处理和未处理的项，不查重会导致重复生成。

2. **定位候选组件。** 读取消费方项目根目录下 `figma-mapping.config.json` 的 `codeConnect.paths`（不存在就复制引擎包的 [figma-mapping.config.example.json](../../../figma-mapping.config.example.json) 到消费方项目根目录创建一份——内容都是项目内相对路径，可以直接提交 git）。**注意文件名是 `figma-mapping.config.json` 不是 `figma.config.json`**——后者是官方 Figma Code Connect CLI 认的文件名，消费方项目里可能已经有一份官方的（比如 `trex-website/apps/rexy` 就有一份官方 `figma.config.json` + 顶层 `Button.figma.ts`，那是完全独立的另一套东西，不要混淆也不要覆盖）。拿到 `paths` 后遍历这些目录下的 `.ts`/`.tsx` 文件（排除 `.figma.ts`），阅读 Props 定义判断语义是否对应——组件名相似度仅供参考，Props 语义一致性才是判定依据。没有合适候选时明确说明，不做牵强匹配。

3. **映射属性。** 按 [handle.ts](../../../src/main/handle.ts) 的 accessor 对应关系处理：

   | Figma 类型 | accessor |
   |---|---|
   | TEXT | `getString('属性名')` |
   | BOOLEAN | `getBoolean('属性名')`——若代码侧是其他形式（例如从某个枚举拆分出的 disabled/loading），按实际语义处理 |
   | VARIANT | `getEnum('属性名', {...})`，字典须覆盖 `variantOptions` 的每一个值，遗漏会静默返回 undefined |
   | INSTANCE_SWAP | `getInstanceSwap('属性名')` + `.executeTemplate()?.example`，使用前需判断 `.type === 'INSTANCE'` |

   无法确定的判断仍需给出结论，但要在文件头部注释中注明"此处为推测"。确实无法推断的情况（缺少精确对应的图标组件、无法确定文案图层名）应停下询问用户，不得生成语法正确但语义错误的内容。禁止编造代码中不存在的 prop。

4. **生成 `.figma.ts`**，格式见下方“格式参考”。写到消费方项目根目录的 `figma-mappings/<组件名>.figma.ts`。`meta.source` 字段填写真实组件文件相对消费方项目根目录的路径。`imports` 按 `figma-mapping.config.json` 的 `importPaths` 做前缀匹配换算。

5. **同步写入一条 `figma-mapping-table.json` 记录。** 该文件面向本仓库之外的消费方（其他 skill、其他项目查表使用），与 `.figma.ts` 内容对应但格式不同——纯数据，不含 `defineTemplate`/`getEnum` 等仅本仓库运行时可识别的内容。默认文件名为 `figma-mapping-table.json`（与 `buildPlugin` / `scaffold-plugin` 默认一致）。记录结构：

   ```json
   {
     "figmaComponentName": "...",
     "figmaComponentKey": "...",
     "codeComponent": "...",
     "codeSource": "相对候选组件所在仓库根目录的路径",
     "codeImportSpecifier": "真实 import 使用的 specifier",
     "props": [
       { "figmaProp": "...", "figmaType": "...", "codeProp": "..." 或 null,
         "valueMap": {...} 或 null, "confidence": "matched" | "guessed" | "unmatched",
         "note": "判断依据，guessed/unmatched 必须填写" }
     ],
     "unmappedNotes": ["属性完全无法推断时记录在此，例如缺少 TEXT 属性导致拿不到文案图层名"]
   }
   ```

   `codeSource`/`codeImportSpecifier` 需与该记录来源的候选目录对应（消费方项目里 `figma-mapping.config.json` 声明的候选目录）；`props` 逐条对应第 3 步的判断结果，`confidence`/`note` 为必填字段。**此步骤需保持幂等**：按 `figmaComponentKey`（缺失时按 `figmaComponentName`）检查 `figma-mapping-table.json` 中是否已有同一条记录，存在则整条替换，不存在则追加，不产生重复记录。

6. **落盘前向用户展示结果**，标注所有推测性判断，待确认后再写入。

7. **写入范围限定在当前消费方项目**：`figma-mappings/*.figma.ts`、`figma-mapping-table.json`。**绝不写入这个引擎仓库（`mini-figma-code-connect`）自己**——它不装任何真实映射数据，只提供 `defineTemplate`/`code` 运行时和 CLI/构建脚本。如果当前上下文涉及多个候选消费方项目、不确定该往哪个项目写，先问用户。

8. **全部处理完成后统一验证一次**，而非逐个组件执行——在**消费方项目**里跑它自己的类型检查 + 插件构建脚本（例如 `trex-website/apps/rexy` 是）：

   ```bash
   pnpm --filter rexy run type-check
   pnpm --filter rexy run figma:build
   ```

   `figma:build` 背后调用的是引擎包导出的 `buildPlugin()`，会自动先重新扫描消费方项目的 `figma-mappings/**/*.figma.ts` 生成 `registry.generated.ts`——新建/修改的 `.figma.ts` 会自动被收录，不需要手动加 import。出现编译错误须就地修复。通过后提示用户回到 Figma 插件面板，通过"重新读取"或"扫描页面"确认效果。

## 格式参考

```ts
import { defineTemplate, code } from 'mini-figma-code-connect'

export default defineTemplate({
  meta: {
    url: 'https://www.figma.com/design/FILE_KEY/...?node-id=NODE_ID',
    source: '相对消费方项目根目录的真实组件文件路径',
    component: 'Button',
  },
  id: 'button',
  match: { componentName: 'Button', componentKey: 'FIGMA_COMPONENT_KEY' },

  render(instance) {
    const label = instance.getString('Label')
    const disabled = instance.getBoolean('Disabled')
    const size = instance.getEnum('Size', { Large: 'large', Medium: 'medium', Small: 'small' })

    return {
      example: code`<Button size="${size}"${disabled ? code` disabled` : ''}>${label}</Button>`,
      imports: ['import { Button } from "@/components/button"'],
      id: 'button',
    }
  },
})
```

- INSTANCE_SWAP 嵌套写法、无属性组件、推测性判断标注等更复杂的实际案例，参考已经生成在消费方项目里的 `.figma.ts` 文件本身（比如 `trex-website/apps/rexy/figma-mappings/`），不再维护在这个引擎仓库里。
- [types.ts](../../../src/runtime/types.ts) 的 `InstanceLike`——accessor 类型定义（`getString`/`getBoolean`/`getEnum`/`getInstanceSwap`/`findText`）。
