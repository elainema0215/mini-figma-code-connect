/**
 * Step 6 的自动化版本。
 *
 * 思路：不让模板重复声明它消费了什么，而是在 render 期间记录每一次 accessor 调用，
 * 事后拿这份调用记录和 schema 对账。「穷举缺失」和「属性未映射」就都能被机器发现。
 *
 * @param calls    真实一遍 render 的调用记录 —— 用来报错
 * @param coverage 探测一遍（所有 boolean 视为 true）的调用记录 —— 用来算覆盖率，
 *                 避免条件分支里的属性被误报成未映射
 */
export function validate(schema, calls, coverage = calls) {
    const real = calls.filter((c) => c.depth === 0);
    const touched = new Set(coverage.filter((c) => c.depth === 0).map((c) => c.prop));
    const findings = [];
    for (const p of schema.properties) {
        if (!touched.has(p.name)) {
            findings.push({ level: 'warn', text: `属性 "${p.name}" (${p.type}) 未被模板消费` });
            continue;
        }
        if (p.type === 'VARIANT' && p.variantOptions) {
            for (const c of real) {
                if (c.prop !== p.name || c.method !== 'getEnum' || !c.mappingKeys)
                    continue;
                const keys = c.mappingKeys;
                const missing = p.variantOptions.filter((v) => keys.indexOf(v) === -1);
                if (missing.length > 0) {
                    findings.push({
                        level: 'error',
                        text: `"${p.name}" 的 getEnum 字典漏了 ${missing.join('、')} —— 选到这些值时会静默产出 undefined`,
                    });
                }
            }
        }
    }
    for (const c of real) {
        if (!c.ok)
            findings.push({ level: 'error', text: `${c.method}("${c.prop}")：${c.note ?? '失败'}` });
    }
    return findings;
}
