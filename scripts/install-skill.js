#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseArgs, ensureDir } = require("../lib/utils");

const SOURCE_DIR = path.resolve(__dirname, "..");

const PLATFORM_MAP = {
  claude: { root: ".claude", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: false },
  cursor: { root: ".cursor", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  windsurf: { root: ".windsurf", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  antigravity: { root: ".agent", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  copilot: { root: ".github", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  kiro: { root: ".kiro", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  roocode: { root: ".roo", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  codex: { root: ".codex", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: false },
  qoder: { root: ".qoder", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  gemini: { root: ".gemini", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  trae: { root: ".trae", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  opencode: { root: ".opencode", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  continue: { root: ".continue", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: false },
  codebuddy: { root: ".codebuddy", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
  droid: { root: ".factory", skillPath: "skills/pixel-perfect-ui", stripFrontmatter: true },
};

const COPY_DIRS = ["agents", "assets", "lib", "references", "scripts"];
const COPY_FILES = ["package.json", "package-lock.json"];

// 某些平台不接受 frontmatter，这里按需移除 SKILL.md 头部。
function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }
  const closingIndex = markdown.indexOf("\n---\n", 4);
  if (closingIndex < 0) {
    return markdown;
  }
  return markdown.slice(closingIndex + 5);
}

// 递归复制目录，同时忽略依赖目录和临时检查目录。
function copyDir(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    filter: (filePath) => {
      const base = path.basename(filePath);
      return base !== "node_modules" && base !== ".DS_Store" && base !== ".tmp-check" && base !== ".tmp-check-2";
    },
  });
}

// 按目标 AI 平台的目录结构安装一份 skill，可选附带安装依赖。
function installOne(targetRoot, aiType, options) {
  const config = PLATFORM_MAP[aiType];
  if (!config) {
    throw new Error(`Unsupported AI target: ${aiType}`);
  }

  const targetSkillDir = path.join(targetRoot, config.root, config.skillPath);
  ensureDir(targetSkillDir);

  for (const dir of COPY_DIRS) {
    copyDir(path.join(SOURCE_DIR, dir), path.join(targetSkillDir, dir));
  }

  for (const file of COPY_FILES) {
    fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(targetSkillDir, file));
  }

  const skillSource = fs.readFileSync(path.join(SOURCE_DIR, "SKILL.md"), "utf8");
  const skillOutput = config.stripFrontmatter ? stripFrontmatter(skillSource) : skillSource;
  fs.writeFileSync(path.join(targetSkillDir, "SKILL.md"), skillOutput, "utf8");

  if (options.installDeps) {
    const command =
      process.platform === "win32"
        ? { file: "cmd.exe", args: ["/d", "/s", "/c", "npm install --omit=dev"] }
        : { file: "npm", args: ["install", "--omit=dev"] };
    const result = spawnSync(command.file, command.args, {
      cwd: targetSkillDir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`Dependency install failed for ${aiType}`);
    }
  }

  return targetSkillDir;
}

// 主流程：解析平台和安装目录，执行安装并输出结果摘要。
function main() {
  const args = parseArgs(process.argv);
  const ai = args.ai || "codex";
  const targetRoot = path.resolve(args.target || process.cwd());
  const installDeps = Boolean(args["install-deps"]);
  const targets = ai === "all" ? Object.keys(PLATFORM_MAP) : [ai];

  const installed = [];
  for (const target of targets) {
    installed.push({
      ai: target,
      path: installOne(targetRoot, target, { installDeps }),
    });
  }

  console.log(
    JSON.stringify(
      {
        targetRoot,
        installDeps,
        installed,
      },
      null,
      2
    )
  );
}

main();
