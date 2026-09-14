// scripts/generate-registry.mjs
import fs from "node:fs";
import path from "node:path";

// scripts/is-cli-entrypoint.mjs
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
function isCliEntrypoint(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(importMetaUrl));
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
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(d, entry.name);
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
  const base = path.basename(filePath).replace(/\.figma\.ts$/, "").replace(/[^a-zA-Z0-9]/g, "");
  const safe = base && /^[a-zA-Z_]/.test(base) ? base : `M${base}`;
  return `${safe || "Mapping"}_${index}`;
}
function generateRegistry({ cwd, mappingsGlob, outFile, typesImport = "./types" }) {
  const { dir, recursive } = parseGlob(mappingsGlob);
  const files = findFigmaFiles(path.resolve(cwd, dir), recursive);
  const outDir = path.dirname(outFile);
  const imports = files.map((f, i) => {
    const id = identifierFor(f, i);
    let rel = path.relative(outDir, f).replace(/\.ts$/, "");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    rel = rel.split(path.sep).join("/");
    return { id, importPath: rel };
  });
  const typeLine = typesImport == null ? "" : `import type { Template } from '${typesImport}'
`;
  const templatesAnn = typesImport == null ? "" : ": Template[]";
  const body = `// \u81EA\u52A8\u751F\u6210\uFF0C\u4E0D\u8981\u624B\u6539 \u2014\u2014 \u7531 scripts/generate-registry.mjs \u626B .figma.ts \u751F\u6210\uFF0C\u6BCF\u6B21 build \u524D\u91CD\u8DD1
` + typeLine + imports.map((i) => `import ${i.id} from '${i.importPath}'`).join("\n") + (imports.length ? "\n\n" : "\n") + `export const templates${templatesAnn} = [${imports.map((i) => i.id).join(", ")}]
`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, body);
  return { count: files.length, files };
}
if (isCliEntrypoint(import.meta.url)) {
  const [, , mappingsGlob, outFile] = process.argv;
  if (!mappingsGlob || !outFile) {
    console.error("\u7528\u6CD5: node scripts/generate-registry.mjs <mappingsGlob> <outFile>");
    process.exit(1);
  }
  const result = generateRegistry({ cwd: process.cwd(), mappingsGlob, outFile: path.resolve(outFile) });
  console.log(`[generate-registry] \u5199\u5165 ${result.count} \u6761\u6620\u5C04\u5230 ${outFile}`);
}
export {
  generateRegistry
};
