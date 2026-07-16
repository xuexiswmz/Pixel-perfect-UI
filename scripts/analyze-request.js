#!/usr/bin/env node

const { parseArgs, readInput, collectMatches } = require("../lib/utils");

// 根据文件扩展名和文本关键词判断输入来源：
// - visual: 截图、线框图、设计稿等视觉输入
// - document: PRD、长需求文档
// - brief: 简短自然语言描述
function detectInputMode(text, filePath) {
  const lower = text.toLowerCase();
  const ext = filePath ? path.extname(filePath).toLowerCase() : "";
  const visualExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".fig", ".sketch"]);

  if (visualExts.has(ext)) {
    return "visual";
  }

  if (
    /mockup|wireframe|prototype|figma|ui screenshot|screenshot|screen shot|\u622a\u56fe|\u9875\u9762\u622a\u56fe|\u8bbe\u8ba1\u56fe|\u539f\u578b\u56fe|\u754c\u9762\u56fe/.test(
      lower,
    )
  ) {
    return "visual";
  }

  if (lower.length > 500 || /requirement|prd|acceptance criteria|user story|\u9700\u6c42/.test(lower)) {
    return "document";
  }

  return "brief";
}

// 仅在视觉输入场景下进一步判断范围：
// 是整页截图、单个区块，还是局部组件截图。
function detectVisualScope(text, inputMode) {
  if (inputMode !== "visual") {
    return "none";
  }

  const lower = text.toLowerCase();
  if (/full[- ]?page|entire page|whole page|\u6574\u9875|\u5168\u9875|homepage|landing page|dashboard/.test(lower)) {
    return "full-page";
  }
  if (/component|button|card|modal|\u7ec4\u4ef6|\u5361\u7247/.test(lower)) {
    return "component-shot";
  }
  if (/section|hero|pricing|faq|features|\u6a21\u5757|\u533a\u5757/.test(lower)) {
    return "section-shot";
  }
  return "full-page";
}

// 判断任务是“新建页面/组件”还是“修改现有页面”，
// 并区分是否带有截图驱动的 patch 语义。
function detectTaskMode(text) {
  const lower = text.toLowerCase();
  const patchTerms =
    /existing|current page|current component|insert|append|replace|patch|\u5df2\u6709|\u73b0\u6709|\u63d2\u5165|\u66ff\u6362|\u4fee\u6539|\u6837\u5f0f/;
  const visualTerms =
    /screenshot|screen shot|mockup|wireframe|image|figma|\u622a\u56fe|\u8bbe\u8ba1\u56fe|\u539f\u578b|\u56fe\u7247|\u753b\u9762/;

  if (patchTerms.test(lower) && visualTerms.test(lower)) {
    return "visual-patch-existing";
  }
  if (
    /existing|current page|current component|insert|append|replace|patch|\u5df2\u6709|\u73b0\u6709|\u63d2\u5165|\u66ff\u6362|\u6a21\u5757/.test(
      lower,
    )
  ) {
    return "patch-existing";
  }
  if (/component|section|card|modal|form|module|\u7ec4\u4ef6|\u533a\u5757/.test(lower)) {
    return "create-component";
  }
  return "create-page";
}

// 优先使用显式传参的 stack，其次从文本里推断框架。
function detectStack(text, explicit) {
  if (explicit) {
    return explicit;
  }

  const lower = text.toLowerCase();
  if (/vue|nuxt/.test(lower)) return "vue";
  if (/svelte/.test(lower)) return "svelte";
  if (/react|next/.test(lower)) return "react";
  if (/html|static/.test(lower)) return "html";
  return "auto";
}

// 优先使用显式传参的 css 模式，其次从文本里推断样式方案。
function detectCssMode(text, explicit) {
  if (explicit) {
    return explicit;
  }

  const lower = text.toLowerCase();
  if (/tailwind/.test(lower)) return "tailwind";
  if (/scss|sass/.test(lower)) return "scss";
  if (/less/.test(lower)) return "less";
  if (/css/.test(lower)) return "css";
  return "auto";
}

// 当输入是视觉稿，或者文本明确要求高保真时，提高输出保真等级。
function detectFidelity(inputMode, text) {
  const lower = text.toLowerCase();
  if (inputMode === "visual") {
    return "high";
  }
  if (/high fidelity|pixel perfect|\u9ad8\u4fdd\u771f|\u50cf\u7d20\u7ea7/.test(lower)) {
    return "high";
  }
  return "standard";
}

function inferDeliverable(taskMode, stack, cssMode) {
  if (taskMode === "patch-existing" || taskMode === "visual-patch-existing") {
    return "minimal-diff";
  }
  if (stack === "html" || (stack === "auto" && cssMode !== "auto")) {
    return "static-files";
  }
  return "component-files";
}

// 把请求粗分为：
// - ui: 以界面结构/样式为主
// - business: 以业务规则/API/权限为主
// - mixed: 同时包含前端 UI 和业务层信号
function detectWorkstream(text) {
  const lower = text.toLowerCase();
  const uiChecks = [
    { pattern: /layout|page|screen|section|component|modal|card|hero|sidebar|dashboard/, label: "ui-structure" },
    { pattern: /style|styling|theme|spacing|typography|color|shadow|radius/, label: "visual-design" },
    { pattern: /responsive|breakpoint|mobile|desktop|tailwind|scss|css/, label: "frontend-styling" },
    { pattern: /\u5e03\u5c40|\u9875\u9762|\u7ec4\u4ef6|\u6837\u5f0f|\u54cd\u5e94\u5f0f/, label: "ui-chinese" },
  ];
  const businessChecks = [
    { pattern: /api|endpoint|integration|fetch|mutation|submit|payload/, label: "api-orchestration" },
    { pattern: /permission|role|auth|authorization|access control/, label: "permissions" },
    { pattern: /workflow|approval|state machine|transition|business rule/, label: "workflow-rules" },
    { pattern: /validation|schema|database|entity|model|mapping|persistence/, label: "data-rules" },
    { pattern: /\u63a5\u53e3|\u6743\u9650|\u89d2\u8272|\u6821\u9a8c|\u5ba1\u6279|\u6d41\u7a0b|\u6570\u636e\u6a21\u578b/, label: "business-chinese" },
  ];

  const uiSignals = collectMatches(lower, uiChecks);
  const businessSignals = collectMatches(lower, businessChecks);

  let workstream = "ui";
  if (businessSignals.length && uiSignals.length) {
    workstream = "mixed";
  } else if (businessSignals.length) {
    workstream = "business";
  }

  return { workstream, businessSignals };
}

// 基于前面的分类结果，补出执行阶段需要显式说明的假设。
// 这些内容不是最终答案，而是帮助后续生成代码时收敛范围。
function buildAssumptions(inputMode, workstream, taskMode, stack, cssMode, businessSignals) {
  const assumptions = [];

  if (inputMode === "brief") {
    assumptions.push("Infer page structure, states, and hierarchy from the short prompt.");
  }
  if (workstream === "mixed") {
    assumptions.push("Split the request into UI slice and business slice before implementing the frontend layer.");
  }
  if (workstream === "business") {
    assumptions.push("This request is primarily business-logic oriented and should not be executed by the UI skill alone.");
  }
  if (stack === "auto") {
    assumptions.push("Detect the framework from the current project before generating code.");
  }
  if (cssMode === "auto") {
    assumptions.push("Reuse the existing style system instead of introducing a new one.");
  }
  if (taskMode === "patch-existing") {
    assumptions.push("Locate the exact host file and insertion point before writing code.");
  }
  if (taskMode === "visual-patch-existing") {
    assumptions.push("Translate the screenshot region into semantic UI anchors before searching the codebase.");
  }
  if (businessSignals.length) {
    assumptions.push(`Record unresolved business dependencies separately: ${businessSignals.join(", ")}.`);
  }

  return assumptions;
}

// 主流程：
// 1. 解析参数
// 2. 读取输入
// 3. 归类请求
// 4. 输出结构化 JSON，供后续脚本或技能工作流消费
function main() {
  const args = parseArgs(process.argv);
  const input = readInput(args).trim();

  if (!input && !args.file) {
    console.error("Provide --input or --file.");
    process.exit(1);
  }

  const inputMode = detectInputMode(input, args.file);
  const visualScope = detectVisualScope(input, inputMode);
  const taskMode = detectTaskMode(input);
  const { workstream, businessSignals } = detectWorkstream(input);
  const stack = detectStack(input, args.stack);
  const cssMode = detectCssMode(input, args.css);
  const fidelity = detectFidelity(inputMode, input);
  const deliverable = inferDeliverable(taskMode, stack, cssMode);
  const assumptions = buildAssumptions(inputMode, workstream, taskMode, stack, cssMode, businessSignals);

  // 整页视觉稿通常还需要先拆页面骨架、区块和复用组件，再进入代码生成。
  if (visualScope === "full-page") {
    assumptions.push("Split the screenshot into shell, sections, repeated components, and token hints before generating code.");
  }

  const result = {
    inputMode,
    visualScope,
    workstream,
    taskMode,
    stack,
    cssMode,
    fidelity,
    deliverable,
    businessSignals,
    assumptions,
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
