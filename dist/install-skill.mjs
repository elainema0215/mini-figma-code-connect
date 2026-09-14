#!/usr/bin/env node

// scripts/install-skill.mjs
import fs from "node:fs";
import path2 from "node:path";

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
if (isCliEntrypoint(import.meta.url)) {
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
export {
  installSkill
};
