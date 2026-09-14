#!/usr/bin/env node

// scripts/build-plugin.mjs
import * as esbuild from "esbuild";
import { existsSync as existsSync2 } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path4 from "node:path";

// scripts/is-cli-entrypoint.mjs
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function isCliEntrypoint(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}
function findPackageRoot(importMetaUrl) {
  let dir = path.dirname(fileURLToPath(importMetaUrl));
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === "mini-figma-code-connect") return dir;
      } catch {
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("[mini-figma-code-connect] \u627E\u4E0D\u5230\u5305\u6839\u76EE\u5F55\uFF08package.json\uFF09");
    }
    dir = parent;
  }
}

// scripts/generate-registry.mjs
import fs from "node:fs";
import path2 from "node:path";
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
      const full = path2.join(d, entry.name);
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
  const base = path2.basename(filePath).replace(/\.figma\.ts$/, "").replace(/[^a-zA-Z0-9]/g, "");
  const safe = base && /^[a-zA-Z_]/.test(base) ? base : `M${base}`;
  return `${safe || "Mapping"}_${index}`;
}
function generateRegistry({ cwd, mappingsGlob, outFile, typesImport = "./types" }) {
  const { dir, recursive } = parseGlob(mappingsGlob);
  const files = findFigmaFiles(path2.resolve(cwd, dir), recursive);
  const outDir = path2.dirname(outFile);
  const imports = files.map((f, i) => {
    const id = identifierFor(f, i);
    let rel = path2.relative(outDir, f).replace(/\.ts$/, "");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    rel = rel.split(path2.sep).join("/");
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
  const result = generateRegistry({ cwd: process.cwd(), mappingsGlob, outFile: path2.resolve(outFile) });
  console.log(`[generate-registry] \u5199\u5165 ${result.count} \u6761\u6620\u5C04\u5230 ${outFile}`);
}

// scripts/copy-mapping-table.mjs
import fs2 from "node:fs";
import path3 from "node:path";
function copyMappingTable({ cwd, mappingTablePath, outFile }) {
  const src = path3.resolve(cwd, mappingTablePath);
  const content = fs2.existsSync(src) ? fs2.readFileSync(src, "utf8") : "[]\n";
  fs2.mkdirSync(path3.dirname(outFile), { recursive: true });
  fs2.writeFileSync(outFile, content);
  return { found: fs2.existsSync(src) };
}

// scripts/build-plugin.mjs
var PACKAGE_ROOT = findPackageRoot(import.meta.url);
function resolvePluginEntries(packageRoot) {
  const main = path4.join(packageRoot, "dist/main/code.js");
  const ui = path4.join(packageRoot, "dist/ui/ui.js");
  const html = path4.join(packageRoot, "dist/ui/ui.html");
  for (const file of [main, ui, html]) {
    if (!existsSync2(file)) {
      throw new Error(
        `[build-plugin] \u7F3A\u5C11 ${file}\u3002\u8BF7\u5148\u5728\u5F15\u64CE\u5305\u76EE\u5F55\u6267\u884C npm run build\uFF08\u53EA\u4F7F\u7528 dist/\uFF0C\u4E0D\u56DE\u9000 src/\uFF09\u3002`
      );
    }
  }
  return { main, ui, html };
}
function consumerGeneratedPlugin(genDir) {
  const registryFile = path4.join(genDir, "registry.generated.ts");
  const mappingTableFile = path4.join(genDir, "mapping-table.generated.json");
  return {
    name: "consumer-generated",
    setup(build2) {
      build2.onResolve({ filter: /(?:^|[\\/])registry\.generated(?:\.(?:ts|js))?$/ }, () => ({
        path: registryFile
      }));
      build2.onResolve({ filter: /(?:^|[\\/])mapping-table\.generated\.json$/ }, () => ({
        path: mappingTableFile
      }));
    }
  };
}
async function buildPlugin({
  cwd,
  mappingsGlob,
  mappingTablePath = "figma-mapping-table.json",
  outDir = "dist",
  watch = false
}) {
  const { main: mainEntry, ui: uiEntry, html: uiHtml } = resolvePluginEntries(PACKAGE_ROOT);
  const absOutDir = path4.resolve(cwd, outDir);
  const genDir = path4.join(absOutDir, ".generated");
  const registryOut = path4.join(genDir, "registry.generated.ts");
  const mappingTableOut = path4.join(genDir, "mapping-table.generated.json");
  const { count } = generateRegistry({
    cwd,
    mappingsGlob,
    outFile: registryOut,
    typesImport: null
  });
  console.log(`[build-plugin] \u626B\u5230 ${count} \u6761\u6620\u5C04\uFF08${mappingsGlob}\uFF09`);
  const { found } = copyMappingTable({ cwd, mappingTablePath, outFile: mappingTableOut });
  if (!found) console.log(`[build-plugin] \u6CA1\u627E\u5230 ${mappingTablePath}\uFF0C\u4E0B\u8F7D\u6309\u94AE\u4F1A\u7ED9\u7A7A\u6570\u7EC4`);
  const generatedPlugin = consumerGeneratedPlugin(genDir);
  const inlineUi = {
    name: "inline-ui",
    setup(build2) {
      build2.onEnd(async (res) => {
        if (res.errors.length) return;
        const js = res.outputFiles ? res.outputFiles[0].text : await readFile(path4.join(absOutDir, ".ui.tmp.js"), "utf8");
        const html = await readFile(uiHtml, "utf8");
        await mkdir(absOutDir, { recursive: true });
        await writeFile(path4.join(absOutDir, "ui.html"), html.replace("/*__UI_JS__*/", () => js));
        console.log(`[inline-ui] ${path4.join(outDir, "ui.html")} \u5DF2\u66F4\u65B0`);
      });
    }
  };
  const codeOpts = {
    entryPoints: [mainEntry],
    bundle: true,
    format: "iife",
    target: "es2020",
    outfile: path4.join(absOutDir, "code.js"),
    logLevel: "info",
    plugins: [generatedPlugin]
  };
  const uiOpts = {
    entryPoints: [uiEntry],
    bundle: true,
    format: "iife",
    target: "es2020",
    outfile: path4.join(absOutDir, ".ui.tmp.js"),
    logLevel: "warning",
    plugins: [inlineUi, generatedPlugin]
  };
  if (watch) {
    const a = await esbuild.context(codeOpts);
    const b = await esbuild.context(uiOpts);
    await Promise.all([a.watch(), b.watch()]);
    console.log("[build-plugin] watching...");
    return { watching: true };
  }
  await esbuild.build(codeOpts);
  await esbuild.build(uiOpts);
  return { watching: false };
}
if (isCliEntrypoint(import.meta.url)) {
  const args = process.argv.slice(2);
  const watch = args.includes("--watch");
  const outIdx = args.indexOf("--out");
  const outDir = outIdx !== -1 ? args[outIdx + 1] : "dist";
  const mappingsGlob = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
  if (!mappingsGlob) {
    console.error("\u7528\u6CD5: node scripts/build-plugin.mjs <mappingsGlob> [--out dist] [--watch]");
    process.exit(1);
  }
  await buildPlugin({ cwd: process.cwd(), mappingsGlob, outDir, watch });
}
export {
  buildPlugin
};
