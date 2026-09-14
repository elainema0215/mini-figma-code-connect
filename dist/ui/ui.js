"use strict";
const body = document.getElementById('body');
const send = (type, extra) => parent.postMessage({ pluginMessage: { type, ...extra } }, '*');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function schemaTable(schema, calls) {
    const consumed = new Set(calls.filter((c) => c.depth === 0).map((c) => c.prop));
    const rows = schema.properties
        .map((p) => {
        const tag = consumed.has(p.name)
            ? '<span class="tag ok">已映射</span>'
            : '<span class="tag miss">未映射</span>';
        const opts = p.variantOptions ? esc(p.variantOptions.join(' / ')) : '—';
        return `<tr><td>${esc(p.name)}</td><td><code>${p.type}</code></td><td>${opts}</td><td>${tag}</td></tr>`;
    })
        .join('');
    return `<table><thead><tr><th>属性</th><th>类型</th><th>可选值</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function backBar(candidates) {
    if (!candidates || candidates.length === 0)
        return '';
    return `<div class="row"><button class="ghost back" type="button">← 返回列表（${candidates.length} 个实例）</button></div>`;
}
function wireBack() {
    const btn = document.querySelector('.back');
    if (btn)
        btn.addEventListener('click', () => send('backToList'));
}
// 一个按钮身兼两职：候选列表状态（选中的是容器，没有单个实例）导出全部；其它状态导出当前选中的单个实例
const exportSchemaBtn = document.getElementById('export-schema');
let inCandidatesMode = false;
function syncExportButton(state, count) {
    inCandidatesMode = state === 'candidates';
    if (state === 'candidates') {
        exportSchemaBtn.disabled = count === 0;
        exportSchemaBtn.textContent = count > 0 ? `导出全部 schema.json（${count} 个）` : '导出全部 schema.json';
    }
    else {
        exportSchemaBtn.disabled = false;
        exportSchemaBtn.textContent = '导出 schema.json';
    }
}
function render(msg) {
    if (msg.type !== 'download') {
        syncExportButton(msg.state, msg.state === 'candidates' ? msg.candidates.length : 0);
    }
    if (msg.type === 'download') {
        const url = URL.createObjectURL(new Blob([msg.json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = msg.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // 兜底：iframe 的 sandbox 若拦掉下载，至少把内容留在剪贴板里
        void navigator.clipboard.writeText(msg.json).catch(() => undefined);
        return;
    }
    if (msg.state === 'scan') {
        // 未映射排前面（跟 scanPage 排序一致），仿 Figma 官方 Code Connect UI 那张组件目录列表的样式：
        // 一行一个组件，左边 Figma 组件名，右边状态 + 代码组件名，顶部一个搜索框过滤
        const rows = msg.groups
            .map((g) => `
          <li class="component-row" data-search="${esc(g.componentName.toLowerCase())}">
            <button class="row-name" type="button" data-id="${esc(g.sampleNodeId)}">
              <span class="diamond">◆</span>
              <span>${esc(g.componentName)}</span>
              <span class="dim">${g.count} 处</span>
            </button>
            <span class="row-code">
              ${g.mapped
            ? `<span class="status-dot ok">✓</span><code>&lt;${esc(g.codeComponent ?? '?')}&gt;</code>`
            : `<span class="status-dot miss">×</span><span class="dim">未映射</span>`}
            </span>
          </li>`)
            .join('');
        body.innerHTML = `
      <section>
        <p class="hint">${esc(msg.message)}</p>
        <input class="scan-search" type="text" placeholder="搜索组件…" />
        <div class="component-list">
          <div class="list-header"><span>Figma 组件</span><span>代码组件</span></div>
          <ul class="component-rows">${rows}</ul>
        </div>
      </section>
    `;
        body.querySelectorAll('.row-name').forEach((el) => {
            el.addEventListener('click', () => send('pick', { id: el.dataset.id }));
        });
        const search = document.querySelector('.scan-search');
        if (search) {
            search.addEventListener('input', () => {
                const q = search.value.trim().toLowerCase();
                body.querySelectorAll('.component-row').forEach((row) => {
                    row.style.display = !q || (row.dataset.search ?? '').includes(q) ? '' : 'none';
                });
            });
        }
        return;
    }
    if (msg.state === 'candidates') {
        const items = msg.candidates
            .map((c, i) => `<li><button class="ghost pick" type="button" data-id="${esc(c.id)}"><span>${i + 1}. ${esc(c.name)}</span><span class="tag ${c.mapped ? 'ok' : 'miss'}">${c.mapped ? '已映射' : '未映射'}</span></button></li>`)
            .join('');
        body.innerHTML = `<section><p class="hint">${esc(msg.message)}</p><ul class="candidates">${items}</ul></section>`;
        body.querySelectorAll('.pick').forEach((btn) => {
            btn.addEventListener('click', () => send('pick', { id: btn.dataset.id }));
        });
        return;
    }
    if (msg.state !== 'ok') {
        const extra = msg.schema && msg.schema.properties.length > 0
            ? `<section><h2>读到的属性 schema</h2>${schemaTable(msg.schema, [])}</section>`
            : '';
        // 未映射可能是因为压根没有对应的代码组件——给一条能直接丢进 AI 工具的提示词，
        // 先把组件生成出来（组件名跟 Figma 实例名保持一致，方便后面接 mini-code-connect 映射）
        const genPrompt = msg.state === 'unmapped' && msg.schema && msg.figmaUrl
            ? `<section>
            <div class="row"><h2>生成通用组件</h2><button class="ghost copy" id="copy-prompt" type="button">复制</button></div>
            <pre id="gen-prompt">/figma-design-to-code ${esc(msg.figmaUrl)}，生成通用组件"${esc(msg.schema.componentName)}"，组件名和实例名保持一致</pre>
          </section>`
            : '';
        body.innerHTML = `${backBar(msg.candidates)}<section><p class="hint">${esc(msg.message)}</p></section>${genPrompt}${extra}`;
        wireBack();
        const copyPrompt = document.getElementById('copy-prompt');
        if (copyPrompt) {
            copyPrompt.addEventListener('click', () => {
                const pre = document.getElementById('gen-prompt');
                if (!pre || !pre.textContent)
                    return;
                void navigator.clipboard.writeText(pre.textContent).then(() => {
                    copyPrompt.textContent = '已复制';
                    setTimeout(() => (copyPrompt.textContent = '复制'), 1200);
                });
            });
        }
        return;
    }
    const { schema, template, snippet, imports, findings, calls } = msg;
    const bindingCard = `
    <div class="card">
      <div class="kv"><span>Figma 组件</span><span>${esc(schema.componentName)}</span></div>
      <div class="kv"><span>source</span><span><code>${esc(template.meta.source)}</code></span></div>
      <div class="kv"><span>component</span><span><code>${esc(template.meta.component)}</code></span></div>
      <div class="kv"><span>template id</span><span><code>${esc(template.id)}</code></span></div>
    </div>`;
    const findingList = findings.length === 0
        ? '<p class="hint">没有发现问题。</p>'
        : `<ul class="findings">${findings
            .map((f) => `<li class="${f.level}">${esc(f.text)}</li>`)
            .join('')}</ul>`;
    const importLines = imports.length ? esc(imports.join('\n')) + '\n\n' : '';
    body.innerHTML = `
    ${backBar(msg.candidates)}
    <section><h2>绑定</h2>${bindingCard}</section>
    <section>
      <div class="row"><h2>生成的代码片段</h2><button class="ghost copy" id="copy" type="button">复制</button></div>
      <pre id="snippet">${importLines}${esc(snippet)}</pre>
    </section>
    <section><h2>属性 schema 与覆盖率</h2>${schemaTable(schema, calls)}</section>
    <section><h2>自检（Step 6）</h2>${findingList}</section>
    <section><h2>本次 accessor 调用</h2><pre>${esc(calls
        .map((c) => `${'  '.repeat(c.depth)}${c.method}("${c.prop}")${c.ok ? '' : `  ⚠ ${c.note ?? ''}`}`)
        .join('\n') || '（无）')}</pre></section>`;
    const copy = document.getElementById('copy');
    if (copy) {
        copy.addEventListener('click', () => {
            const pre = document.getElementById('snippet');
            if (!pre || !pre.textContent)
                return;
            void navigator.clipboard.writeText(pre.textContent).then(() => {
                copy.textContent = '已复制';
                setTimeout(() => (copy.textContent = '复制'), 1200);
            });
        });
    }
    wireBack();
}
;
document.getElementById('refresh').addEventListener('click', () => send('refresh'));
document.getElementById('scan').addEventListener('click', () => send('scan'));
exportSchemaBtn.addEventListener('click', () => send(inCandidatesMode ? 'exportAllSchemas' : 'exportSchema'));
document.getElementById('export-mapping-table').addEventListener('click', () => send('exportMappingTable'));
onmessage = (e) => {
    const msg = e.data && e.data.pluginMessage;
    if (msg)
        render(msg);
};
// UI 就绪后主动拉一次。主线程不做首次 post —— 那会早于这行代码执行，首帧会丢
send('refresh');
