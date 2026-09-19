/**
 * 主线程。三个运行形态，共用同一条流水线：
 *
 *   figma.mode === 'codegen'  → Dev Mode 右侧 Code 区（真实 Code Connect 出现的位置）
 *   figma.mode === 'inspect'  → Dev Mode 右侧 Inspect 面板，铺满
 *   其余（Design 模式）        → 普通浮层面板
 *
 * 流水线本身刻意跟 figma-code-connect skill 的 6 步对齐：
 *   Step 1 归一化输入      —— 拿到 InstanceNode
 *   Step 2 任意节点 → 主组件 —— getMainComponentAsync + definitionOwner
 *   Step 3 组件 → 属性 schema —— extractSchema
 *   Step 4 找代码那一侧     —— registry.lookup（代码组件由模板的 meta.source 声明）
 *   Step 5 执行映射         —— template.render(handle)
 *   Step 6 自检             —— validate(schema, calls, probeCalls)
 */
import { extractSchema, definitionOwner, withCurrentLabels } from './schema';
import { InstanceHandle } from './handle';
import { lookup } from '../runtime/registry';
import { renderToString, collectErrors } from '../runtime/render';
import { validate } from './validate';
// build 时打包进 dist/code.js —— 装插件的人只有这份产物，摸不到消费方项目的源码，
// 所以这份映射表得跟着插件一起发，不能指望大家去消费方仓库里找 .figma.ts 文件
// 消费方的 figma-mapping-table.json 由 scripts/copy-mapping-table.mjs 在 build 前复制到这里
// （gitignore 掉，不进 git diff）——这份代码本身不该硬编码"数据就在我自己仓库里"这个假设。
import mappingTable from './mapping-table.generated.json';
async function mainRefOf(node) {
    const main = await node.getMainComponentAsync();
    if (!main)
        return null;
    const owner = definitionOwner(main);
    return { id: owner.id, key: owner.key, name: owner.name };
}
/** 把整棵实例子树的主组件身份预解析好，让 render() 能保持同步。并发，别串行 */
async function buildMainMap(root) {
    const nodes = [root];
    for (const n of root.findAllWithCriteria({ types: ['INSTANCE'] }))
        nodes.push(n);
    const refs = await Promise.all(nodes.map((n) => mainRefOf(n)));
    const map = new Map();
    nodes.forEach((n, i) => {
        const ref = refs[i];
        if (ref)
            map.set(n.id, ref);
    });
    return map;
}
async function analyze(node) {
    const main = await node.getMainComponentAsync();
    if (!main)
        return { ok: false, reason: '读不到主组件（可能是缺失的远端组件）' };
    const schema = withCurrentLabels(await extractSchema(main), node);
    const template = lookup(schema.componentKey, schema.componentName);
    if (!template) {
        return {
            ok: false,
            schema,
            reason: `还没有 "${schema.componentName}" 的映射。在这个项目的 figma-mappings/ 下新建一个 .figma.ts，` +
                `match.componentName 填 "${schema.componentName}"，然后重新跑一遍插件构建（会自动重新扫描收录）。`,
        };
    }
    const mainByNode = await buildMainMap(node);
    const calls = [];
    let sections;
    let imports;
    try {
        const result = template.render(new InstanceHandle(node, { mainByNode, calls, depth: 0 }));
        sections = result.example;
        imports = result.imports ?? [];
    }
    catch (err) {
        return { ok: false, schema, reason: `模板执行抛错：${String(err)}` };
    }
    // 第二遍：探测模式，只为算「模板最多会碰到哪些属性」，避免条件分支被误报未映射
    const probeCalls = [];
    try {
        template.render(new InstanceHandle(node, { mainByNode, calls: probeCalls, depth: 0, probe: true }));
    }
    catch {
        // 探测失败不影响主流程
    }
    const findings = validate(schema, calls, probeCalls);
    for (const m of collectErrors(sections))
        findings.push({ level: 'error', text: m });
    return {
        ok: true,
        schema,
        template: { id: template.id, meta: template.meta },
        sections,
        snippet: renderToString(sections),
        imports,
        findings,
        calls,
    };
}
/** 嵌套在别的实例里的实例（比如 Button 内部的图标）交给那个父实例的模板自己处理，不算独立候选 */
function isNestedInAnotherInstance(node, root) {
    let p = node.parent;
    while (p && p !== root) {
        if (p.type === 'INSTANCE')
            return true;
        p = p.parent;
    }
    return false;
}
async function isMapped(node) {
    const ref = await mainRefOf(node);
    return ref !== null && lookup(ref.key, ref.name) !== null;
}
/** figma.fileKey 只对私有插件开放（manifest 需 enablePrivatePluginApi），拿不到就老实置 null */
function figmaUrlFor(componentId) {
    const fileKey = figma.fileKey;
    return fileKey ? `https://www.figma.com/design/${fileKey}/?node-id=${componentId.replace(':', '-')}` : null;
}
async function asInstance(node) {
    if (!node)
        return { error: '在画布上选中一个组件实例' };
    if (node.type === 'INSTANCE')
        return node;
    if ('findAllWithCriteria' in node) {
        const all = node.findAllWithCriteria({ types: ['INSTANCE'] });
        const mappedFlags = await Promise.all(all.map((n) => isMapped(n)));
        // 嵌套实例已映射的话，父模板自己 getInstanceSwap 就能渲染出来，不用再单独列一遍；
        // 没映射的嵌套实例（比如还没接的图标）没有别的地方能发现它，照样单独列出来，
        // 不然永远不知道要先去映射它，父模板那个插槽也会一直是空的
        const instances = all
            .map((n, i) => ({ node: n, mapped: mappedFlags[i] }))
            .filter(({ node: n, mapped }) => !(mapped && isNestedInAnotherInstance(n, node)));
        if (instances.length === 1)
            return instances[0].node;
        if (instances.length > 1) {
            return { candidates: instances.map(({ node: n, mapped }) => ({ id: n.id, name: n.name, mapped })) };
        }
    }
    return { error: `选中的是 ${node.type}，里面没有组件实例（INSTANCE）` };
}
// ───────────────────────── 形态一：Dev Mode Code 区 ─────────────────────────
if (figma.mode === 'codegen') {
    figma.codegen.on('generate', async ({ node }) => {
        const picked = await asInstance(node);
        if ('error' in picked) {
            return [{ title: 'Mini Code Connect', code: `// ${picked.error}`, language: 'PLAINTEXT' }];
        }
        if ('candidates' in picked) {
            return [
                {
                    title: 'Mini Code Connect',
                    code: `// 里面有 ${picked.candidates.length} 个组件实例，请单选其中一个：\n${picked.candidates
                        .map((c) => `//  - ${c.name}`)
                        .join('\n')}`,
                    language: 'PLAINTEXT',
                },
            ];
        }
        const a = await analyze(picked);
        if (!a.ok) {
            return [{ title: 'Mini Code Connect', code: `// ${a.reason}`, language: 'PLAINTEXT' }];
        }
        const results = [
            {
                title: `React · ${a.template.meta.component}`,
                code: (a.imports.length ? a.imports.join('\n') + '\n\n' : '') + a.snippet,
                language: 'TYPESCRIPT',
            },
        ];
        if (a.findings.length > 0) {
            results.push({
                title: 'Code Connect 自检',
                code: a.findings.map((f) => `[${f.level}] ${f.text}`).join('\n'),
                language: 'PLAINTEXT',
            });
        }
        results.push({
            title: '绑定',
            code: [
                `component:  ${a.template.meta.component}`,
                `source:     ${a.template.meta.source}`,
                `templateId: ${a.template.id}`,
                `figma:      ${a.schema.componentName}`,
            ].join('\n'),
            language: 'PLAINTEXT',
        });
        return results;
    });
}
else {
    // ───────────────────── 形态二/三：面板（Inspect 或 Design 浮层）─────────────────────
    figma.showUI(__html__, { width: 480, height: 660, themeColors: true });
    function post(msg) {
        figma.ui.postMessage(msg);
    }
    /**
     * 选区变化会连续触发 run()，而 run() 中间有多个 await。
     * 没有代际校验的话，旧的那次可能在新的之后 post，面板显示上一个实例的结果。
     */
    let generation = 0;
    /** 上一次「容器里多个实例」的候选名单，选完一个之后还留着，供面板画「返回列表」 */
    let lastCandidates = null;
    /** 扫一遍当前页所有实例，按主组件去重，列出全部并标已映射/未映射——对应真实 CC 的 get_code_connect_suggestions */
    async function scanPage() {
        const instances = figma.currentPage.findAllWithCriteria({ types: ['INSTANCE'] });
        const groups = new Map();
        for (const inst of instances) {
            const main = await inst.getMainComponentAsync();
            if (!main)
                continue;
            const owner = definitionOwner(main);
            const template = lookup(owner.key, owner.name);
            const groupKey = owner.key || owner.id;
            const g = groups.get(groupKey);
            if (g) {
                g.count++;
            }
            else {
                groups.set(groupKey, {
                    componentName: owner.name,
                    count: 1,
                    sampleNodeId: inst.id,
                    mapped: template !== null,
                    codeComponent: template ? template.meta.component : null,
                });
            }
        }
        const list = [...groups.entries()].map(([componentKey, g]) => ({ componentKey, ...g }));
        list.sort((a, b) => Number(a.mapped) - Number(b.mapped) || b.count - a.count);
        const unmappedCount = list.filter((g) => !g.mapped).length;
        post({
            type: 'state',
            state: 'scan',
            message: list.length === 0
                ? '当前页面没有任何组件实例'
                : `共 ${list.length} 个组件，${unmappedCount} 个还没映射`,
            groups: list,
        });
    }
    async function run() {
        const my = ++generation;
        const stale = () => my !== generation;
        const sel = figma.currentPage.selection;
        if (sel.length > 1) {
            post({ type: 'state', state: 'empty', message: `选中了 ${sel.length} 个节点，请单选一个组件实例` });
            return;
        }
        const picked = await asInstance(sel[0] ?? null);
        if ('error' in picked) {
            post({ type: 'state', state: 'empty', message: picked.error, candidates: lastCandidates ?? undefined });
            return;
        }
        if ('candidates' in picked) {
            lastCandidates = picked.candidates;
            post({
                type: 'state',
                state: 'candidates',
                message: `里面有 ${picked.candidates.length} 个组件实例，请单选其中一个`,
                candidates: picked.candidates,
            });
            return;
        }
        const a = await analyze(picked);
        if (stale())
            return;
        if (!a.ok) {
            post({
                type: 'state',
                state: a.schema ? 'unmapped' : 'error',
                message: a.reason,
                schema: a.schema,
                figmaUrl: a.schema ? figmaUrlFor(a.schema.componentId) : undefined,
                candidates: lastCandidates ?? undefined,
            });
            return;
        }
        post({
            type: 'state',
            state: 'ok',
            message: '',
            schema: a.schema,
            template: a.template,
            snippet: a.snippet,
            imports: a.imports,
            sections: a.sections,
            findings: a.findings,
            calls: a.calls,
            candidates: lastCandidates ?? undefined,
        });
    }
    /**
     * Figma 不会 await 这些 handler，也不会处理它们的 rejection。
     * 任何漏出来的 throw 都等于「面板永久停在上一帧」，所以每个入口都得自己兜住。
     */
    async function guard(fn) {
        try {
            await fn();
        }
        catch (err) {
            post({ type: 'state', state: 'error', message: `插件内部错误：${String(err)}` });
            console.error(err);
        }
    }
    figma.ui.onmessage = (msg) => {
        if (msg.type === 'refresh')
            void guard(run);
        else if (msg.type === 'pick') {
            void guard(async () => {
                const node = await figma.getNodeByIdAsync(msg.id);
                if (!node || node.type !== 'INSTANCE') {
                    figma.notify('这个实例已经不在画布上了，重新读取一下');
                    return;
                }
                figma.currentPage.selection = [node];
                figma.viewport.scrollAndZoomIntoView([node]);
                await run();
            });
        }
        else if (msg.type === 'scan') {
            void guard(scanPage);
        }
        else if (msg.type === 'exportMappingTable') {
            void guard(async () => {
                post({ type: 'download', filename: 'mapping-table.json', json: JSON.stringify(mappingTable, null, 2) });
            });
        }
        else if (msg.type === 'exportAllSchemas') {
            void guard(async () => {
                if (!lastCandidates || lastCandidates.length === 0) {
                    figma.notify('没有候选实例可导出，先框选一个里面有多个实例的容器');
                    return;
                }
                const schemas = [];
                const seenKeys = new Set();
                for (const c of lastCandidates) {
                    const node = await figma.getNodeByIdAsync(c.id);
                    if (!node || node.type !== 'INSTANCE')
                        continue;
                    const main = await node.getMainComponentAsync();
                    if (!main)
                        continue;
                    const schema = await extractSchema(main);
                    const dedupeKey = schema.componentKey || schema.componentId;
                    if (seenKeys.has(dedupeKey))
                        continue;
                    seenKeys.add(dedupeKey);
                    schemas.push(schema);
                }
                if (schemas.length === 0) {
                    figma.notify('没读到任何组件 schema');
                    return;
                }
                post({ type: 'download', filename: 'schemas.json', json: JSON.stringify(schemas, null, 2) });
            });
        }
        else if (msg.type === 'backToList') {
            if (lastCandidates) {
                post({
                    type: 'state',
                    state: 'candidates',
                    message: `里面有 ${lastCandidates.length} 个组件实例，请单选其中一个`,
                    candidates: lastCandidates,
                });
            }
        }
        else if (msg.type === 'exportSchema') {
            void guard(async () => {
                const picked = await asInstance(figma.currentPage.selection[0] ?? null);
                if ('error' in picked) {
                    figma.notify(picked.error);
                    return;
                }
                if ('candidates' in picked) {
                    figma.notify(`里面有 ${picked.candidates.length} 个组件实例，请先单选其中一个`);
                    return;
                }
                const main = await picked.getMainComponentAsync();
                if (!main) {
                    figma.notify('读不到主组件');
                    return;
                }
                const schema = await extractSchema(main);
                const safeName = schema.componentName.replace(/[^a-zA-Z0-9]+/g, '') || 'Component';
                post({ type: 'download', filename: `${safeName}.schema.json`, json: JSON.stringify(schema, null, 2) });
            });
        }
    };
    figma.on('selectionchange', () => {
        void guard(run);
    });
    // 首次读取由 UI 就绪后主动 send('refresh') 触发 —— 否则这里的 post 可能早于
    // iframe 挂上 onmessage，首帧直接丢掉。
}
