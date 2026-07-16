#!/usr/bin/env node

const { parseArgs, readInput } = require("../lib/utils");

// 安全解析 JSON；如果失败，后续会回退到自然语言推断。
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 对中英文混合描述做轻量分词。
function tokenize(text) {
  return String(text)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// 判断输入更像整页截图、区块截图还是单组件截图。
function detectScope(text) {
  const lower = text.toLowerCase();
  if (/full[- ]?page|entire page|whole page|整页|全页|homepage|landing page|dashboard/.test(lower)) {
    return "full-page";
  }
  if (/component|button|card|modal|表单|卡片|组件/.test(lower)) {
    return "component-shot";
  }
  if (/section|hero|pricing|faq|features|区块|模块/.test(lower)) {
    return "section-shot";
  }
  return "full-page";
}

// 基于页面关键词给重建计划一个可读的页面名。
function guessPageName(text) {
  const lower = text.toLowerCase();
  if (/dashboard/.test(lower)) return "Dashboard";
  if (/pricing/.test(lower)) return "Pricing Page";
  if (/landing|hero/.test(lower)) return "Landing Page";
  if (/checkout/.test(lower)) return "Checkout Page";
  if (/profile/.test(lower)) return "Profile Page";
  return "Screenshot Reconstruction";
}

// 从文本里推断页面区块结构；没有明显信号时返回默认壳子。
function inferSectionsFromText(text) {
  const lower = text.toLowerCase();
  const sectionPatterns = [
    { keys: ["header", "nav", "navbar", "top bar"], name: "Header", role: "Navigation and brand", layout: "horizontal shell" },
    { keys: ["hero", "headline", "masthead"], name: "Hero", role: "Primary introduction and CTA", layout: "hero layout" },
    { keys: ["feature", "benefit", "capability"], name: "Features", role: "Explain product value", layout: "grid or stacked cards" },
    { keys: ["pricing", "plan"], name: "Pricing", role: "Conversion and plan comparison", layout: "pricing cards" },
    { keys: ["testimonial", "review", "social proof"], name: "Testimonials", role: "Trust and social proof", layout: "quote cards or carousel" },
    { keys: ["faq", "question"], name: "FAQ", role: "Objection handling", layout: "accordion or list" },
    { keys: ["footer"], name: "Footer", role: "Secondary navigation and legal links", layout: "footer columns" },
  ];

  const sections = [];
  for (const pattern of sectionPatterns) {
    if (pattern.keys.some((key) => lower.includes(key))) {
      sections.push({
        name: pattern.name,
        role: pattern.role,
        layout: pattern.layout,
        repeatedComponents: [],
      });
    }
  }

  if (sections.length === 0) {
    return [
      { name: "Header", role: "Navigation and brand", layout: "page shell", repeatedComponents: [] },
      { name: "Main Content", role: "Primary visible content", layout: "stacked sections", repeatedComponents: [] },
      { name: "Footer", role: "Secondary navigation", layout: "footer shell", repeatedComponents: [] },
    ];
  }

  return sections;
}

// 推断可复用组件，并回填到对应的 section 上。
function inferComponents(text, sections) {
  const lower = text.toLowerCase();
  const components = [];
  const patterns = [
    ["card", "Card", "Repeated surface block"],
    ["button", "Button", "CTA or action trigger"],
    ["badge", "Badge", "Small emphasis label"],
    ["avatar", "Avatar", "Profile or identity unit"],
    ["stat", "StatItem", "Numeric highlight block"],
    ["tab", "TabItem", "Segmented navigation item"],
    ["accordion", "AccordionItem", "Expandable FAQ item"],
  ];

  for (const [keyword, name, reason] of patterns) {
    if (lower.includes(keyword)) {
      components.push({ name, reason });
    }
  }

  for (const section of sections) {
    if (/pricing/i.test(section.name)) {
      components.push({ name: "PricingCard", reason: "Repeated pricing comparison block" });
      if (!section.repeatedComponents.includes("PricingCard")) {
        section.repeatedComponents.push("PricingCard");
      }
    }
    if (/features/i.test(section.name)) {
      components.push({ name: "FeatureCard", reason: "Repeated feature explanation block" });
      if (!section.repeatedComponents.includes("FeatureCard")) {
        section.repeatedComponents.push("FeatureCard");
      }
    }
    if (/testimonials/i.test(section.name)) {
      components.push({ name: "TestimonialCard", reason: "Repeated quote or customer proof block" });
      if (!section.repeatedComponents.includes("TestimonialCard")) {
        section.repeatedComponents.push("TestimonialCard");
      }
    }
    if (/faq/i.test(section.name)) {
      components.push({ name: "FaqItem", reason: "Repeated question-and-answer block" });
      if (!section.repeatedComponents.includes("FaqItem")) {
        section.repeatedComponents.push("FaqItem");
      }
    }
  }

  return dedupeByName(components);
}

// 根据视觉描述生成一组设计 token 提示。
function inferTokens(text) {
  const lower = text.toLowerCase();
  return {
    color: {
      bg: /dark/.test(lower) ? "#020617" : "#F8FAFC",
      surface: /dark/.test(lower) ? "#0F172A" : "#FFFFFF",
      border: /dark/.test(lower) ? "#1E293B" : "#E2E8F0",
      text: {
        primary: /dark/.test(lower) ? "#F8FAFC" : "#0F172A",
        secondary: /dark/.test(lower) ? "#CBD5E1" : "#475569",
        muted: /dark/.test(lower) ? "#94A3B8" : "#64748B",
      },
      brand: {
        primary: /violet|purple/.test(lower) ? "#7C3AED" : "#2563EB",
        accent: /pink|magenta/.test(lower) ? "#EC4899" : "#7C3AED",
      },
    },
    space: /dense/.test(lower)
      ? { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", section: "64px" }
      : { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", section: "96px" },
    radius: /rounded|soft/.test(lower)
      ? { sm: "10px", md: "18px", lg: "28px", pill: "999px" }
      : { sm: "6px", md: "12px", lg: "20px", pill: "999px" },
    shadow: /shadow|elevated|card/.test(lower)
      ? {
          card: "0 12px 40px rgba(15, 23, 42, 0.06)",
          popover: "0 20px 50px rgba(15, 23, 42, 0.12)",
        }
      : {
          card: "0 6px 24px rgba(15, 23, 42, 0.04)",
          popover: "0 12px 32px rgba(15, 23, 42, 0.08)",
        },
    typography: /editorial|serif/.test(lower)
      ? {
          hero: { size: "60px", lineHeight: "68px", weight: 700 },
          title: { size: "34px", lineHeight: "42px", weight: 600 },
          body: { size: "17px", lineHeight: "30px", weight: 400 },
          label: { size: "14px", lineHeight: "20px", weight: 500 },
        }
      : {
          hero: { size: "56px", lineHeight: "64px", weight: 700 },
          title: { size: "32px", lineHeight: "40px", weight: 600 },
          body: { size: "16px", lineHeight: "28px", weight: 400 },
          label: { size: "14px", lineHeight: "20px", weight: 500 },
        },
    layout: {
      container: /full width|full-width/.test(lower) ? "1440px" : "1200px",
      heroGap: /spacious|large gap/.test(lower) ? "64px" : "48px",
      gridGap: /dense/.test(lower) ? "16px" : "24px",
    },
  };
}

// 推断页面外壳信息，比如头尾、背景和内容宽度。
function inferShell(text, scope, sections) {
  const lower = text.toLowerCase();
  return {
    scope,
    hasHeader: sections.some((section) => section.name === "Header"),
    hasFooter: sections.some((section) => section.name === "Footer"),
    background: /gradient/.test(lower) ? "gradient background present" : "single-surface or sectional backgrounds",
    maxWidth: /full width|full-width/.test(lower) ? "full-width sections" : "centered content container",
  };
}

// 生成一个从壳到区块再到组件的装配步骤清单。
function buildAssemblyPlan(sections, components) {
  const steps = [];
  steps.push("Build the page shell and global background treatment.");
  steps.push("Create section wrappers in vertical order.");
  if (components.length > 0) {
    steps.push("Implement repeated components before composing sections.");
  }
  for (const section of sections) {
    steps.push(`Compose the ${section.name} section using its inferred layout and repeated components.`);
  }
  steps.push("Apply visual tokens, spacing rhythm, and responsive collapse rules.");
  return steps;
}

// 按名称去重组件定义。
function dedupeByName(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    result.push(item);
  }
  return result;
}

// 当输入本身是 JSON 规格时，补齐默认值并规范结构。
function normalizeJsonSpec(spec) {
  const scope = spec.scope || "full-page";
  const pageName = spec.pageName || "Screenshot Reconstruction";
  const sections = Array.isArray(spec.sections)
    ? spec.sections.map((section) => ({
        ...section,
        repeatedComponents: Array.isArray(section.repeatedComponents)
          ? Array.from(new Set(section.repeatedComponents))
          : [],
      }))
    : [];
  const components = inferComponents(JSON.stringify(spec), sections);
  return {
    scope,
    pageName,
    shell: spec.shell || inferShell(JSON.stringify(spec), scope, sections),
    preciseOverrides: spec.preciseOverrides || {},
    sections,
    components,
    tokens: spec.tokens || inferTokens(JSON.stringify(spec)),
    assemblySteps: buildAssemblyPlan(sections, components),
  };
}

// 当输入是自然语言描述时，直接从文本构造重建计划。
function buildPlanFromText(text) {
  const scope = detectScope(text);
  const pageName = guessPageName(text);
  const sections = inferSectionsFromText(text);
  const components = inferComponents(text, sections);
  const tokens = inferTokens(text);
  const shell = inferShell(text, scope, sections);

  return {
    scope,
    pageName,
    shell,
    sections,
    components,
    tokens,
    assemblySteps: buildAssemblyPlan(sections, components),
  };
}

// 把结构化计划渲染成 Markdown，便于人工检查。
function formatMarkdown(plan) {
  const lines = [];
  lines.push(`# Visual Reconstruction Plan: ${plan.pageName}`);
  lines.push("");
  lines.push(`- **Scope:** ${plan.scope}`);
  lines.push(`- **Header:** ${plan.shell.hasHeader ? "Yes" : "No"}`);
  lines.push(`- **Footer:** ${plan.shell.hasFooter ? "Yes" : "No"}`);
  lines.push(`- **Max Width:** ${plan.shell.maxWidth}`);
  lines.push(`- **Background:** ${plan.shell.background}`);
  lines.push("");
  lines.push("## Sections");
  lines.push("");
  plan.sections.forEach((section, index) => {
    lines.push(`${index + 1}. **${section.name}** - ${section.role}`);
    lines.push(`   Layout: ${section.layout}`);
    if (section.repeatedComponents && section.repeatedComponents.length > 0) {
      lines.push(`   Repeated components: ${section.repeatedComponents.join(", ")}`);
    }
  });
  lines.push("");
  lines.push("## Reusable Components");
  lines.push("");
  if (plan.components.length === 0) {
    lines.push("- No repeated components detected yet.");
  } else {
    plan.components.forEach((component) => {
      lines.push(`- **${component.name}** - ${component.reason}`);
    });
  }
  lines.push("");
  lines.push("## Token Hints");
  lines.push("");
  formatTokenList(plan.tokens).forEach((line) => lines.push(line));
  lines.push("");
  lines.push("## Assembly Steps");
  lines.push("");
  plan.assemblySteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  return lines.join("\n");
}

// 递归展开 token 对象，输出扁平列表。
function formatTokenList(tokens, prefix = "") {
  const lines = [];
  for (const [key, value] of Object.entries(tokens || {})) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      lines.push(...formatTokenList(value, label));
      continue;
    }
    lines.push(`- **${label}:** ${value}`);
  }
  return lines;
}

// 主流程：支持 JSON 或自由文本输入，并输出 JSON 或 Markdown。
function main() {
  const args = parseArgs(process.argv);
  const raw = readInput(args).trim();

  if (!raw) {
    console.error("Provide --input or --file.");
    process.exit(1);
  }

  const format = args.format || "json";
  const jsonSpec = safeJsonParse(raw);
  const plan = jsonSpec ? normalizeJsonSpec(jsonSpec) : buildPlanFromText(raw);

  if (format === "markdown") {
    console.log(formatMarkdown(plan));
    return;
  }

  console.log(JSON.stringify(plan, null, 2));
}

main();
