#!/usr/bin/env node

const { execFileSync } = require("child_process");
const path = require("path");

// 解析命令行参数，支持布尔开关和键值对参数。
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

// 调用同目录下的 JSON 输出脚本，并把标准输出解析成对象。
function runJsonScript(scriptName, options) {
  const scriptPath = path.join(__dirname, scriptName);
  const cliArgs = [scriptPath];

  Object.entries(options).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") {
      return;
    }
    cliArgs.push(`--${key}`);
    if (value !== true) {
      cliArgs.push(String(value));
    }
  });

  const stdout = execFileSync(process.execPath, cliArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return JSON.parse(stdout);
}

// 为单个视觉 patch 目标挑出最优候选，并给出可读摘要。
function summarizeResolution(target, resolution) {
  const topCandidate = pickPreferredCandidate(resolution.candidates);
  if (!topCandidate) {
    return {
      status: "unresolved",
      summary: `No repo-local candidate found for ${target.targetRegion}.`,
    };
  }

  const topNode = topCandidate.bestNodes[0];
  const locationSummary = topNode
    ? `${topCandidate.file} -> ${topNode.path} (${topNode.insertionType})`
    : `${topCandidate.file} (file-level match only)`;

  return {
    status: deriveStatus(topCandidate, topNode),
    summary: `${target.targetRegion}: ${locationSummary}`,
    preferredCandidate: topCandidate,
  };
}

// 从候选文件列表中选出综合得分最高的一个。
function pickPreferredCandidate(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  return ranked[0];
}

// 综合文件得分、节点得分、框架信息和置信度来排序候选。
function scoreCandidate(candidate) {
  const frameworkBonus = ["html", "react", "vue", "svelte"].includes(candidate.framework) ? 20 : 0;
  const nodeBonus = Array.isArray(candidate.bestNodes) && candidate.bestNodes.length > 0 ? 30 : 0;
  const bestNodeScore = Array.isArray(candidate.bestNodes) && candidate.bestNodes[0] ? candidate.bestNodes[0].score : 0;
  const confidenceBonus =
    candidate.confidence === "high" ? 15 : candidate.confidence === "medium" ? 8 : 0;

  return frameworkBonus + nodeBonus + bestNodeScore + confidenceBonus + (candidate.score || 0);
}

// 把候选状态压成 ready / review / unresolved 三档。
function deriveStatus(candidate, node) {
  if (!candidate) {
    return "unresolved";
  }

  if (candidate.confidence === "high") {
    return "ready";
  }

  if (node && node.confidence === "high") {
    return "ready";
  }

  return "review";
}

// 主流程：先规划视觉 patch 目标，再逐个映射到 repo 里的候选文件和节点。
function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root || process.cwd());
  const limit = args.limit || 3;

  if (!args.input && !args.file) {
    console.error("Provide --input or --file.");
    process.exit(1);
  }

  const plan = runJsonScript("plan-visual-patch.js", {
    input: args.input,
    file: args.file,
    region: args.region,
    anchor: args.anchor,
    query: args.query,
    insertion: args.insertion,
    intent: args.intent,
  });

  const targetResolutions = plan.targets.map((target) => {
    const resolution = runJsonScript("locate-target.js", {
      root,
      query: target.query,
      anchor: target.anchor,
      limit,
    });

    return {
      ...target,
      locate: resolution,
      ...summarizeResolution(target, resolution),
    };
  });

  const unresolvedCount = targetResolutions.filter((target) => target.status === "unresolved").length;
  const reviewCount = targetResolutions.filter((target) => target.status === "review").length;

  const result = {
    mode: "visual-patch-existing",
    root,
    patchIntent: plan.patchIntent,
    targetCount: plan.targetCount,
    multiTarget: plan.multiTarget,
    combinedQuery: plan.combinedQuery,
    combinedAnchor: plan.combinedAnchor,
    targets: targetResolutions,
    summary: {
      readyCount: targetResolutions.length - unresolvedCount - reviewCount,
      reviewCount,
      unresolvedCount,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
