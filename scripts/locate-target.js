#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

let tsModule = undefined;

const CODE_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".scss",
  ".less",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
]);

// 解析命令行参数，支持 --root、--query、--anchor、--limit 等输入。
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
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

// 递归遍历项目目录，收集可能承载 UI 结构的代码文件。
function walk(root, files = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

// 统一分词逻辑，便于后续对路径、内容和锚点做模糊匹配。
function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

// 统计换行数，用于把解析出的节点映射回源码行号。
function countNewlines(text) {
  const matches = text.match(/\n/g);
  return matches ? matches.length : 0;
}

// 尝试加载 TypeScript，以便对 React/TSX 文件走 AST 解析。
function loadTypeScript() {
  if (tsModule !== undefined) {
    return tsModule;
  }
  try {
    tsModule = require("typescript");
  } catch {
    try {
      tsModule = require(path.join(__dirname, "..", "node_modules", "typescript"));
    } catch {
      tsModule = null;
    }
  }
  return tsModule;
}

// 基于扩展名和内容特征识别文件所属框架。
function detectFramework(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".vue") return "vue";
  if (ext === ".svelte") return "svelte";
  if (ext === ".html") return "html";
  if (ext === ".jsx" || ext === ".tsx") return "react";
  if ((ext === ".js" || ext === ".ts") && /return\s*\(|<[A-Z][A-Za-z0-9]*/.test(content)) {
    return "react";
  }
  return "generic";
}

// 告诉 TypeScript 该按哪种脚本类型解析当前文件。
function getScriptKind(filePath, ts) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".ts") return ts.ScriptKind.TS;
  if (ext === ".js") return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

// 从不同框架文件里提取可能包含 UI 结构的 markup 区域。
function extractRegions(filePath, content) {
  const framework = detectFramework(filePath, content);

  if (framework === "vue") {
    const match = content.match(/<template>([\s\S]*?)<\/template>/i);
    if (!match) {
      return [{ framework, markup: content, startLine: 1 }];
    }
    const prefix = content.slice(0, match.index);
    return [
      {
        framework,
        markup: match[1],
        startLine: countNewlines(prefix) + 1,
      },
    ];
  }

  if (framework === "react") {
    const regions = [];
    const pattern = /return\s*\(/g;
    let match;
    while ((match = pattern.exec(content))) {
      let depth = 1;
      let cursor = match.index + match[0].length;
      while (cursor < content.length && depth > 0) {
        const char = content[cursor];
        if (char === "(") depth += 1;
        if (char === ")") depth -= 1;
        cursor += 1;
      }
      const block = content.slice(match.index, cursor);
      const firstTagIndex = block.indexOf("<");
      if (firstTagIndex >= 0) {
        regions.push({
          framework,
          markup: block.slice(firstTagIndex),
          startLine: countNewlines(content.slice(0, match.index + firstTagIndex)) + 1,
        });
      }
    }
    if (regions.length > 0) {
      return regions;
    }
  }

  return [{ framework, markup: content, startLine: 1 }];
}

// 解析标签属性，抽出 class、id 等信息。
function parseAttributes(rawAttrs) {
  const attrs = {};
  const pattern = /([:@a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let match;
  while ((match = pattern.exec(rawAttrs))) {
    attrs[match[1]] = match[2] || match[3] || match[4] || "";
  }
  return attrs;
}

// 创建统一的节点结构，方便不同解析路径共用评分逻辑。
function createNode(tag, attrs, line, parent) {
  const classes = (attrs.class || attrs.className || "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    tag,
    attrs,
    id: attrs.id || "",
    classes,
    line,
    parent,
    children: [],
    textParts: [],
  };
}

// React AST 模式下，额外构造一个“所属组件”虚拟节点。
function createOwnerNode(ownerName, line, parent) {
  return {
    tag: ownerName || "AnonymousComponent",
    attrs: {},
    id: "",
    classes: [],
    line,
    parent,
    children: [],
    textParts: [],
  };
}

// 判断某个 AST 节点是否属于 JSX 体系。
function isJsxLike(ts, node) {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  );
}

// 解开括号或断言包装，拿到真正的 JSX 节点。
function unwrapJsxExpression(ts, node) {
  if (!node) {
    return null;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return unwrapJsxExpression(ts, node.expression);
  }
  if (isJsxLike(ts, node)) {
    return node;
  }
  return null;
}

// 把 JSX 标签名转成可比较的文本。
function jsxTagNameToText(ts, tagName) {
  if (!tagName) {
    return "Unknown";
  }
  if (ts.isIdentifier(tagName)) {
    return tagName.text;
  }
  return tagName.getText();
}

// 提取 JSX 属性值文本，兼容字符串和表达式。
function jsxAttributeValueToText(ts, sourceFile, initializer) {
  if (!initializer) {
    return "true";
  }
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isJsxExpression(initializer)) {
    if (!initializer.expression) {
      return "";
    }
    if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
      return initializer.expression.text;
    }
    return initializer.expression.getText(sourceFile);
  }
  return initializer.getText(sourceFile);
}

// 把 JSX 属性集合转成普通对象。
function jsxAttributesToObject(ts, sourceFile, attributes) {
  const result = {};
  for (const attribute of attributes.properties) {
    if (ts.isJsxAttribute(attribute)) {
      result[attribute.name.text] = jsxAttributeValueToText(ts, sourceFile, attribute.initializer);
      continue;
    }
    if (ts.isJsxSpreadAttribute(attribute)) {
      result["spread"] = attribute.expression.getText(sourceFile);
    }
  }
  return result;
}

// 获取 AST 节点的源码行号。
function getAstLine(ts, sourceFile, node) {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}

// 把 JSX 表达式中的文本线索追加到目标节点。
function appendExpressionText(ts, sourceFile, expression, targetNode) {
  if (!expression) {
    return;
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    targetNode.textParts.push(expression.text);
    return;
  }
  if (ts.isIdentifier(expression)) {
    targetNode.textParts.push(expression.text);
    return;
  }
  const raw = expression.getText(sourceFile).trim();
  if (raw) {
    targetNode.textParts.push(raw);
  }
}

// 递归展开 JSX 子节点，同时收集可见文本。
function populateJsxChildren(ts, sourceFile, jsxNode, parentNode) {
  let children = [];
  if (ts.isJsxElement(jsxNode)) {
    children = jsxNode.children;
  } else if (ts.isJsxFragment(jsxNode)) {
    children = jsxNode.children;
  }

  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = child.getFullText(sourceFile).replace(/\s+/g, " ").trim();
      if (text) {
        parentNode.textParts.push(text);
      }
      continue;
    }
    if (ts.isJsxExpression(child)) {
      appendExpressionText(ts, sourceFile, child.expression, parentNode);
      continue;
    }
    const nested = buildJsxNode(ts, sourceFile, child, parentNode);
    if (nested) {
      parentNode.children.push(nested);
    }
  }
}

// 把单个 JSX AST 节点转换成统一的树节点。
function buildJsxNode(ts, sourceFile, jsxNode, parentNode) {
  if (ts.isJsxElement(jsxNode)) {
    const tag = jsxTagNameToText(ts, jsxNode.openingElement.tagName);
    const attrs = jsxAttributesToObject(ts, sourceFile, jsxNode.openingElement.attributes);
    const node = createNode(tag, attrs, getAstLine(ts, sourceFile, jsxNode.openingElement), parentNode);
    populateJsxChildren(ts, sourceFile, jsxNode, node);
    return node;
  }

  if (ts.isJsxSelfClosingElement(jsxNode)) {
    const tag = jsxTagNameToText(ts, jsxNode.tagName);
    const attrs = jsxAttributesToObject(ts, sourceFile, jsxNode.attributes);
    return createNode(tag, attrs, getAstLine(ts, sourceFile, jsxNode), parentNode);
  }

  if (ts.isJsxFragment(jsxNode)) {
    const node = createNode("Fragment", {}, getAstLine(ts, sourceFile, jsxNode), parentNode);
    populateJsxChildren(ts, sourceFile, jsxNode, node);
    return node;
  }

  return null;
}

// 向上回溯，找出当前 JSX 片段归属的组件或函数名。
function findOwnerName(ts, node) {
  let current = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return current.name.getText();
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isClassDeclaration(current) && current.name) {
      return current.name.text;
    }
    current = current.parent;
  }
  return "AnonymousComponent";
}

// 对 React 文件优先用 AST 抽取节点树，定位更稳。
function extractReactAstEntries(filePath, content) {
  const ts = loadTypeScript();
  if (!ts) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath, ts)
  );

  const roots = [];
  const seenRootKeys = new Set();

  function visit(node) {
    let candidate = null;

    if (ts.isReturnStatement(node)) {
      candidate = unwrapJsxExpression(ts, node.expression);
    } else if (
      ts.isVariableDeclaration(node) ||
      ts.isBinaryExpression(node) ||
      ts.isPropertyAssignment(node)
    ) {
      candidate = unwrapJsxExpression(ts, node.initializer || node.right);
    } else if (isJsxLike(ts, node) && !isJsxLike(ts, node.parent)) {
      candidate = node;
    }

    if (candidate) {
      const ownerName = findOwnerName(ts, node);
      const rootKey = `${ownerName}:${candidate.pos}:${candidate.end}`;
      if (!seenRootKeys.has(rootKey)) {
        seenRootKeys.add(rootKey);
        const ownerNode = createOwnerNode(ownerName, getAstLine(ts, sourceFile, candidate), null);
        const jsxRoot = buildJsxNode(ts, sourceFile, candidate, ownerNode);
        if (jsxRoot) {
          ownerNode.children.push(jsxRoot);
          roots.push(ownerNode);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const entries = [];
  for (const root of roots) {
    flattenNodes(root, entries, 0);
  }
  return entries;
}

// 兜底的轻量 markup 解析器，适用于 HTML/Vue/Svelte 或 AST 不可用场景。
function parseMarkup(markup, startLine) {
  const root = {
    tag: "ROOT",
    attrs: {},
    id: "",
    classes: [],
    line: startLine,
    parent: null,
    children: [],
    textParts: [],
  };

  const stack = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?([A-Za-z][A-Za-z0-9:_-]*)([^>]*)>|([^<]+)/g;
  let match;
  let line = startLine;

  while ((match = tokenPattern.exec(markup))) {
    const whole = match[0];
    const tagName = match[1];
    const attrsText = match[2];
    const textChunk = match[3];

    if (whole.startsWith("<!--")) {
      line += countNewlines(whole);
      continue;
    }

    if (textChunk) {
      const normalized = textChunk.replace(/\s+/g, " ").trim();
      if (normalized) {
        stack[stack.length - 1].textParts.push(normalized);
      }
      line += countNewlines(whole);
      continue;
    }

    const isClosing = whole.startsWith("</");
    const isSelfClosing = /\/>$/.test(whole) || /^(area|base|br|col|embed|hr|img|input|link|meta|source)$/i.test(tagName);

    if (isClosing) {
      while (stack.length > 1) {
        const current = stack.pop();
        if (current.tag.toLowerCase() === tagName.toLowerCase()) {
          break;
        }
      }
      line += countNewlines(whole);
      continue;
    }

    const node = createNode(tagName, parseAttributes(attrsText || ""), line, stack[stack.length - 1]);
    stack[stack.length - 1].children.push(node);

    if (!isSelfClosing) {
      stack.push(node);
    }

    line += countNewlines(whole);
  }

  return root;
}

// 聚合节点文本，供模糊匹配使用。
function nodeText(node) {
  return node.textParts.join(" ").trim();
}

// 生成可读的节点层级路径，方便输出定位结果。
function nodePath(node) {
  const parts = [];
  let current = node;
  while (current && current.parent) {
    let label = current.tag;
    if (current.id) {
      label += `#${current.id}`;
    } else if (current.classes.length > 0) {
      label += `.${current.classes[0]}`;
    }
    parts.unshift(label);
    current = current.parent;
  }
  return parts.join(" > ");
}

// 把树结构拍平成列表，便于逐节点打分。
function flattenNodes(root, items = [], depth = 0) {
  for (const child of root.children) {
    items.push({
      node: child,
      depth,
      path: nodePath(child),
      text: nodeText(child),
    });
    flattenNodes(child, items, depth + 1);
  }
  return items;
}

// 对文件级别打分，先粗筛出可能的宿主文件。
function scoreFile(filePath, content, queryTokens, anchorTokens) {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();
  let score = 0;
  const reasons = [];

  for (const token of queryTokens) {
    if (lowerPath.includes(token)) {
      score += 8;
      reasons.push(`path matches "${token}"`);
    }
    if (lowerContent.includes(token)) {
      score += 4;
      reasons.push(`content matches "${token}"`);
    }
  }

  for (const token of anchorTokens) {
    if (lowerContent.includes(token)) {
      score += 10;
      reasons.push(`anchor matches "${token}"`);
    }
  }

  if (/page|index|home|landing|pricing|dashboard/.test(lowerPath)) {
    score += 3;
    reasons.push("page-like filename");
  }

  if (/<main|<section|return\s*\(|<template>/.test(content)) {
    score += 2;
    reasons.push("contains likely insertion container");
  }

  return { score, reasons };
}

// 对节点级别打分，在候选文件内部找到更具体的插入位置。
function scoreNode(entry, queryTokens, anchorTokens) {
  const node = entry.node;
  const haystack = [
    entry.path,
    entry.text,
    node.id,
    node.classes.join(" "),
    Object.values(node.attrs).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  const reasons = [];

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 5;
      reasons.push(`node matches "${token}"`);
    }
  }

  for (const token of anchorTokens) {
    if (haystack.includes(token)) {
      score += 9;
      reasons.push(`anchor matches node "${token}"`);
    }
  }

  if (/main|section|article|aside|div/i.test(node.tag)) {
    score += 1;
  }
  if (node.id) {
    score += 1;
  }
  if (node.classes.length > 0) {
    score += 1;
  }

  return { score, reasons };
}

// 根据节点类型和锚点命中情况推断默认插入方式。
function suggestInsertion(nodeEntry, anchorTokens) {
  if (anchorTokens.length > 0 && nodeEntry.text) {
    return "after";
  }
  if (/main|section|article|aside/i.test(nodeEntry.node.tag)) {
    return "append";
  }
  return "after";
}

// 把原始分数压成高/中/低三档置信度。
function confidence(score) {
  if (score >= 20) return "high";
  if (score >= 10) return "medium";
  return "low";
}

// 主流程：扫描项目、筛选候选文件、定位候选节点，并输出结果。
function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root || process.cwd());
  const query = args.query || "";
  const anchor = args.anchor || "";
  const limit = Number(args.limit || 5);

  if (!query) {
    console.error("Provide --query.");
    process.exit(1);
  }

  const queryTokens = tokenize(query);
  const anchorTokens = tokenize(anchor);
  const files = walk(root);
  const results = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const framework = detectFramework(filePath, content);
    const { score: fileScore, reasons } = scoreFile(filePath, content, queryTokens, anchorTokens);
    if (fileScore <= 0) {
      continue;
    }

    const bestNodes = [];
    const astEntries = framework === "react" ? extractReactAstEntries(filePath, content) : [];
    const flatEntries = [];

    if (astEntries.length > 0) {
      flatEntries.push(...astEntries);
    } else {
      const regions = extractRegions(filePath, content);
      for (const region of regions) {
        const tree = parseMarkup(region.markup, region.startLine);
        flatEntries.push(...flattenNodes(tree));
      }
    }

    for (const entry of flatEntries) {
      const { score, reasons: nodeReasons } = scoreNode(entry, queryTokens, anchorTokens);
      if (score <= 0) {
        continue;
      }
      bestNodes.push({
        path: entry.path,
        tag: entry.node.tag,
        line: entry.node.line,
        depth: entry.depth,
        text: entry.text.slice(0, 120),
        id: entry.node.id,
        classes: entry.node.classes,
        score,
        confidence: confidence(score),
        insertionType: suggestInsertion(entry, anchorTokens),
        reasons: Array.from(new Set(nodeReasons)).slice(0, 6),
      });
    }

    bestNodes.sort((a, b) => b.score - a.score);

    results.push({
      framework,
      locatorEngine: astEntries.length > 0 ? "typescript-ast" : "markup-tree",
      file: path.relative(root, filePath),
      score: fileScore,
      confidence: confidence(fileScore),
      reasons: Array.from(new Set(reasons)).slice(0, 6),
      bestNodes: bestNodes.slice(0, 5),
    });
  }

  results.sort((a, b) => b.score - a.score);
  console.log(
    JSON.stringify(
      {
        root,
        query,
        anchor,
        candidates: results.slice(0, limit),
      },
      null,
      2
    )
  );
}

main();
