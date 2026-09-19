#!/usr/bin/env node

// scripts/scaffold-plugin.mjs
import fs5 from "node:fs";
import path7 from "node:path";

// scripts/install-skill.mjs
import fs from "node:fs";
import path2 from "node:path";

// scripts/is-cli-entrypoint.mjs
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function isCliEntrypoint(importMetaUrl, entryName) {
  if (!process.argv[1]) return false;
  try {
    const argvPath = realpathSync(process.argv[1]);
    const metaPath = realpathSync(fileURLToPath(importMetaUrl));
    if (argvPath !== metaPath) return false;
    if (entryName) {
      return path.basename(argvPath).includes(entryName);
    }
    return true;
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

// scripts/install-skill.mjs
var PACKAGE_ROOT = findPackageRoot(import.meta.url);
var SKILL_SOURCE = path2.join(PACKAGE_ROOT, ".claude/skills/mini-code-connect");
var SKILL_NAME = "mini-code-connect";
function findRepoRoot(cwd) {
  let dir = cwd;
  while (true) {
    if (fs.existsSync(path2.join(dir, ".git"))) return dir;
    const parent = path2.dirname(dir);
    if (parent === dir) return cwd;
    dir = parent;
  }
}
function installSkill({ cwd, root, force = false, claudeMirror = true }) {
  const base = root ?? findRepoRoot(cwd);
  const targets = [];
  if (claudeMirror) targets.push(path2.join(base, ".claude/skills", SKILL_NAME));
  if (fs.existsSync(path2.join(base, ".agents/skills"))) {
    targets.push(path2.join(base, ".agents/skills", SKILL_NAME));
  }
  const results = [];
  for (const target of targets) {
    if (fs.existsSync(target) && !force) {
      results.push({ target, skipped: true });
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(SKILL_SOURCE, target, { recursive: true });
    results.push({ target, skipped: false });
  }
  return { results, root: base };
}
if (isCliEntrypoint(import.meta.url, "install-skill")) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const noClaudeMirror = args.includes("--no-claude-mirror");
  const rootIdx = args.indexOf("--root");
  const root = rootIdx !== -1 ? path2.resolve(args[rootIdx + 1]) : void 0;
  const { results, root: usedRoot } = installSkill({ cwd: process.cwd(), root, force, claudeMirror: !noClaudeMirror });
  console.log(`[install-skill] \u9879\u76EE\u6839\u76EE\u5F55\uFF1A${usedRoot}`);
  for (const r of results) {
    console.log(r.skipped ? `[install-skill] \u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7\uFF08\u52A0 --force \u8986\u76D6\uFF09\uFF1A${r.target}` : `[install-skill] \u5DF2\u5199\u5165\uFF1A${r.target}`);
  }
  console.log('\n\u8DD1 /mini-code-connect\uFF08\u6216\u76F4\u63A5\u8BF4"\u5E2E\u6211\u6620\u5C04\u8FD9\u4E2A Figma \u7EC4\u4EF6"\uFF09\u89E6\u53D1 skill\u3002');
}

// scripts/scaffold-manifest.mjs
import fs2 from "node:fs";
import path3 from "node:path";
function scaffoldManifest({ cwd, name = "Mini Code Connect", id, outDir = "dist", force = false }) {
  if (!id) throw new Error("scaffoldManifest: id \u5FC5\u586B");
  const panel = {
    name,
    id,
    api: "1.0.0",
    main: `${outDir}/code.js`,
    ui: `${outDir}/ui.html`,
    editorType: ["figma", "dev"],
    capabilities: ["inspect"],
    documentAccess: "dynamic-page",
    networkAccess: { allowedDomains: ["none"] }
  };
  const codegen = {
    name: `${name} (Codegen)`,
    id: `${id}-codegen`,
    api: "1.0.0",
    main: `${outDir}/code.js`,
    ui: `${outDir}/ui.html`,
    editorType: ["dev"],
    capabilities: ["codegen"],
    codegenLanguages: [{ label: "React", value: "react" }],
    documentAccess: "dynamic-page",
    networkAccess: { allowedDomains: ["none"] }
  };
  const results = [];
  for (const [file, content] of [
    ["manifest.json", panel],
    ["manifest.codegen.json", codegen]
  ]) {
    const target = path3.join(cwd, file);
    if (fs2.existsSync(target) && !force) {
      results.push({ target, skipped: true });
      continue;
    }
    fs2.writeFileSync(target, JSON.stringify(content, null, 2) + "\n");
    results.push({ target, skipped: false });
  }
  return { results };
}
if (isCliEntrypoint(import.meta.url, "scaffold-manifest")) {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? void 0 : args[i + 1];
  };
  const name = get("--name") ?? "Mini Code Connect";
  const id = get("--id");
  const outDir = get("--out") ?? "dist";
  if (!id) {
    console.error(
      '\u7528\u6CD5: node scripts/scaffold-manifest.mjs --id <manifest-id> [--name "<\u9762\u677F\u663E\u793A\u540D>"] [--out dist] [--force]'
    );
    process.exit(1);
  }
  const { results } = scaffoldManifest({
    cwd: process.cwd(),
    name,
    id,
    outDir,
    force: args.includes("--force")
  });
  for (const r of results) {
    console.log(r.skipped ? `[scaffold-manifest] \u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7\uFF1A${r.target}` : `[scaffold-manifest] \u5DF2\u5199\u5165\uFF1A${r.target}`);
  }
}

// scripts/build-plugin.mjs
import * as esbuild from "esbuild";
import { existsSync as existsSync2 } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path6 from "node:path";

// scripts/generate-registry.mjs
import fs3 from "node:fs";
import path4 from "node:path";
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
    if (!fs3.existsSync(d)) return;
    for (const entry of fs3.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path4.join(d, entry.name);
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
  const base = path4.basename(filePath).replace(/\.figma\.ts$/, "").replace(/[^a-zA-Z0-9]/g, "");
  const safe = base && /^[a-zA-Z_]/.test(base) ? base : `M${base}`;
  return `${safe || "Mapping"}_${index}`;
}
function generateRegistry({ cwd, mappingsGlob, outFile, typesImport = "./types" }) {
  const { dir, recursive } = parseGlob(mappingsGlob);
  const files = findFigmaFiles(path4.resolve(cwd, dir), recursive);
  const outDir = path4.dirname(outFile);
  const imports = files.map((f, i) => {
    const id = identifierFor(f, i);
    let rel = path4.relative(outDir, f).replace(/\.ts$/, "");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    rel = rel.split(path4.sep).join("/");
    return { id, importPath: rel };
  });
  const typeLine = typesImport == null ? "" : `import type { Template } from '${typesImport}'
`;
  const templatesAnn = typesImport == null ? "" : ": Template[]";
  const body = `// \u81EA\u52A8\u751F\u6210\uFF0C\u4E0D\u8981\u624B\u6539 \u2014\u2014 \u7531 scripts/generate-registry.mjs \u626B .figma.ts \u751F\u6210\uFF0C\u6BCF\u6B21 build \u524D\u91CD\u8DD1
` + typeLine + imports.map((i) => `import ${i.id} from '${i.importPath}'`).join("\n") + (imports.length ? "\n\n" : "\n") + `export const templates${templatesAnn} = [${imports.map((i) => i.id).join(", ")}]
`;
  fs3.mkdirSync(outDir, { recursive: true });
  fs3.writeFileSync(outFile, body);
  return { count: files.length, files };
}
if (isCliEntrypoint(import.meta.url, "generate-registry")) {
  const [, , mappingsGlob, outFile] = process.argv;
  if (!mappingsGlob || !outFile) {
    console.error("\u7528\u6CD5: node scripts/generate-registry.mjs <mappingsGlob> <outFile>");
    process.exit(1);
  }
  const result = generateRegistry({ cwd: process.cwd(), mappingsGlob, outFile: path4.resolve(outFile) });
  console.log(`[generate-registry] \u5199\u5165 ${result.count} \u6761\u6620\u5C04\u5230 ${outFile}`);
}

// scripts/copy-mapping-table.mjs
import fs4 from "node:fs";
import path5 from "node:path";
function copyMappingTable({ cwd, mappingTablePath, outFile }) {
  const src = path5.resolve(cwd, mappingTablePath);
  const content = fs4.existsSync(src) ? fs4.readFileSync(src, "utf8") : "[]\n";
  fs4.mkdirSync(path5.dirname(outFile), { recursive: true });
  fs4.writeFileSync(outFile, content);
  return { found: fs4.existsSync(src) };
}

// scripts/build-plugin.mjs
var PACKAGE_ROOT2 = findPackageRoot(import.meta.url);
function resolvePluginEntries(packageRoot) {
  const main = path6.join(packageRoot, "dist/main/code.js");
  const ui = path6.join(packageRoot, "dist/ui/ui.js");
  const html = path6.join(packageRoot, "dist/ui/ui.html");
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
  const registryFile = path6.join(genDir, "registry.generated.ts");
  const mappingTableFile = path6.join(genDir, "mapping-table.generated.json");
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
  const { main: mainEntry, ui: uiEntry, html: uiHtml } = resolvePluginEntries(PACKAGE_ROOT2);
  const absOutDir = path6.resolve(cwd, outDir);
  const genDir = path6.join(absOutDir, ".generated");
  const registryOut = path6.join(genDir, "registry.generated.ts");
  const mappingTableOut = path6.join(genDir, "mapping-table.generated.json");
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
        const js = res.outputFiles ? res.outputFiles[0].text : await readFile(path6.join(absOutDir, ".ui.tmp.js"), "utf8");
        const html = await readFile(uiHtml, "utf8");
        await mkdir(absOutDir, { recursive: true });
        await writeFile(path6.join(absOutDir, "ui.html"), html.replace("/*__UI_JS__*/", () => js));
        console.log(`[inline-ui] ${path6.join(outDir, "ui.html")} \u5DF2\u66F4\u65B0`);
      });
    }
  };
  const codeOpts = {
    entryPoints: [mainEntry],
    bundle: true,
    format: "iife",
    target: "es2020",
    outfile: path6.join(absOutDir, "code.js"),
    logLevel: "info",
    plugins: [generatedPlugin]
  };
  const uiOpts = {
    entryPoints: [uiEntry],
    bundle: true,
    format: "iife",
    target: "es2020",
    outfile: path6.join(absOutDir, ".ui.tmp.js"),
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
if (isCliEntrypoint(import.meta.url, "build")) {
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

// scripts/scaffold-plugin.mjs
async function scaffoldPlugin({
  cwd,
  name = "Mini Code Connect",
  id,
  outDir = "figma-plugin-dist",
  componentsDir = "components",
  mappingsGlob = "figma-mappings/**/*.figma.ts",
  mappingTablePath = "figma-mapping-table.json",
  root,
  force = false
}) {
  if (!id) throw new Error("scaffoldPlugin: id \u5FC5\u586B");
  const steps = [];
  const skill = installSkill({ cwd, root, force });
  steps.push({ step: "install-skill", ...skill });
  const configPath = path7.join(cwd, "figma-mapping.config.json");
  if (fs5.existsSync(configPath) && !force) {
    steps.push({ step: "config", target: configPath, skipped: true });
  } else {
    const config = {
      codeConnect: {
        paths: { [path7.basename(componentsDir)]: componentsDir },
        importPaths: { [`${componentsDir}/*`]: `@/${componentsDir}/*` }
      }
    };
    fs5.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    steps.push({ step: "config", target: configPath, skipped: false });
  }
  const manifest = scaffoldManifest({ cwd, name, id, outDir, force });
  steps.push({ step: "manifest", ...manifest });
  const buildScriptPath = path7.join(cwd, "scripts/build-figma-plugin.mjs");
  if (fs5.existsSync(buildScriptPath) && !force) {
    steps.push({ step: "build-script", target: buildScriptPath, skipped: true });
  } else {
    const buildScript = `#!/usr/bin/env node
import { buildPlugin } from 'mini-figma-code-connect/build'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

await buildPlugin({
  cwd: path.resolve(fileURLToPath(import.meta.url), '../..'),
  mappingsGlob: ${JSON.stringify(mappingsGlob)},
  mappingTablePath: ${JSON.stringify(mappingTablePath)},
  outDir: ${JSON.stringify(outDir)},
  watch: process.argv.includes('--watch'),
})
`;
    fs5.mkdirSync(path7.dirname(buildScriptPath), { recursive: true });
    fs5.writeFileSync(buildScriptPath, buildScript);
    steps.push({ step: "build-script", target: buildScriptPath, skipped: false });
  }
  const pkgPath = path7.join(cwd, "package.json");
  if (!fs5.existsSync(pkgPath)) {
    steps.push({ step: "package-json-scripts", target: pkgPath, skipped: true, reason: "package.json \u4E0D\u5B58\u5728" });
  } else {
    const pkg = JSON.parse(fs5.readFileSync(pkgPath, "utf8"));
    pkg.scripts ??= {};
    const already = pkg.scripts["figma:build"] !== void 0 || pkg.scripts["figma:watch"] !== void 0;
    if (already && !force) {
      steps.push({ step: "package-json-scripts", target: pkgPath, skipped: true, reason: "figma:build/figma:watch \u5DF2\u5B58\u5728" });
    } else {
      pkg.scripts["figma:build"] = "node scripts/build-figma-plugin.mjs";
      pkg.scripts["figma:watch"] = "node scripts/build-figma-plugin.mjs --watch";
      fs5.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      steps.push({ step: "package-json-scripts", target: pkgPath, skipped: false });
    }
  }
  const gitignorePath = path7.join(cwd, ".gitignore");
  const ignoreEntry = `/${outDir}`;
  const existing = fs5.existsSync(gitignorePath) ? fs5.readFileSync(gitignorePath, "utf8") : "";
  const alreadyIgnored = existing.split("\n").some((l) => l.trim() === ignoreEntry || l.trim() === outDir);
  if (alreadyIgnored) {
    steps.push({ step: "gitignore", target: gitignorePath, skipped: true });
  } else {
    const sep = existing === "" || existing.endsWith("\n") ? "" : "\n";
    fs5.writeFileSync(gitignorePath, `${existing}${sep}
# figma code connect \u63D2\u4EF6\u6784\u5EFA\u4EA7\u7269
${ignoreEntry}
`);
    steps.push({ step: "gitignore", target: gitignorePath, skipped: false });
  }
  await buildPlugin({ cwd, mappingsGlob, mappingTablePath, outDir });
  steps.push({ step: "build", target: path7.join(cwd, outDir), skipped: false });
  return { steps };
}
if (isCliEntrypoint(import.meta.url, "scaffold-plugin")) {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i === -1 ? fallback : args[i + 1];
  };
  const name = get("--name") ?? "Mini Code Connect";
  const id = get("--id");
  if (!id) {
    console.error(
      '\u7528\u6CD5: node scripts/scaffold-plugin.mjs --id <manifest-id> [--name "<\u9762\u677F\u663E\u793A\u540D>"] [--out figma-plugin-dist] [--components components] [--force]'
    );
    process.exit(1);
  }
  const { steps } = await scaffoldPlugin({
    cwd: process.cwd(),
    name,
    id,
    outDir: get("--out", "figma-plugin-dist"),
    componentsDir: get("--components", "components"),
    force: args.includes("--force")
  });
  for (const s of steps) {
    if (s.results) {
      for (const r of s.results) {
        console.log(r.skipped ? `[scaffold-plugin] [${s.step}] \u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7\uFF1A${r.target}` : `[scaffold-plugin] [${s.step}] \u5DF2\u5199\u5165\uFF1A${r.target}`);
      }
    } else {
      console.log(
        s.skipped ? `[scaffold-plugin] [${s.step}] \u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7\uFF1A${s.target}${s.reason ? `\uFF08${s.reason}\uFF09` : ""}` : `[scaffold-plugin] [${s.step}] \u5DF2\u5199\u5165\uFF1A${s.target}`
      );
    }
  }
  console.log(
    "\n\u5DF2\u7ECF\u53EF\u4EE5\u5BFC\u5165 Figma \u4E86\uFF08Plugins \u2192 Development \u2192 Import plugin from manifest\u2026 \u9009 manifest.json\uFF09\u3002\n\u5019\u9009\u7EC4\u4EF6\u76EE\u5F55\u4E0D\u662F\u9ED8\u8BA4\u7684 components/ \u7684\u8BDD\uFF0C\u7F16\u8F91 figma-mapping.config.json \u518D\u6539\uFF1B\n\u5EFA\u597D\u771F\u5B9E\u6620\u5C04\u540E\u7528 `pnpm run figma:build`\uFF08\u6216 `figma:watch`\uFF09\u91CD\u65B0\u6253\u5305\u3002"
  );
}
export {
  scaffoldPlugin
};
