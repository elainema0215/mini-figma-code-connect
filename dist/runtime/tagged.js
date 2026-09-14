/**
 * figma.code`...` 的简版。
 *
 * 职责只有两件：把插值切成 ResultSection[]，把嵌套的 section 数组摊平。
 * 它 **不解析代码语义** —— 这正是真实 Code Connect 的实现边界，
 * 也是为什么用 `+` 或 `.join()` 拼 section 会得到 [object Object]。
 */
function tag(strings, values) {
    const out = [];
    const pushCode = (s) => {
        if (s === '')
            return;
        const last = out[out.length - 1];
        if (last && last.type === 'CODE')
            last.code += s;
        else
            out.push({ type: 'CODE', code: s });
    };
    strings.forEach((chunk, i) => {
        pushCode(chunk);
        if (i >= values.length)
            return;
        const v = values[i];
        // null / undefined / false 一律不输出，方便写条件插值
        if (v === null || v === undefined || v === false)
            return;
        if (Array.isArray(v)) {
            for (const sec of v) {
                if (sec.type === 'CODE')
                    pushCode(sec.code);
                else
                    out.push(sec);
            }
            return;
        }
        pushCode(String(v));
    });
    return out;
}
export function code(strings, ...values) {
    return tag(strings, values);
}
/** 真实 CC 里这些只影响语法高亮，运行时行为完全一致 */
export const tsx = code;
export const html = code;
