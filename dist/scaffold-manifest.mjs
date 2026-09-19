#!/usr/bin/env node

// scripts/scaffold-manifest.mjs
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

// scripts/scaffold-manifest.mjs
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
    const target = path2.join(cwd, file);
    if (fs.existsSync(target) && !force) {
      results.push({ target, skipped: true });
      continue;
    }
    fs.writeFileSync(target, JSON.stringify(content, null, 2) + "\n");
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
export {
  scaffoldManifest
};
