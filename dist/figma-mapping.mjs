#!/usr/bin/env node

// scripts/figma-mapping/index.mjs
import fs4 from "node:fs";
import path5 from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// scripts/figma-mapping/lib.mjs
import fs from "node:fs";
import path from "node:path";
var ROOT = process.cwd();
var CONFIG_PATH = path.join(ROOT, "figma-mapping.config.json");
var MAPPINGS_DIR = path.join(ROOT, "figma-mappings");
function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(
      `[figma-mapping] \u5F53\u524D\u76EE\u5F55\uFF08${ROOT}\uFF09\u6CA1\u6709 figma-mapping.config.json \u2014\u2014 \u626B\u4E0D\u5230\u4EFB\u4F55\u5019\u9009\u7EC4\u4EF6\u76EE\u5F55\u3002
\u6284\u5F15\u64CE\u5305\u91CC\u7684 figma-mapping.config.example.json\uFF0C\u5728\u8FD9\u4E2A\u9879\u76EE\u6839\u76EE\u5F55\u5EFA\u4E00\u4EFD\uFF0C\u6539\u6210\u81EA\u5DF1\u7684\u7EC4\u4EF6\u76EE\u5F55\u3002`
    );
    return { paths: {}, importPaths: {} };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")).codeConnect;
}
function listCandidateFiles() {
  const { paths } = readConfig();
  const dirs = Object.values(paths ?? {});
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.figma\.tsx?$/.test(entry.name)) {
        results.push(path.relative(ROOT, full));
      }
    }
  }
  for (const d of dirs) walk(path.resolve(ROOT, d));
  return results;
}
function extractComponentInfo(relPath) {
  const source = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const nameMatches = [
    ...source.matchAll(/export\s+(?:declare\s+)?(?:const|function|class)\s+([A-Z][A-Za-z0-9]*)/g)
  ].map((m) => m[1]);
  const propsBlocks = [
    ...source.matchAll(/(?:interface|type)\s+([A-Za-z0-9]*Props)\b[^{]*\{([\s\S]*?)\n\}/g)
  ].map((m) => ({ typeName: m[1], body: m[2] }));
  const propNames = /* @__PURE__ */ new Set();
  for (const block of propsBlocks) {
    for (const m of block.body.matchAll(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\??:/gm)) {
      propNames.add(m[1]);
    }
  }
  return { relPath, names: nameMatches, propsBlocks, propNames: [...propNames], source };
}
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function tokenOverlap(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  return 0;
}
function scoreCandidate(schema, info) {
  const fileBase = path.basename(info.relPath).replace(/\.tsx?$/, "");
  const nameCandidates = [...info.names, fileBase];
  const nameScore = Math.max(0, ...nameCandidates.map((n) => tokenOverlap(schema.componentName, n)));
  const schemaProps = schema.properties.map((p) => normalize(p.name)).filter(Boolean);
  const codeProps = info.propNames.map(normalize);
  const overlapCount = schemaProps.filter((p) => codeProps.some((c) => c === p || c.includes(p) || p.includes(c))).length;
  const propScore = schemaProps.length ? overlapCount / schemaProps.length : 0;
  const score = nameScore * 0.6 + propScore * 0.4;
  return { score, nameScore, propScore, overlapCount, fileBase };
}

// scripts/figma-mapping/scaffold.mjs
function normalize2(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findUnionLiterals(propsBody, propName) {
  const line = propsBody.split("\n").find((l) => new RegExp(`^\\s*${propName}\\??:`).test(l));
  if (!line) return null;
  const literals = [...line.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
  return literals.length ? literals : null;
}
function bestPropMatch(schemaPropName, codePropNames) {
  const target = normalize2(schemaPropName);
  if (!target) return null;
  let best = null;
  for (const name of codePropNames) {
    const n = normalize2(name);
    if (n === target || n.includes(target) || target.includes(n)) {
      if (!best || n.length < normalize2(best).length) best = name;
    }
  }
  return best;
}
function varName(p, i, seen) {
  const cleaned = p.name.replace(/[^a-zA-Z0-9]/g, "");
  const base = cleaned || `prop${i + 1}`;
  const camel = base[0].toLowerCase() + base.slice(1);
  let name = /^[0-9]/.test(camel) ? `_${camel}` : camel;
  if (seen.has(name)) {
    let n = 2;
    while (seen.has(`${name}${n}`)) n++;
    name = `${name}${n}`;
  }
  seen.add(name);
  return name;
}
function idFrom(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "template";
}
function propLine(p, i, codePropNames, propsBody, seen, claimedCodeProps) {
  const v = varName(p, i, seen);
  const guess = bestPropMatch(p.name, codePropNames);
  const matched = guess && !claimedCodeProps.has(guess) ? guess : null;
  if (matched) claimedCodeProps.add(matched);
  switch (p.type) {
    case "TEXT":
      return { line: `const ${v} = instance.getString('${p.name}')`, jsxAttr: matched ? `${matched}={${v}}` : null };
    case "BOOLEAN":
      return { line: `const ${v} = instance.getBoolean('${p.name}')`, jsxAttr: matched ? `${matched}={${v}}` : null };
    case "VARIANT": {
      const literals = matched && propsBody ? findUnionLiterals(propsBody, matched) : null;
      const opts = p.variantOptions ?? [];
      const mapping = opts.map((o) => {
        const guess2 = literals?.find((l) => normalize2(l) === normalize2(o)) ?? literals?.[0];
        const value = guess2 ? JSON.stringify(guess2) : `'TODO'`;
        return `      ${JSON.stringify(o)}: ${value},`;
      }).join("\n");
      return {
        line: `const ${v} = instance.getEnum('${p.name}', {
${mapping}
    })`,
        jsxAttr: matched ? `${matched}="\${${v}}"` : null
      };
    }
    case "INSTANCE_SWAP":
      return {
        line: `const ${v} = instance.getInstanceSwap('${p.name}')
    let ${v}Code
    if (${v} && ${v}.type === 'INSTANCE') {
      ${v}Code = ${v}.executeTemplate()?.example
    }`,
        jsxAttr: matched ? `${matched}={\${${v}Code}}` : null
      };
    default:
      return { line: `// TODO: \u672A\u77E5\u5C5E\u6027\u7C7B\u578B ${p.type} \u2014 ${p.name}`, jsxAttr: null };
  }
}
function buildMatchedScaffold({ schema, componentFile, componentName, importSpecifier, propsBlock }) {
  const propsBody = propsBlock?.body ?? "";
  const codePropNames = propsBlock ? [...propsBody.matchAll(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\??:/gm)].map((m) => m[1]) : [];
  const seen = /* @__PURE__ */ new Set();
  const claimedCodeProps = /* @__PURE__ */ new Set();
  const parts = schema.properties.map((p, i) => propLine(p, i, codePropNames, propsBody, seen, claimedCodeProps));
  const lines = parts.map((p) => `    ${p.line}`).join("\n\n");
  const jsxAttrs = parts.map((p) => p.jsxAttr).filter(Boolean).map((a) => `
          ${a}`).join("");
  const unmatchedCount = schema.properties.length - parts.filter((p) => p.jsxAttr).length;
  const id = idFrom(schema.componentName);
  return `// url=https://www.figma.com/design/REPLACE_FILE_KEY/Design-System?node-id=REPLACE
// source=${componentFile}
// component=${componentName}
import { defineTemplate } from '../runtime/define'
import { code } from '../runtime/tagged'

/**
 * \u7531 figma-mapping CLI \u751F\u6210\uFF1AFigma "${schema.componentName}" \u2194 \u4EE3\u7801 ${componentName}\uFF08${componentFile}\uFF09
 * ${unmatchedCount > 0 ? `${unmatchedCount} \u4E2A\u5C5E\u6027\u6CA1\u81EA\u52A8\u914D\u4E0A\u5BF9\u5E94\u7684\u4EE3\u7801 prop\uFF0C\u4EBA\u5DE5\u786E\u8BA4` : "\u6BCF\u4E2A\u5C5E\u6027\u90FD\u81EA\u52A8\u914D\u4E0A\u4E86\u5BF9\u5E94\u7684\u4EE3\u7801 prop\uFF0C\u4ECD\u5EFA\u8BAE\u4EBA\u5DE5\u786E\u8BA4\u4E00\u904D"}
 */
export default defineTemplate({
  meta: {
    url: 'https://www.figma.com/design/REPLACE_FILE_KEY/Design-System?node-id=REPLACE',
    source: '${componentFile}',
    component: '${componentName}',
  },
  id: '${id}',
  match: { componentName: '${schema.componentName}' },

  render(instance) {
${lines || "    // \u8FD9\u4E2A\u7EC4\u4EF6\u6CA1\u6709\u53EF\u8BFB\u7684\u5C5E\u6027"}

    return {
      example: code\`
        <${componentName}${jsxAttrs}
        />
      \`,
      imports: ['import { ${componentName} } from "${importSpecifier}"'],
      id: '${id}',
      metadata: { nestable: true },
    }
  },
})
`;
}
function toImportSpecifier(relPath, importPaths) {
  for (const [glob, spec] of Object.entries(importPaths ?? {})) {
    const prefix = glob.replace(/\*$/, "");
    if (relPath.startsWith(prefix)) {
      const rest = relPath.slice(prefix.length).replace(/\.tsx?$/, "");
      return spec.endsWith("*") ? spec.replace(/\*$/, rest) : spec;
    }
  }
  return "./" + relPath.replace(/\.tsx?$/, "");
}

// scripts/figma-mapping/registry.mjs
import fs3 from "node:fs";
import path4 from "node:path";

// scripts/generate-registry.mjs
import fs2 from "node:fs";
import path3 from "node:path";

// scripts/is-cli-entrypoint.mjs
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
function isCliEntrypoint(importMetaUrl, entryName) {
  if (!process.argv[1]) return false;
  try {
    const argvPath = realpathSync(process.argv[1]);
    const metaPath = realpathSync(fileURLToPath(importMetaUrl));
    if (argvPath !== metaPath) return false;
    if (entryName) {
      return path2.basename(argvPath).includes(entryName);
    }
    return true;
  } catch {
    return false;
  }
}

// scripts/generate-registry.mjs
function parseGlob(glob) {
  const starIdx = glob.indexOf("*");
  if (starIdx === -1) throw new Error(`generate-registry: glob \u91CC\u6CA1\u6709 *\uFF1A"${glob}"`);
  const dir = glob.slice(0, starIdx).replace(/\/$/, "");
  const recursive = glob.includes("**");
  return { dir, recursive };
}
function findFigmaFiles(dir, recursive) {
  const results = [];
  function walk(d) {
    if (!fs2.existsSync(d)) return;
    for (const entry of fs2.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path3.join(d, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(full);
      } else if (entry.name.endsWith(".figma.ts")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results.sort();
}
function identifierFor(filePath, index) {
  const base = path3.basename(filePath).replace(/\.figma\.ts$/, "").replace(/[^a-zA-Z0-9]/g, "");
  const safe = base && /^[a-zA-Z_]/.test(base) ? base : `M${base}`;
  return `${safe || "Mapping"}_${index}`;
}
function generateRegistry({ cwd, mappingsGlob, outFile, typesImport = "./types" }) {
  const { dir, recursive } = parseGlob(mappingsGlob);
  const files = findFigmaFiles(path3.resolve(cwd, dir), recursive);
  const outDir = path3.dirname(outFile);
  const imports = files.map((f, i) => {
    const id = identifierFor(f, i);
    let rel = path3.relative(outDir, f).replace(/\.ts$/, "");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    rel = rel.split(path3.sep).join("/");
    return { id, importPath: rel };
  });
  const typeLine = typesImport == null ? "" : `import type { Template } from '${typesImport}'
`;
  const templatesAnn = typesImport == null ? "" : ": Template[]";
  const body = `// \u81EA\u52A8\u751F\u6210\uFF0C\u4E0D\u8981\u624B\u6539 \u2014\u2014 \u7531 scripts/generate-registry.mjs \u626B .figma.ts \u751F\u6210\uFF0C\u6BCF\u6B21 build \u524D\u91CD\u8DD1
` + typeLine + imports.map((i) => `import ${i.id} from '${i.importPath}'`).join("\n") + (imports.length ? "\n\n" : "\n") + `export const templates${templatesAnn} = [${imports.map((i) => i.id).join(", ")}]
`;
  fs2.mkdirSync(outDir, { recursive: true });
  fs2.writeFileSync(outFile, body);
  return { count: files.length, files };
}
if (isCliEntrypoint(import.meta.url, "generate-registry")) {
  const [, , mappingsGlob, outFile] = process.argv;
  if (!mappingsGlob || !outFile) {
    console.error("\u7528\u6CD5: node scripts/generate-registry.mjs <mappingsGlob> <outFile>");
    process.exit(1);
  }
  const result = generateRegistry({ cwd: process.cwd(), mappingsGlob, outFile: path3.resolve(outFile) });
  console.log(`[generate-registry] \u5199\u5165 ${result.count} \u6761\u6620\u5C04\u5230 ${outFile}`);
}

// scripts/figma-mapping/registry.mjs
function refreshRegistry({
  cwd,
  mappingsGlob = "figma-mappings/**/*.figma.ts",
  outFile = path4.join(cwd, "figma-plugin-dist/.generated/registry.generated.ts")
}) {
  fs3.mkdirSync(path4.dirname(outFile), { recursive: true });
  const result = generateRegistry({ cwd, mappingsGlob, outFile });
  return { count: result.count };
}

// scripts/figma-mapping/ai-generate.mjs
import { execFileSync } from "node:child_process";
var EXAMPLE_TEMPLATE = `import { defineTemplate, code } from 'mini-figma-code-connect'

export default defineTemplate({
  meta: {
    url: 'https://www.figma.com/design/FILE_KEY/Design-System?node-id=NODE_ID',
    source: '../path/to/components/button.tsx',
    component: 'Button',
  },
  id: 'button',
  match: { componentName: 'Button' },

  render(instance) {
    const label = instance.getString('Label')
    const disabled = instance.getBoolean('Disabled')
    const size = instance.getEnum('Size', { Large: 'large', Medium: 'medium', Small: 'small' })

    return {
      example: code\`<Button size="\${size}"\${disabled ? code\` disabled\` : ''}>\${label}</Button>\`,
      imports: ['import { Button } from "@/components/button"'],
      id: 'button',
    }
  },
})
`;
function buildPrompt({ schema, candidates, importPaths }) {
  const candidateBlocks = candidates.map(
    (c) => `### \u5019\u9009\u6587\u4EF6: ${c.relPath}
\`\`\`
${c.source}
\`\`\`
`
  ).join("\n");
  return `\u4F60\u662F Figma Code Connect \u6620\u5C04\u751F\u6210\u5668\u3002\u4EFB\u52A1\uFF1A\u5224\u65AD\u4E0B\u9762\u8FD9\u4E2A Figma \u7EC4\u4EF6\u8BE5\u63A5\u5230\u54EA\u4E2A\u5019\u9009\u4EE3\u7801\u7EC4\u4EF6\uFF0C\u5982\u679C\u6709\u5408\u9002\u7684\u5C31\u751F\u6210\u6620\u5C04\u6587\u4EF6\u5185\u5BB9\u3002

## Figma \u7EC4\u4EF6 schema
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## \u5019\u9009\u4EE3\u7801\u7EC4\u4EF6\uFF08\u6309\u8DEF\u5F84\u6392\u5217\uFF0C\u53EF\u80FD\u4E00\u4E2A\u90FD\u4E0D\u5408\u9002\uFF09
${candidateBlocks}

## \u76EE\u6807\u6587\u4EF6\u683C\u5F0F\uFF08\u8FD9\u662F\u4E00\u4EFD\u5DF2\u6709\u7684\u793A\u4F8B\uFF0C\u7167\u8FD9\u4E2A\u683C\u5F0F\u548C accessor API \u5199\uFF0C\u4E0D\u8981\u7528\u522B\u7684\u683C\u5F0F\uFF09
\`\`\`ts
${EXAMPLE_TEMPLATE}
\`\`\`

## import \u8DEF\u5F84\u6362\u7B97\u89C4\u5219
\u5019\u9009\u6587\u4EF6\u8DEF\u5F84\u524D\u7F00 \u2192 \u751F\u6210\u6587\u4EF6\u91CC imports \u7528\u7684 specifier\uFF1A
${JSON.stringify(importPaths, null, 2)}

## \u8981\u6C42
1. \u4ECE\u5019\u9009\u6587\u4EF6\u91CC\u9009\u4E00\u4E2A\u6700\u5408\u9002\u7684\uFF08\u7EC4\u4EF6\u540D\u3001Props \u8BED\u4E49\u90FD\u8981\u5BF9\u5F97\u4E0A\uFF0C\u4E0D\u662F\u5B57\u7B26\u4E32\u50CF\u4E0D\u50CF\uFF09\u3002\u4E00\u4E2A\u90FD\u4E0D\u5408\u9002\u5C31\u9009 NONE\u3002
2. Figma \u5C5E\u6027\u540D\u53EF\u80FD\u662F\u4E2D\u6587\u3001\u53EF\u80FD\u8DDF\u4EE3\u7801 prop \u4E0D\u662F\u5B57\u9762\u4E00\u81F4\uFF08\u6BD4\u5982"\u72B6\u6001"\u91CC\u7684 disabled/hover/loading \u9700\u8981\u62C6\u6210 disabled/loading \u4E24\u4E2A prop\uFF0Chover/pressed \u662F CSS \u72B6\u6001\u4E0D\u662F prop\uFF0C\u4E0D\u80FD\u786C\u585E\uFF09\u3002VARIANT \u7684\u5B57\u5178\u8981\u8986\u76D6 schema \u91CC\u7ED9\u7684\u6BCF\u4E00\u4E2A\u9009\u9879\uFF0C\u914D\u4E0D\u4E0A\u771F\u5B9E\u503C\u7684\u5FC5\u987B\u663E\u5F0F\u7559 'TODO' \u4E0D\u8981\u778E\u7F16\u4E00\u4E2A\u80FD\u7F16\u8BD1\u4F46\u8BED\u4E49\u9519\u7684\u503C\u3002
3. \u4E0D\u786E\u5B9A\u7684\u5224\u65AD\uFF08\u6BD4\u5982\u6CA1\u6709\u7CBE\u786E\u5BF9\u5E94\u7684 variant \u503C\u8BE5\u731C\u54EA\u4E2A\uFF09\uFF0C\u7167\u6837\u505A\u51FA\u9009\u62E9\uFF0C\u4F46\u5728\u751F\u6210\u6587\u4EF6\u9876\u90E8\u6CE8\u91CA\u91CC\u660E\u786E\u5199\u51FA"\u8FD9\u662F\u731C\u7684\uFF0C\u9700\u8981\u4EBA\u5DE5\u786E\u8BA4"\uFF0C\u522B\u4E0D\u58F0\u4E0D\u54CD\u3002
4. \u4E25\u7981\u8C03\u7528\u4EFB\u4F55\u5DE5\u5177/\u547D\u4EE4\uFF0C\u4E25\u7981\u8BFB\u5199\u6587\u4EF6\u7CFB\u7EDF \u2014\u2014 \u4F60\u73B0\u5728\u6CA1\u6709\u8FD9\u4E9B\u6743\u9650\uFF0C\u53EA\u9700\u8981\u57FA\u4E8E\u4E0A\u9762\u7ED9\u7684\u4FE1\u606F\u76F4\u63A5\u751F\u6210\u6587\u672C\u3002
5. \u4E25\u7981\u7F16\u9020\u4EE3\u7801\u91CC\u4E0D\u5B58\u5728\u7684 prop \u540D\u3002

## \u8F93\u51FA\u683C\u5F0F\uFF08\u4E25\u683C\u9075\u5B88\uFF0C\u4E0D\u8981\u8F93\u51FA\u5176\u5B83\u4EFB\u4F55\u6587\u5B57\uFF09
\u7B2C\u4E00\u884C\uFF1A\`MATCH: <\u5019\u9009\u6587\u4EF6\u7684 relPath>\` \u6216 \`MATCH: NONE\`
\u5982\u679C MATCH \u4E0D\u662F NONE\uFF0C\u7B2C\u4E8C\u884C\u5F00\u59CB\u662F\u4E00\u6761\u5206\u9694\u7EBF \`---\`\uFF0C\u4E4B\u540E\u662F\u5B8C\u6574\u7684 .figma.ts \u6587\u4EF6\u5185\u5BB9\uFF08\u4E0D\u8981\u7528 markdown \u4EE3\u7801\u5757\u5305\u88F9\uFF0C\u76F4\u63A5\u662F\u53EF\u4EE5\u539F\u6837\u5199\u5165\u6587\u4EF6\u7684 TypeScript \u6E90\u7801\uFF09\u3002
\u5982\u679C MATCH \u662F NONE\uFF0C\u7B2C\u4E8C\u884C\u5F00\u59CB\u7B80\u77ED\u8BF4\u660E\u4E3A\u4EC0\u4E48\u6CA1\u6709\u5408\u9002\u7684\u5019\u9009\uFF08\u4E00\u4E24\u53E5\u8BDD\uFF09\u3002`;
}
function aiGenerateMapping({ schema, candidates, importPaths }) {
  const prompt = buildPrompt({ schema, candidates, importPaths });
  const raw = execFileSync(
    "claude",
    [
      "-p",
      prompt,
      "--output-format",
      "text",
      "--disallowedTools",
      "Read,Write,Edit,Bash,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit"
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  const firstLineEnd = raw.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd)).trim();
  const rest = firstLineEnd === -1 ? "" : raw.slice(firstLineEnd + 1);
  const m = firstLine.match(/^MATCH:\s*(.+)$/);
  if (!m || m[1].trim() === "NONE") {
    return { matched: false, reason: rest.trim() || firstLine };
  }
  const relPath = m[1].trim();
  const content = rest.replace(/^---\s*\n?/, "");
  return { matched: true, relPath, content };
}

// scripts/figma-mapping/index.mjs
var rl = readline.createInterface({ input: stdin, output: stdout });
var ask = (q) => rl.question(q);
function printHelp() {
  console.log(`\u7528\u6CD5:
  node scripts/figma-mapping/index.mjs <schema.json> [--ai]

schema.json \u4ECE\u63D2\u4EF6\u9762\u677F\u62FF\uFF1A
  - \u5355\u4E2A\u7EC4\u4EF6\uFF1A"\u5BFC\u51FA schema.json"\u6309\u94AE\uFF08\u672A\u6620\u5C04\u72B6\u6001\u4E0B\u624D\u6709\uFF09
  - \u4E00\u6574\u6279\uFF1A\u5019\u9009\u5217\u8868\u91CC"\u5BFC\u51FA\u5168\u90E8 schema.json"\u6309\u94AE\uFF0C\u4F1A\u662F\u4E00\u4E2A schema \u6570\u7EC4\uFF0C\u811A\u672C\u6328\u4E2A\u8DD1\u5B8C

\u4E0D\u5E26 --ai\uFF1A\u672C\u5730\u6B63\u5219\u6253\u5206\u6392\u5019\u9009\uFF0C\u4F60\u81EA\u5DF1\u6311\u3001\u81EA\u5DF1\u5224\u65AD\u8981\u4E0D\u8981\u63A5\u54EA\u4E2A prop\u3002
\u5E26 --ai\uFF1A\u8C03\u672C\u673A claude CLI\uFF08\u65E0\u5934\u6A21\u5F0F\uFF0C\u7981\u6389\u6240\u6709\u5DE5\u5177\u6743\u9650\uFF09\u8BFB schema + \u5019\u9009\u6E90\u7801\uFF0C\u76F4\u63A5\u505A\u771F\u5224\u65AD\u3001
        \u751F\u6210\u5B8C\u6574\u6620\u5C04\u5185\u5BB9\uFF0C\u4F60\u53EA\u9700\u8981\u786E\u8BA4\u8981\u4E0D\u8981\u91C7\u7EB3\u2014\u2014\u5224\u65AD\u529B\u6BD4\u6B63\u5219\u5F3A\uFF0C\u4F46\u4E5F\u53EF\u80FD\u5224\u65AD\u9519\uFF0C\u4E00\u6837\u8981\u770B\u4E00\u773C\u3002

\u4E24\u79CD\u6A21\u5F0F\u90FD\u4F1A\u628A .figma.ts \u751F\u6210\u5230\u5F53\u524D\u76EE\u5F55\uFF08\u8FD0\u884C\u8FD9\u4E2A\u547D\u4EE4\u7684\u9879\u76EE\u6839\u76EE\u5F55\uFF09\u7684 figma-mappings/\uFF0C\u5E76\u91CD\u65B0\u751F\u6210
registry.generated.ts\uFF08\u81EA\u52A8\u626B\u5168\u90E8 .figma.ts\uFF0C\u4E0D\u9700\u8981\u624B\u52A8\u52A0 import\uFF09\u3002`);
}
function rankFiles(files, schema) {
  return files.map((f) => {
    const info = extractComponentInfo(f);
    const s = scoreCandidate(schema, info);
    return { file: f, info, ...s };
  }).sort((a, b) => b.score - a.score);
}
async function main(schemaPath2, useAi) {
  if (!schemaPath2 || !fs4.existsSync(schemaPath2)) {
    console.error(`\u627E\u4E0D\u5230 schema \u6587\u4EF6: ${schemaPath2}
\u5148\u5728\u63D2\u4EF6\u9762\u677F\u91CC\u5BF9\u7740\u672A\u6620\u5C04\u7684\u5B9E\u4F8B\u70B9"\u5BFC\u51FA schema.json"\u3002`);
    process.exitCode = 1;
    return;
  }
  const parsed = JSON.parse(fs4.readFileSync(schemaPath2, "utf8"));
  const queue = Array.isArray(parsed) ? parsed : [parsed];
  console.log(`
\u5171 ${queue.length} \u4E2A Figma \u7EC4\u4EF6\u5F85\u5904\u7406\u3002${useAi ? "\uFF08AI \u6A21\u5F0F\uFF09" : ""}
`);
  await processQueue(queue, useAi);
  rl.close();
}
async function processQueue(queue, useAi) {
  if (queue.length === 0) {
    console.log("\n\u5168\u90E8\u5904\u7406\u5B8C\u3002");
    return;
  }
  const [schema, ...rest] = queue;
  console.log(`
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 [\u8FD8\u5269 ${queue.length} \u4E2A] \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`\u76EE\u6807 Figma \u7EC4\u4EF6: ${schema.componentName}`);
  console.log(`\u5C5E\u6027: ${schema.properties.map((p) => `${p.name}(${p.type})`).join(", ") || "\uFF08\u65E0\uFF09"}
`);
  const allFiles = listCandidateFiles();
  if (useAi) {
    return aiFlow(schema, rankFiles(allFiles, schema), rest);
  }
  await pickLoop(schema, rankFiles(allFiles, schema), allFiles, rest);
}
async function aiFlow(schema, ranked, rest) {
  const top = ranked.slice(0, 6);
  if (top.length === 0) {
    console.log("\u6CA1\u6709\u5019\u9009\u6587\u4EF6\uFF0C\u8DF3\u8FC7\u8FD9\u4E2A\u7EC4\u4EF6\u3002");
    return processQueue(rest, true);
  }
  console.log(`\u628A\u8FD9 ${top.length} \u4E2A\u5019\u9009\u8FDE\u540C\u6E90\u7801\u4EA4\u7ED9 claude \u5224\u65AD:`);
  top.forEach((r) => console.log(`  - ${r.file}`));
  console.log("\n\u8C03\u7528\u4E2D\uFF08\u53EF\u80FD\u8981\u51E0\u5341\u79D2\uFF09...\n");
  const config = readConfig();
  const candidates = top.map((r) => ({ relPath: r.file, source: r.info.source }));
  let result;
  try {
    result = aiGenerateMapping({ schema, candidates, importPaths: config.importPaths });
  } catch (err) {
    console.log(`\u8C03\u7528 claude CLI \u5931\u8D25\uFF1A${err.stderr || err.stdout || err.message}
`);
    const fallback = (await ask("\u8981\u4E0D\u8981\u9000\u56DE\u672C\u5730\u6B63\u5219\u6253\u5206\u624B\u52A8\u6311\u4E00\u4E2A\uFF1F(y/N): ")).trim().toLowerCase();
    if (fallback === "y") {
      const allFiles = listCandidateFiles();
      return pickLoop(schema, ranked, allFiles, rest, true);
    }
    return processQueue(rest, true);
  }
  if (!result.matched) {
    console.log(`AI \u5224\u65AD\u6CA1\u6709\u5408\u9002\u7684\u5019\u9009\uFF1A${result.reason}
`);
    const fallback = (await ask("\u8981\u4E0D\u8981\u9000\u56DE\u672C\u5730\u6B63\u5219\u6253\u5206\u624B\u52A8\u6311\u4E00\u4E2A\uFF1F(y/N): ")).trim().toLowerCase();
    if (fallback === "y") {
      const allFiles = listCandidateFiles();
      return pickLoop(schema, ranked, allFiles, rest, true);
    }
    return processQueue(rest, true);
  }
  console.log(`AI \u9009\u4E86: ${result.relPath}
`);
  console.log("\u2500".repeat(60));
  console.log(result.content);
  console.log("\u2500".repeat(60));
  const confirm = (await ask('\n\u786E\u8BA4\u91C7\u7EB3\u8FD9\u4EFD\u751F\u6210\u7ED3\u679C\u5417\uFF1F\u8F93\u5165 "good" \u786E\u8BA4\uFF0C\u5176\u4ED6\u4EFB\u610F\u952E\u653E\u5F03: ')).trim();
  if (confirm !== "good") {
    console.log("\u653E\u5F03\uFF0C\u8DF3\u8FC7\u8FD9\u4E2A\u7EC4\u4EF6\u3002\n");
    return processQueue(rest, true);
  }
  return writeMappingFile(schema, result.content, rest, true);
}
async function pickLoop(schema, ranked, allFiles, rest, useAi) {
  const top = ranked.slice(0, 8);
  if (top.length === 0) {
    console.log("\u6CA1\u6709\u5019\u9009\u6587\u4EF6\u4E86\uFF0C\u8DF3\u8FC7\u8FD9\u4E2A\u7EC4\u4EF6\u3002");
    return processQueue(rest, useAi);
  }
  console.log("\u5019\u9009\u6392\u540D\uFF08\u5206\u6570\u8D8A\u9AD8\u8D8A\u50CF\uFF09:\n");
  top.forEach((r, i) => {
    const reason = `\u540D\u5B57\u76F8\u4F3C\u5EA6 ${r.nameScore.toFixed(2)} \xB7 \u5C5E\u6027\u91CD\u5408 ${r.overlapCount}/${schema.properties.length}`;
    console.log(`  ${i + 1}. ${r.file}  [${r.score.toFixed(2)}]  (${reason})`);
  });
  const answer = (await ask('\n\u8F93\u5165\u5E8F\u53F7\u9009\u4E00\u4E2A / \u8F93\u5165\u5173\u952E\u5B57\u91CD\u65B0\u7B5B\u9009\u6587\u4EF6 / "m" \u624B\u52A8\u8F93\u5165\u8DEF\u5F84 / "s" \u8DF3\u8FC7\u8FD9\u4E2A\u7EC4\u4EF6 / "q" \u5168\u90E8\u9000\u51FA: ')).trim();
  if (answer === "q") return;
  if (answer === "s") return processQueue(rest, useAi);
  if (answer === "m") {
    const rel = (await ask("\u8F93\u5165\u8DEF\u5F84\uFF08\u76F8\u5BF9\u9879\u76EE\u6839\u76EE\u5F55\uFF0C\u6216\u7EDD\u5BF9\u8DEF\u5F84\uFF09: ")).trim();
    if (!fs4.existsSync(path5.resolve(ROOT, rel))) {
      console.log("\u6587\u4EF6\u4E0D\u5B58\u5728\uFF0C\u91CD\u6765\u3002\n");
      return pickLoop(schema, ranked, allFiles, rest, useAi);
    }
    return confirmAndGenerate(schema, path5.relative(ROOT, path5.resolve(ROOT, rel)), rest, useAi);
  }
  const idx = Number(answer);
  if (Number.isInteger(idx) && idx >= 1 && idx <= top.length) {
    return confirmAndGenerate(schema, top[idx - 1].file, rest, useAi);
  }
  const filtered = allFiles.filter((f) => f.toLowerCase().includes(answer.toLowerCase()));
  if (filtered.length === 0) {
    console.log("\u6CA1\u5339\u914D\u5230\u6587\u4EF6\uFF0C\u91CD\u6765\u3002\n");
    return pickLoop(schema, ranked, allFiles, rest, useAi);
  }
  console.log("");
  return pickLoop(schema, rankFiles(filtered, schema), allFiles, rest, useAi);
}
async function confirmAndGenerate(schema, relPath, rest, useAi) {
  const info = extractComponentInfo(relPath);
  const componentName = info.names.find((n) => n.toLowerCase() === path5.basename(relPath, ".ts").toLowerCase()) ?? info.names[0] ?? path5.basename(relPath, ".ts");
  console.log(`
\u9009\u4E2D: ${relPath}`);
  console.log(`\u8BC6\u522B\u5230\u7684\u5BFC\u51FA: ${info.names.join(", ") || "\uFF08\u6CA1\u627E\u5230 export \u7684\u7EC4\u4EF6\u540D\uFF0C\u4F1A\u7528\u6587\u4EF6\u540D\u515C\u5E95\uFF09"}`);
  console.log(`\u9ED8\u8BA4\u53D6: ${componentName}\uFF08\u4E0D\u5BF9\u7684\u8BDD\u4E0B\u4E00\u6B65\u53EF\u4EE5\u6539\uFF09`);
  if (info.propsBlocks.length) {
    console.log(`Props \u5B9A\u4E49:`);
    for (const b of info.propsBlocks) {
      const names = [...b.body.matchAll(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\??:/gm)].map((m) => m[1]);
      console.log(`  ${b.typeName} { ${names.join(", ")} }`);
    }
  } else {
    console.log("\u6CA1\u627E\u5230 Props type/interface\uFF08\u53EF\u80FD\u662F\u5185\u8054\u7C7B\u578B\uFF0C\u751F\u6210\u540E\u81EA\u5DF1\u6838\u5BF9\uFF09");
  }
  const nameInput = (await ask(`
\u4EE3\u7801\u7EC4\u4EF6\u540D [\u56DE\u8F66\u7528 "${componentName}"]: `)).trim();
  const finalName = nameInput || componentName;
  const confirm = (await ask(`
\u786E\u8BA4\u751F\u6210\u6620\u5C04\u5417\uFF1F\u8F93\u5165 "good" \u786E\u8BA4\uFF0C\u5176\u4ED6\u4EFB\u610F\u952E\u653E\u5F03: `)).trim();
  if (confirm !== "good") {
    console.log("\u653E\u5F03\uFF0C\u56DE\u5230\u5217\u8868\u3002\n");
    const allFiles = listCandidateFiles();
    return pickLoop(schema, rankFiles(allFiles, schema), allFiles, rest, useAi);
  }
  const config = readConfig();
  const importSpecifier = toImportSpecifier(relPath, config.importPaths);
  const propsBlock = info.propsBlocks[0];
  const content = buildMatchedScaffold({
    schema,
    componentFile: relPath,
    componentName: finalName,
    importSpecifier,
    propsBlock
  });
  return writeMappingFile(schema, content, rest, useAi);
}
async function writeMappingFile(schema, content, rest, useAi) {
  const safeName = schema.componentName.replace(/[^a-zA-Z0-9]+/g, "") || "Component";
  const defaultOut = path5.relative(ROOT, path5.join(MAPPINGS_DIR, `${safeName}.figma.ts`));
  const outInput = (await ask(`\u4FDD\u5B58\u5230\u54EA [\u56DE\u8F66\u7528 "${defaultOut}"]: `)).trim();
  const outRel = outInput || defaultOut;
  const outAbs = path5.resolve(ROOT, outRel);
  if (!outAbs.startsWith(ROOT + path5.sep)) {
    console.log(`\u62D2\u7EDD\u5199\u5165\uFF1A${outAbs} \u5728\u9879\u76EE\u6839\u76EE\u5F55\u4E4B\u5916\uFF0C\u8FD9\u4E2A\u811A\u672C\u53EA\u5141\u8BB8\u5F80 ${ROOT} \u91CC\u5199\u3002\u8DF3\u8FC7\u8FD9\u4E2A\u7EC4\u4EF6\u3002
`);
    return processQueue(rest, useAi);
  }
  if (fs4.existsSync(outAbs)) {
    const overwrite = (await ask(`${outRel} \u5DF2\u5B58\u5728\uFF0C\u8986\u76D6\uFF1F(y/N): `)).trim().toLowerCase();
    if (overwrite !== "y") {
      console.log("\u53D6\u6D88\u5199\u5165\uFF0C\u8DF3\u8FC7\u8FD9\u4E2A\u7EC4\u4EF6\u3002\n");
      return processQueue(rest, useAi);
    }
  }
  fs4.mkdirSync(path5.dirname(outAbs), { recursive: true });
  fs4.writeFileSync(outAbs, content);
  console.log(`
\u5DF2\u5199\u5165 ${outRel}`);
  const { count } = refreshRegistry({ cwd: ROOT });
  console.log(`registry.generated.ts \u5DF2\u91CD\u65B0\u751F\u6210\uFF08${count} \u6761\u6620\u5C04\uFF09`);
  return processQueue(rest, useAi);
}
var args = process.argv.slice(2);
var useAiFlag = args.includes("--ai");
var schemaPath = args.find((a) => !a.startsWith("--"));
if (!schemaPath) {
  printHelp();
  rl.close();
} else {
  await main(schemaPath, useAiFlag);
  console.log(`
\u5168\u90E8\u8DD1\u5B8C\uFF0C\u56DE\u5230\u9879\u76EE\u91CC\u8DD1\u4E00\u904D\u7C7B\u578B\u68C0\u67E5 + \u63D2\u4EF6\u6784\u5EFA\uFF08\u6BD4\u5982 rexy \u662F "pnpm run figma:build"\uFF09\uFF0C\u786E\u8BA4\u7F16\u5F97\u8FC7\uFF0C\u518D\u56DE Figma \u91CD\u65B0\u8BFB\u53D6\u9A8C\u8BC1\u3002`);
  rl.close();
}
