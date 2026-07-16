const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function readInput(args) {
  if (args.file) {
    return fs.readFileSync(path.resolve(args.file), "utf8");
  }
  return args.input || "";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(targetPath, content) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content, "utf8");
}

function pascalCase(value) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function kebabCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectMatches(lower, checks) {
  return checks.filter((check) => check.pattern.test(lower)).map((check) => check.label);
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

module.exports = {
  parseArgs,
  readInput,
  ensureDir,
  writeFile,
  pascalCase,
  kebabCase,
  collectMatches,
  unique,
};
