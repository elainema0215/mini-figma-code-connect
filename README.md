# mini-figma-code-connect

**Local Code Connect for Figma Professional** — 无 Org / Enterprise 也能做确定性的 `f(instance) → snippet`。

面向 Pro 档团队的轻量替代引擎：Figma 插件 + 将设计组件映射到消费方真实代码库的工作流。
官方 Code Connect 与 Builder.io Design System Intelligence 均要求 Organization / Enterprise 订阅；团队当前为 Professional，相关 MCP 绑定工具不可用。本引擎在本地实现等价的「组件绑定 + 属性映射」：映射进消费方仓库、执行在 Figma 插件，不依赖云端 publish。插件沙箱无法读写本地代码，因此映射生成在沙箱外（agent / CLI）完成，再经构建打包进插件。


> 问题与反馈 → [GitHub Issues](https://github.com/elainema0215/mini-figma-code-connect/issues)。好用就 [⭐](https://github.com/elainema0215/mini-figma-code-connect)。

---

## 与官方 Code Connect 的差异

以下差异均为刻意设计，而非未实现的功能缺口：

| | 官方 Code Connect | 本实现 |
|---|---|---|
| 订阅计划 | Organization / Enterprise（Full 或 Dev 席位） | 任意计划 |
| 模板存储 | 发布至 Figma 服务端 | 构建时打包进插件 |
| 模板执行 | Figma 沙箱（Dev Mode / MCP） | 插件主线程，选中实例时执行 |
| 模板入口 | 顶层 `figma.selectedInstance` | `render(instance)` 参数 |
| 组件发布 | 必须已发布 | 未发布可按组件名匹配 |
| SLOT | 支持 `getSlot()` | 仅 TEXT / BOOLEAN / VARIANT / INSTANCE_SWAP |
| 多框架 | `label` 多映射并行 | 仅 React 一条 |
| 穷举校验 | 缺值静默 | `validate()` 自动对账 |
| 绑定判定 | 服务端映射或 Code Connect UI 手选 | agent 读代码（skill）+ 人工 review，或本地正则打分兜底 |

---

## 已知限制

- **尚未接入基于 REST API 与 Personal Access Token 的 schema 拉取能力**。该方案理论可行（通用 Figma REST API 不受 Code Connect 订阅限制），但目前唯一的数据来源仍是插件手动导出的 schema.json。
- **不提供跨消费方的数据新鲜度检查**。某个消费方代码库更新后，此前标记为 `guessed` / `unmatched` 的映射条目是否已可补全，需人工发起新一轮映射流程，引擎本身不做追踪。

---

## 消费方接入步骤

面向将 `mini-figma-code-connect` 接入自身项目、并开始建立 Figma 组件映射的使用者。所有命令默认在消费方项目目录（含 `package.json` 的目录）下执行；若为 monorepo，请进入已安装该依赖的子包目录，勿在仓库根目录执行。

### 前置条件

- 消费方项目为 npm/pnpm 项目（存在 `package.json`），且位于 git 仓库内——脚手架命令依赖 `.git` 定位仓库根目录。
- Node.js ≥ 18。

### 接入步骤

#### 1. 安装依赖

```bash
pnpm add -D mini-figma-code-connect
# 或：npm install -D mini-figma-code-connect
```

包尚未安装时，后续 CLI 命令均不存在。

#### 2. 执行一次性脚手架

```bash
pnpm exec mini-code-connect-scaffold-plugin --id <manifest-id>
```

`--id` 必填，同一 Figma 账号内不可与已导入插件重复。`--name` 可选（默认 `"Mini Code Connect"`），多插件并存时用于区分。

命令幂等：已有文件不覆盖；需重建时加 `--force`。会写入 skill、候选组件配置、manifest、构建脚本与 `package.json` scripts，并自动完成首次构建，之后可直接导入 Figma（步骤 4）。

仅需其中一步时：

```bash
pnpm exec mini-code-connect-install-skill
pnpm exec mini-code-connect-scaffold-manifest --id <manifest-id>
```

#### 3. 按需调整候选组件目录

若项目的组件目录并非 `components/`，或 import 写法并非 `@/` 别名，打开步骤 2 生成的 `figma-mapping.config.json` 修改 `paths`/`importPaths`：

```json
{
  "codeConnect": {
    "paths": { "components": "components" },
    "importPaths": { "components/*": "@/components/*" }
  }
}
```

文件内容均为项目内相对路径，可直接提交至 git。修改该文件不影响已生成的插件产物，不需要重新构建——它仅在建立映射时（步骤 5）由 skill/CLI 读取，用于定位候选组件。

#### 4. 导入 Figma

**Figma 桌面版 → 菜单 → Plugins → Development → Import plugin from manifest…**，选择 `<cwd>/manifest.json`。

如需 Dev Mode Code 区形态，以相同方式导入 `manifest.codegen.json`（`id` 不同，为独立记录，二者可同时导入）。


#### 5. 建立真实映射

1. 在插件面板中选中未映射实例，点击「导出 schema.json」（候选列表页可使用「导出全部 schema.json」批量导出）。
2. 在该消费方项目的 Claude Code 会话中（而非引擎仓库的会话），提供 schema.json 路径，或直接描述映射需求，以触发 `/mini-code-connect` skill。该 skill 将执行查重、扫描步骤 3 配置的候选目录、生成 `figma-mappings/*.figma.ts` 与 `figma-mapping-table.json`，写入位置为当前消费方项目，不写入引擎仓库。
3. 执行 `pnpm run figma:build`，将新生成的映射重新打包进插件。
4. 返回插件面板，点击「重新读取」或「扫描页面」，确认状态变为「已映射」。

无 agent 可用时，`pnpm exec figma-mapping <schema.json>` 提供本地正则打分作为兜底方案（同样支持批量 schema 数组与 `--ai` 模式），判断准确度低于 agent 现场读取代码，但落盘规则保持一致。

## 常见问题

1. **Q:** 命令找不到 / `EACCES: spawn …`  
   **A:** 先在已安装依赖的目录执行 `pnpm install`，刷新 `node_modules/.bin`。若仍报错，多半是引擎包脚本权限问题，反馈给引擎仓库。

2. **Q:** `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`  
   **A:** 不要在 monorepo 根目录跑 `pnpm exec`；进入已安装 `mini-figma-code-connect` 的子包再执行。

3. **Q:** 和官方 Code Connect 会冲突吗？  
   **A:** 不会覆盖。本方案用 `mini-code-connect` skill 与 `figma-mapping.config.json`，官方用 `figma-code-connect` / `figma.config.json`；格式不兼容，勿混用。

4. **Q:** 改了 manifest，Figma 没变化？  
   **A:** `editorType` / `capabilities` 在导入时缓存。需在 Figma 里删掉该开发插件后重新导入。`figma-plugin-dist/` 下的 `code.js` / `ui.html` 每次运行都会重读，改构建产物不必重导。

5. **Q:** 导入/运行插件时报 `EPERM: operation not permitted, open '…/figma-plugin-dist/code.js'`，或提示 *Unable to load code* / *loading the plugin environment*？  
   **A:** 这通常不是包本身坏了，而是 **macOS 隐私权限拦住了 Figma 读取本地文件**（项目在 `Desktop` / `Documents` 下时很常见）。处理：
   1. **系统设置 → 隐私与安全性 → 文件与文件夹**（必要时再开「完全磁盘访问权限」），给 **Figma** 勾选桌面 / 文稿等对应目录。
   2. 完全退出并重启 Figma。
   3. 在 Development 里删掉旧插件后，重新 **Import plugin from manifest…**。  
   也可把消费方仓库挪出受保护目录（例如 `~/Projects/`）再导入。

6. **Q:** `pnpm exec mini-code-connect-scaffold-plugin --id …` 报 `generate-registry: glob 里没有 *: "--id"`？  
   **A:** `0.1.3` 打包把多个 CLI 打进同一文件，导致 `generate-registry` 误跑并把 `--id` 当成 glob。请升级到 **`>=0.1.4`** 后重试。
