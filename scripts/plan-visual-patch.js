#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const REGION_CHECKS = [
  { pattern: /hero|banner|\u9996\u5c4f|\u6a2a\u5e45/, label: "hero" },
  { pattern: /sidebar|side nav|left nav|\u4fa7\u8fb9\u680f|\u5bfc\u822a/, label: "sidebar" },
  { pattern: /header|top bar|toolbar|top-right|\u5934\u90e8|\u9876\u90e8|\u5de5\u5177\u680f/, label: "header-toolbar" },
  { pattern: /empty state|project card|card|\u5361\u7247|\u7a7a\u72b6\u6001/, label: "card" },
  { pattern: /button|cta|\u6309\u94ae/, label: "button-group" },
  { pattern: /avatar|\u5934\u50cf/, label: "avatar-area" },
  { pattern: /modal|dialog|\u5f39\u7a97/, label: "modal" },
  { pattern: /table|list|\u8868\u683c|\u5217\u8868/, label: "list-region" },
];

const RELATION_CHECKS = [
  { pattern: /below|under|beneath|\u5728.+\u4e0b\u65b9|\u5728.+\u4e0b\u9762/, label: "below" },
  { pattern: /above|\u5728.+\u4e0a\u65b9|\u5728.+\u4e0a\u9762/, label: "above" },
  { pattern: /left of|to the left of|\u5728.+\u5de6\u8fb9/, label: "left-of" },
  { pattern: /right of|to the right of|\u5728.+\u53f3\u8fb9/, label: "right-of" },
  { pattern: /inside|within|\u5728.+\u5185\u90e8/, label: "inside" },
  { pattern: /after|\u5728.+\u540e\u9762|\u5728.+\u4e4b\u540e/, label: "after" },
  { pattern: /before|\u5728.+\u524d\u9762|\u5728.+\u4e4b\u524d/, label: "before" },
];

const STYLE_CHECKS = [
  { pattern: /green|\u7eff/, label: "green" },
  { pattern: /outline|outlined|border|\u63cf\u8fb9/, label: "outlined" },
  { pattern: /filled|solid|\u5b9e\u5fc3/, label: "filled" },
  { pattern: /round|rounded|pill|\u5706\u89d2|\u80f6\u56ca/, label: "rounded" },
  { pattern: /shadow|\u9634\u5f71/, label: "shadow" },
  { pattern: /icon|\u56fe\u6807/, label: "icon" },
  { pattern: /badge|\u6807\u7b7e|\u5fbd\u6807/, label: "badge" },
  { pattern: /button|\u6309\u94ae/, label: "button" },
  { pattern: /highlight|active|\u9ad8\u4eae|\u6fc0\u6d3b/, label: "active-state" },
  { pattern: /secondary|\u6b21\u7ea7/, label: "secondary" },
];

const ANCHOR_PATTERNS = [
  /\u9996\u9875/,
  /\u9879\u76ee\u7ba1\u7406/,
  /\u6211\u7684\u56e2\u961f/,
  /\u521b\u4f5c\u6307\u5f15/,
  /\u6700\u8fd1\u9879\u76ee/,
  /\u6682\u65e0\u9879\u76ee/,
  /\u5f00\u59cb\u521b\u4f5c/,
  /\u4e86\u89e3\u66f4\u591a/,
];

// 解析命令行参数，支持从 --input 或 --file 输入视觉 patch 请求。
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

// 优先读取文件内容，否则回退到直接传入的文本。
function readInput(args) {
  if (args.file) {
    return fs.readFileSync(path.resolve(args.file), "utf8");
  }
  return args.input || "";
}

// 提取命中的规则标签，给多个检测函数复用。
function collectMatches(lower, checks) {
  return checks.filter((check) => check.pattern.test(lower)).map((check) => check.label);
}

// 去重并过滤空值。
function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

// 检测请求主要指向哪个 UI 区域。
function detectRegions(lower) {
  const hits = collectMatches(lower, REGION_CHECKS);
  return hits.length > 0 ? unique(hits) : ["ui-region"];
}

// 返回最主要的目标区域，便于单目标流程直接使用。
function detectPrimaryRegion(lower) {
  return detectRegions(lower)[0];
}

// 推断目标与锚点的相对关系，并修正个别常见特殊场景。
function detectRelation(lower, region) {
  const hits = collectMatches(lower, RELATION_CHECKS);
  const relation = hits[0] || inferImplicitRelation(lower);

  if (
    relation === "left-of" &&
    region === "sidebar" &&
    /left sidebar|left nav|\u5de6\u4fa7\u5bfc\u822a|\u5de6\u4fa7\u680f/.test(lower)
  ) {
    return "inside";
  }

  if (
    relation === "right-of" &&
    region === "header-toolbar" &&
    /top-right|right toolbar|\u53f3\u4e0a\u89d2|\u53f3\u4fa7\u5de5\u5177\u680f/.test(lower)
  ) {
    return "inside";
  }

  return relation || "inside";
}

// 当文本没有明确 before/after 时，从左右上下语义里补推断。
function inferImplicitRelation(lower) {
  if (/right side|right edge|\u53f3\u4fa7|\u53f3\u8fb9/.test(lower)) {
    return "right-of";
  }
  if (/left side|left edge|\u5de6\u8fb9/.test(lower)) {
    return "left-of";
  }
  if (/bottom|footer of|at the bottom|\u5e95\u90e8|\u5e95\u4e0b/.test(lower)) {
    return "below";
  }
  if (/top|at the top|\u9876\u90e8|\u4e0a\u65b9/.test(lower)) {
    return "above";
  }
  return "inside";
}

// 根据动作词和相对位置推断最终插入方式。
function detectInsertionType(lower, relation) {
  if (/replace|\u66ff\u6362/.test(lower)) {
    return "replace";
  }
  if (/wrap|\u5305\u4e00\u5c42/.test(lower)) {
    return "wrap";
  }
  if (/append|add|\u65b0\u589e|\u52a0\u4e00\u4e2a|\u52a0\u4e0a/.test(lower)) {
    if (relation === "after" || relation === "right-of" || relation === "below") {
      return "after";
    }
    return "append";
  }
  if (/before|\u4e4b\u524d|\u524d\u9762/.test(lower)) {
    return "before";
  }
  return "append";
}

// 提取样式方向提示，比如 outlined、rounded、active-state。
function detectStyleHints(lower) {
  return collectMatches(lower, STYLE_CHECKS);
}

// 尝试从引号文本或已知页面文案中提取可见锚点。
function extractAnchorText(raw) {
  const quoted = Array.from(raw.matchAll(/["']([^"']+)["']/g)).map((match) => match[1].trim());
  if (quoted.length > 0) {
    return unique(quoted).join(" ");
  }

  const hits = ANCHOR_PATTERNS.map((pattern) => raw.match(pattern))
    .filter(Boolean)
    .map((match) => match[0]);
  return unique(hits).join(" ").trim();
}

// 把区域、关系、样式提示和锚点拼成 repo 定位查询串。
function buildQuery(region, relation, styleHints, anchorText, raw) {
  const tokens = new Set();
  [region, relation, ...styleHints]
    .filter(Boolean)
    .forEach((item) =>
      String(item)
        .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
        .filter(Boolean)
        .forEach((token) => tokens.add(token)),
    );

  extractAnchorText(raw)
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => tokens.add(token));

  anchorText
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => tokens.add(token));

  return Array.from(tokens).join(" ");
}

// 为后续定位和 patch 阶段补出关键假设说明。
function summarizeAssumptions(region, relation, anchorText) {
  const assumptions = [
    `Treat the target as the ${region} region instead of a raw coordinate patch.`,
    `Use ${relation} as the relative placement hint when locating the host subtree.`,
  ];

  if (anchorText) {
    assumptions.push(`Use visible copy as a strong anchor: ${anchorText}.`);
  } else {
    assumptions.push("Use section role, icon meaning, and card type as the primary anchors because no visible copy was extracted.");
  }

  return assumptions;
}

// 统一清洗空白，降低自然语言输入噪声。
function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// 把一个复合 patch 请求拆成多个语义目标片段。
function splitPatchRequest(raw) {
  const normalized = normalizeWhitespace(raw);
  const segments = normalized
    .split(/\s*(?:,|，|;|；|\band\b|\balso\b|\bthen\b|\bplus\b|\u5e76\u4e14|\u5e76|\u540c\u65f6|\u53e6\u5916|\u7136\u540e)\s*/i)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean)
    .filter((segment) => !isContextOnlySegment(segment));

  return segments.length > 0 ? segments : [normalized];
}

// 过滤只有上下文、没有动作意图的片段。
function isContextOnlySegment(segment) {
  const lower = segment.toLowerCase();
  if (
    /^(in the screenshot|from the screenshot|based on (this|the) screenshot|according to (this|the) screenshot)$/.test(
      lower,
    )
  ) {
    return true;
  }

  if (/^\u6839\u636e(\u8fd9\u5f20)?\u622a\u56fe$/.test(segment) || /^\u5728(\u8fd9\u5f20)?\u622a\u56fe\u91cc$/.test(segment)) {
    return true;
  }

  const hasAction = /add|append|insert|change|update|replace|remove|restyle|highlight|\u52a0|\u6539|\u66ff\u6362|\u5220|\u63d2\u5165|\u9ad8\u4eae|\u8c03\u6574/.test(
    lower,
  );
  const hasRegion = detectPrimaryRegion(lower) !== "ui-region";
  const hasStyle = detectStyleHints(lower).length > 0;

  return !hasAction && !hasRegion && !hasStyle;
}

// 把单个片段转成结构化 patch 目标。
function deriveTarget(segment, index) {
  const lower = segment.toLowerCase();
  const targetRegion = detectPrimaryRegion(lower);
  const relation = detectRelation(lower, targetRegion);
  const insertionType = detectInsertionType(lower, relation);
  const styleHints = detectStyleHints(lower);
  const anchor = extractAnchorText(segment);
  const query = buildQuery(targetRegion, relation, styleHints, anchor, segment);
  const confidence = anchor || styleHints.length > 0 ? "medium" : "low";

  return {
    id: `target-${index + 1}`,
    targetRegion,
    relation,
    patchIntent: segment,
    query,
    anchor,
    insertionType,
    styleHints,
    assumptions: summarizeAssumptions(targetRegion, relation, anchor),
    confidence,
  };
}

// 为多目标请求生成一个合并查询串。
function buildCombinedQuery(targets) {
  const tokens = new Set();
  targets.forEach((target) => {
    [target.targetRegion, target.relation, ...target.styleHints, target.anchor]
      .filter(Boolean)
      .forEach((item) =>
        String(item)
          .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
          .filter(Boolean)
          .forEach((token) => tokens.add(token)),
      );
  });
  return Array.from(tokens).join(" ");
}

// 汇总所有目标，生成顶层结果结构。
function buildTopLevelResult(raw, targets) {
  const primary = targets[0];
  const anchors = unique(targets.map((target) => target.anchor).filter(Boolean)).join(" ");
  const styleHints = unique(targets.flatMap((target) => target.styleHints));
  const combinedQuery = buildCombinedQuery(targets);

  return {
    mode: "visual-patch-existing",
    patchIntent: raw,
    targetCount: targets.length,
    multiTarget: targets.length > 1,
    targets,
    combinedQuery,
    combinedAnchor: anchors,
    targetRegion: primary.targetRegion,
    relation: primary.relation,
    query: primary.query,
    anchor: primary.anchor,
    insertionType: primary.insertionType,
    styleHints,
    assumptions: [
      `Split the screenshot-guided request into ${targets.length} semantic patch target${targets.length > 1 ? "s" : ""}.`,
      "Run locate-target.js separately for each target when the regions belong to different UI areas.",
    ],
    confidence: targets.some((target) => target.confidence === "medium") ? "medium" : "low",
  };
}

// 主流程：把截图驱动的自然语言修改请求拆成可定位的 patch 目标。
function main() {
  const args = parseArgs(process.argv);
  const raw = normalizeWhitespace(readInput(args));

  if (!raw) {
    console.error("Provide --input or --file.");
    process.exit(1);
  }

  const globalAnchor = args.anchor || extractAnchorText(raw);
  const manualRegion = args.region;
  const manualInsertion = args.insertion;
  const manualIntent = args.intent;
  const manualQuery = args.query;

  let targets;
  if (manualRegion || manualInsertion || manualIntent || manualQuery) {
    const lower = raw.toLowerCase();
    const targetRegion = manualRegion || detectPrimaryRegion(lower);
    const relation = detectRelation(lower, targetRegion);
    const insertionType = manualInsertion || detectInsertionType(lower, relation);
    const styleHints = detectStyleHints(lower);
    const anchor = globalAnchor;
    const query = manualQuery || buildQuery(targetRegion, relation, styleHints, anchor, raw);
    const confidence = anchor || styleHints.length > 0 ? "medium" : "low";

    targets = [
      {
        id: "target-1",
        targetRegion,
        relation,
        patchIntent: manualIntent || raw,
        query,
        anchor,
        insertionType,
        styleHints,
        assumptions: summarizeAssumptions(targetRegion, relation, anchor),
        confidence,
      },
    ];
  } else {
    const segments = splitPatchRequest(raw);
    targets = segments.map((segment, index) => deriveTarget(segment, index));
  }

  const result = buildTopLevelResult(raw, targets);
  console.log(JSON.stringify(result, null, 2));
}

main();
