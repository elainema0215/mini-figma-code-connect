/** 去掉模板字面量带来的公共缩进 */
export function dedent(text) {
    const lines = text.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
    const indents = lines.filter((l) => l.trim() !== '').map((l) => /^[ \t]*/.exec(l)[0].length);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(min)).join('\n');
}
/** ResultSection[] → 给人看的字符串。真正的消费端（Dev Mode / MCP）拿的是数组本身 */
export function renderToString(sections) {
    let out = '';
    for (const s of sections) {
        if (s.type === 'CODE')
            out += s.code;
        else if (s.type === 'INSTANCE')
            out += `{/* <${s.name}> 未连接 Code Connect */}`;
        else
            out += `/* ⚠ ${s.message} */`;
    }
    return dedent(out);
}
export function collectErrors(sections) {
    const out = [];
    for (const s of sections)
        if (s.type === 'ERROR')
            out.push(s.message);
    return out;
}
