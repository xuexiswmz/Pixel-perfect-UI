#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 解析命令行参数，支持从 JSON 计划和输出配置生成视觉脚手架。
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

// 优先读取文件内容，否则读取 --input 传入的 JSON 文本。
function readInput(args) {
  if (args.file) {
    return fs.readFileSync(path.resolve(args.file), "utf8");
  }
  return args.input || "";
}

// 确保输出目录存在。
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// 写文件前自动创建父目录。
function writeFile(targetPath, content) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content, "utf8");
}

// 把名字转成组件常用的 PascalCase。
function pascalCase(value) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// 把名字转成文件和 class 常用的 kebab-case。
function kebabCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 根据 cssMode 选择样式文件扩展名。
function styleExtension(cssMode) {
  if (cssMode === "scss") return "scss";
  if (cssMode === "less") return "less";
  return "css";
}

// 把布局描述转成可稳定写入 data 属性的 slug。
function layoutSlug(layout) {
  return kebabCase(layout || "custom-layout");
}

// 把自由文本布局归一成少数几种可渲染的布局类型。
function detectLayoutKind(layout) {
  const lower = String(layout || "").toLowerCase();
  if (lower.includes("two-column") || lower.includes("two column")) return "two-column";
  if (lower.includes("three-column") || lower.includes("three column") || lower.includes("cards")) {
    return "card-grid";
  }
  if (lower.includes("carousel") || lower.includes("quote") || lower.includes("testimonial")) {
    return "carousel-grid";
  }
  if (lower.includes("accordion") || lower.includes("faq")) return "accordion-list";
  return "stack";
}

// 为不同布局类型返回对应的类名集合，兼容普通 CSS 和 Tailwind。
function layoutClasses(kind, cssMode) {
  if (cssMode !== "tailwind") {
    return {
      root: `section-shell section-shell--${kind}`,
      header: "section-shell__header",
      body: `section-shell__body section-shell__body--${kind}`,
      lead: "section-shell__lead",
      aside: "section-shell__aside",
      grid: `section-grid section-grid--${kind}`,
      rail: "section-rail",
    };
  }

  if (kind === "two-column") {
    return {
      root: "grid gap-5 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm",
      header: "grid gap-2 md:max-w-xl",
      body: "grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] md:items-start",
      lead: "grid gap-4",
      aside: "grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5",
      grid: "grid gap-4",
      rail: "grid gap-4",
    };
  }

  if (kind === "card-grid") {
    return {
      root: "grid gap-5 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm",
      header: "grid gap-2",
      body: "grid gap-5",
      lead: "grid gap-4",
      aside: "hidden",
      grid: "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
      rail: "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
    };
  }

  if (kind === "carousel-grid") {
    return {
      root: "grid gap-5 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm",
      header: "grid gap-2",
      body: "grid gap-5",
      lead: "grid gap-4",
      aside: "hidden",
      grid: "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
      rail: "flex gap-4 overflow-x-auto pb-2",
    };
  }

  if (kind === "accordion-list") {
    return {
      root: "grid gap-5 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm",
      header: "grid gap-2",
      body: "grid gap-4",
      lead: "grid gap-4",
      aside: "hidden",
      grid: "grid gap-3",
      rail: "grid gap-3",
    };
  }

  return {
    root: "grid gap-5 rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm",
    header: "grid gap-2",
    body: "grid gap-5",
    lead: "grid gap-4",
    aside: "hidden",
    grid: "grid gap-4",
    rail: "grid gap-4",
  };
}

// 把 repeatedComponents 渲染为一组组件占位片段。
function renderComponentCollection(repeated, mapper) {
  return repeated.length === 0
    ? []
    : repeated.map((name) => mapper(name));
}

// 判断字符串里是否命中了任一关键词。
function matchesAny(value, patterns) {
  const lower = String(value || "").toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

// 根据页面名、区块名和 token 风格推断整页变体。
function detectPageVariant(plan) {
  const pageHint = [plan.pageName, plan.shell?.background, ...plan.sections.map((section) => section.name)].join(" ").toLowerCase();
  const componentNames = (plan.components || []).map((component) => String(component.name || "").toLowerCase());
  const tokenHint = JSON.stringify(plan.tokens || {}).toLowerCase();
  if (
    (matchesAny(pageHint, ["item", "asset", "prop", "物品"]) &&
      matchesAny(tokenHint, ["#09090b", "#111111", "rgba(9, 9, 11", "#0a0a0a"])) ||
    matchesAny(pageHint, ["新建物品", "物品图生成", "物品信息"])
  ) {
    return "workspace-dark-item";
  }
  if (
    matchesAny(pageHint, ["workspace", "scene", "canvas", "control panel", "sidebar"]) ||
    ["previewemptystate", "formfield", "segmentedtoggle", "modelselector", "generatebutton"].some((name) =>
      componentNames.includes(name)
    )
  ) {
    return "workspace";
  }
  return "default";
}

// 根据区块名称、角色和布局推断区块级变体。
function detectSectionVariant(section) {
  const joined = [section.name, section.role, section.layout].join(" ").toLowerCase();
  if (matchesAny(joined, ["header", "breadcrumb", "navigation", "top bar"])) {
    return "workspace-topbar";
  }
  if (matchesAny(joined, ["workspace", "preview", "configuration panel", "canvas", "sidebar", "物品"])) {
    return "workspace-scene";
  }
  return "default";
}

// 判断当前页面是否属于 workspace 风格族。
function isWorkspaceVariant(variant) {
  return String(variant || "").startsWith("workspace");
}

// 给多行内容统一增加缩进，方便拼装模板字符串。
function indentBlock(content, spaces) {
  const prefix = " ".repeat(spaces);
  return String(content)
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}

// 根据区块信息和目标语法生成 section 的主体内容。
function renderSectionBody(section, cssMode, syntax, componentMap = {}) {
  const kind = detectLayoutKind(section.layout);
  const repeated = section.repeatedComponents || [];
  const classes = layoutClasses(kind, cssMode);

  const join = (items) => items.filter(Boolean).join("\n");

  if (syntax === "react") {
    if (kind === "two-column") {
      return join([
        `      <div className="${classes.body}">`,
        `        <div className="${classes.lead}">`,
        `          <p className="component-shell">Primary narrative content for ${section.name} goes here.</p>`,
        ...renderComponentCollection(repeated.slice(0, 1), (name) => `          <${pascalCase(name)} />`),
        "        </div>",
        `        <aside className="${classes.aside}">`,
        ...renderComponentCollection(repeated.slice(1), (name) => `          <${pascalCase(name)} />`),
        repeated.length <= 1 ? '          <div className="component-shell">Secondary supporting panel.</div>' : null,
        "        </aside>",
        "      </div>",
      ]);
    }
    if (kind === "card-grid") {
      return join([
        `      <div className="${classes.grid}">`,
        ...renderComponentCollection(repeated, (name) => `        <${pascalCase(name)} />`),
        repeated.length === 0 ? '        <div className="component-shell">Card grid content.</div>' : null,
        "      </div>",
      ]);
    }
    if (kind === "carousel-grid") {
      return join([
        `      <div className="${classes.rail}">`,
        ...renderComponentCollection(repeated, (name) => `        <${pascalCase(name)} />`),
        repeated.length === 0 ? '        <div className="component-shell">Carousel or quote rail content.</div>' : null,
        "      </div>",
      ]);
    }
    if (kind === "accordion-list") {
      return join([
        `      <div className="${classes.grid}">`,
        ...renderComponentCollection(repeated, (name) => `        <${pascalCase(name)} />`),
        repeated.length === 0 ? '        <div className="component-shell">Accordion or FAQ items.</div>' : null,
        "      </div>",
      ]);
    }
    return join([
      `      <div className="${classes.body}">`,
      ...renderComponentCollection(repeated, (name) => `        <${pascalCase(name)} />`),
      repeated.length === 0 ? `        <div className="component-shell">${section.name} visual content goes here.</div>` : null,
      "      </div>",
    ]);
  }

  if (syntax === "vue" || syntax === "svelte" || syntax === "html") {
    const tagFor = (name) => {
      if (syntax === "html") {
        if (componentMap[name]) {
          return indentBlock(componentMap[name], 8);
        }
        return `        <div data-component="${kebabCase(name)}"></div>`;
      }
      return `        <${pascalCase(name)} />`;
    };

    if (kind === "two-column") {
      return join([
        `    <div class="${classes.body}">`,
        `      <div class="${classes.lead}">`,
        `        <p class="component-shell">Primary narrative content for ${section.name} goes here.</p>`,
        ...renderComponentCollection(repeated.slice(0, 1), tagFor),
        "      </div>",
        `      <aside class="${classes.aside}">`,
        ...renderComponentCollection(repeated.slice(1), tagFor),
        repeated.length <= 1 ? '        <div class="component-shell">Secondary supporting panel.</div>' : null,
        "      </aside>",
        "    </div>",
      ]);
    }
    if (kind === "card-grid") {
      return join([
        `    <div class="${classes.grid}">`,
        ...renderComponentCollection(repeated, tagFor),
        repeated.length === 0 ? '      <div class="component-shell">Card grid content.</div>' : null,
        "    </div>",
      ]);
    }
    if (kind === "carousel-grid") {
      return join([
        `    <div class="${classes.rail}">`,
        ...renderComponentCollection(repeated, tagFor),
        repeated.length === 0 ? '      <div class="component-shell">Carousel or quote rail content.</div>' : null,
        "    </div>",
      ]);
    }
    if (kind === "accordion-list") {
      return join([
        `    <div class="${classes.grid}">`,
        ...renderComponentCollection(repeated, tagFor),
        repeated.length === 0 ? '      <div class="component-shell">Accordion or FAQ items.</div>' : null,
        "    </div>",
      ]);
    }
    return join([
      `    <div class="${classes.body}">`,
      ...renderComponentCollection(repeated, tagFor),
      repeated.length === 0 ? `      <div class="component-shell">${section.name} visual content goes here.</div>` : null,
      "    </div>",
    ]);
  }

  return "";
}

// 解析并校验输入的视觉计划 JSON。
function parsePlan(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Visual scaffold input must be valid JSON.");
  }
}

// 标准化视觉计划，补齐 sections/components/tokens 等默认结构。
function normalizePlan(plan) {
  const sections = Array.isArray(plan.sections) ? plan.sections : [];
  const declaredComponents = Array.isArray(plan.components) ? plan.components : [];
  const inferredComponents = [];
  for (const section of sections) {
    const repeated = Array.isArray(section.repeatedComponents) ? section.repeatedComponents : [];
    for (const name of repeated) {
      inferredComponents.push({
        name,
        reason: `Repeated component inferred from the ${section.name || "section"} section.`,
      });
    }
  }
  return {
    scope: plan.scope || "full-page",
    pageName: plan.pageName || "Screenshot Reconstruction",
    shell: plan.shell || {},
    sections: sections.map((section) => ({
      name: section.name || "Section",
      role: section.role || "Section role",
      layout: section.layout || "custom layout",
      repeatedComponents: Array.isArray(section.repeatedComponents)
        ? Array.from(new Set(section.repeatedComponents))
        : [],
    })),
    components: dedupeByName([...declaredComponents, ...inferredComponents]),
    tokens: deepMerge(DEFAULT_TOKENS, plan.tokens || {}),
    assemblySteps: Array.isArray(plan.assemblySteps) ? plan.assemblySteps : [],
  };
}

// 以 name 去重组件定义。
function dedupeByName(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const name = item.name || "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(item);
  }
  return result;
}

const DEFAULT_TOKENS = {
  color: {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    text: {
      primary: "#0F172A",
      secondary: "#475569",
      muted: "#64748B",
    },
    brand: {
      primary: "#2563EB",
      accent: "#7C3AED",
    },
  },
  space: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    section: "96px",
  },
  radius: {
    sm: "8px",
    md: "16px",
    lg: "24px",
    pill: "999px",
  },
  shadow: {
    card: "0 12px 40px rgba(15, 23, 42, 0.06)",
    popover: "0 20px 50px rgba(15, 23, 42, 0.12)",
  },
  typography: {
    hero: {
      size: "56px",
      lineHeight: "64px",
      weight: 700,
    },
    title: {
      size: "32px",
      lineHeight: "40px",
      weight: 600,
    },
    body: {
      size: "16px",
      lineHeight: "28px",
      weight: 400,
    },
    label: {
      size: "14px",
      lineHeight: "20px",
      weight: 500,
    },
  },
  layout: {
    container: "1200px",
    heroGap: "48px",
    gridGap: "24px",
  },
};

// 判断一个值是否是普通对象，供深合并和 token 展开使用。
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// 深合并默认 token 和传入 token，允许局部覆盖。
function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}

// 把嵌套 token 结构拍平成 key-value 列表。
function flattenTokens(value, prefix = "", items = []) {
  if (!isPlainObject(value)) {
    items.push([prefix, value]);
    return items;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}-${kebabCase(key)}` : kebabCase(key);
    flattenTokens(nested, nextPrefix, items);
  }
  return items;
}

// 按点路径从 plan.tokens 里读取 token，支持兜底值。
function getToken(plan, tokenPath, fallback) {
  const parts = tokenPath.split(".");
  let current = plan.tokens;
  for (const part of parts) {
    if (!current || !(part in current)) {
      return fallback;
    }
    current = current[part];
  }
  return current ?? fallback;
}

// 根据 cssMode 生成 token 引用形式，如 CSS 变量、SCSS 变量或 Less 变量。
function tokenReference(tokenPath, cssMode) {
  const key = kebabCase(tokenPath.replace(/\./g, "-"));
  if (cssMode === "scss") {
    return `$${key}`;
  }
  if (cssMode === "less") {
    return `@${key}`;
  }
  return `var(--${key})`;
}

// 把 token 对象渲染成实际的 tokens.css / tokens.scss / tokens.less 内容。
function tokenCss(plan, cssMode) {
  const entries = flattenTokens(plan.tokens);
  if (cssMode === "scss") {
    return entries
      .map(([key, value]) => `$${key}: ${String(value).replace(/"/g, "'")};`)
      .join("\n");
  }
  if (cssMode === "less") {
    return entries
      .map(([key, value]) => `@${key}: ${String(value).replace(/"/g, "'")};`)
      .join("\n");
  }
  const body = entries
    .map(([key, value]) => `  --${key}: ${String(value).replace(/"/g, "'")};`)
    .join("\n");
  return `:root {\n${body}\n}\n`;
}

// 生成整页通用样式，覆盖 page shell、section shell 和若干 workspace 变体。
function pageStyles(plan, cssMode) {
  const ext = styleExtension(cssMode);
  const pageVariant = detectPageVariant(plan);
  const isDarkItemWorkspace = pageVariant === "workspace-dark-item";
  const background = tokenReference("color.bg", cssMode);
  const surface = tokenReference("color.surface", cssMode);
  const border = tokenReference("color.border", cssMode);
  const textPrimary = tokenReference("color.text.primary", cssMode);
  const textSecondary = tokenReference("color.text.secondary", cssMode);
  const textMuted = tokenReference("color.text.muted", cssMode);
  const brandPrimary = tokenReference("color.brand.primary", cssMode);
  const brandAccent = tokenReference("color.brand.accent", cssMode);
  const spaceSm = tokenReference("space.sm", cssMode);
  const spaceMd = tokenReference("space.md", cssMode);
  const spaceLg = tokenReference("space.lg", cssMode);
  const spaceXl = tokenReference("space.xl", cssMode);
  const spaceSection = tokenReference("space.section", cssMode);
  const radiusSm = tokenReference("radius.sm", cssMode);
  const radiusMd = tokenReference("radius.md", cssMode);
  const radiusLg = tokenReference("radius.lg", cssMode);
  const radiusPill = tokenReference("radius.pill", cssMode);
  const shadowCard = tokenReference("shadow.card", cssMode);
  const container = tokenReference("layout.container", cssMode);
  const gridGap = tokenReference("layout.gridGap", cssMode);
  const titleSize = tokenReference("typography.title.size", cssMode);
  const titleLineHeight = tokenReference("typography.title.lineHeight", cssMode);
  const titleWeight = tokenReference("typography.title.weight", cssMode);
  const bodySize = tokenReference("typography.body.size", cssMode);
  const bodyLineHeight = tokenReference("typography.body.lineHeight", cssMode);
  const bodyWeight = tokenReference("typography.body.weight", cssMode);
  const labelSize = tokenReference("typography.label.size", cssMode);
  const labelLineHeight = tokenReference("typography.label.lineHeight", cssMode);
  const labelWeight = tokenReference("typography.label.weight", cssMode);
  return [
    ext === "css" ? '@import "./tokens.css";' : `@import "./tokens.${ext}";`,
    "",
    "*, *::before, *::after {",
    "  box-sizing: border-box;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Segoe UI', sans-serif;",
    `  background: ${background};`,
    `  color: ${textPrimary};`,
    `  font-size: ${bodySize};`,
    `  line-height: ${bodyLineHeight};`,
    `  font-weight: ${bodyWeight};`,
    "}",
    "",
    ".page-shell {",
    `  min-height: 100vh;`,
    `  background: ${background};`,
    "}",
    "",
    isWorkspaceVariant(pageVariant) ? ".page-shell--workspace {" : ".page-shell--workspace {",
    "  position: relative;",
    "  overflow: hidden;",
    "  min-height: 100dvh;",
    "}",
    "",
    ".page-shell--workspace::before {",
    "  content: '';",
    "  position: absolute;",
    "  inset: 0 0 auto 0;",
    "  height: 118px;",
    "  background: linear-gradient(90deg, rgba(212, 233, 250, 0.78), rgba(225, 244, 233, 0.72), rgba(255, 255, 255, 0));",
    "  pointer-events: none;",
    "}",
    "",
    ".page-main {",
    `  width: min(${container}, calc(100% - 48px));`,
    "  margin: 0 auto;",
    "  display: grid;",
    `  gap: ${spaceSection};`,
    `  padding: ${spaceXl} 0 calc(${spaceSection} - ${spaceMd});`,
    "}",
    "",
    ".page-main--workspace {",
    "  position: relative;",
    "  width: calc(100% - 28px);",
    "  max-width: none;",
    "  gap: 12px;",
    "  padding: 14px 0 18px;",
    "  align-items: start;",
    "  min-height: calc(100dvh - 14px);",
    "}",
    "",
    ".section-shell {",
    "  display: grid;",
    `  gap: ${gridGap};`,
    `  padding: ${spaceXl};`,
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusLg};`,
    `  background: ${surface};`,
    `  box-shadow: ${shadowCard};`,
    "}",
    "",
    ".section-shell__header {",
    "  display: grid;",
    `  gap: ${spaceSm};`,
    "}",
    "",
    ".section-shell__body {",
    "  display: grid;",
    `  gap: ${gridGap};`,
    "}",
    "",
    ".section-shell__body--two-column {",
    "  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);",
    "  align-items: start;",
    "}",
    "",
    ".section-shell__body--stack {",
    "  grid-template-columns: minmax(0, 1fr);",
    "}",
    "",
    ".section-shell__lead, .section-shell__aside, .section-grid, .section-rail {",
    "  display: grid;",
    `  gap: ${gridGap};`,
    "}",
    "",
    ".section-shell__aside {",
    `  padding: ${spaceLg};`,
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusLg};`,
    "  background: color-mix(in srgb, white 78%, transparent);",
    "}",
    "",
    ".section-grid--card-grid {",
    "  grid-template-columns: repeat(3, minmax(0, 1fr));",
    "}",
    "",
    ".section-grid--accordion-list {",
    "  grid-template-columns: minmax(0, 1fr);",
    `  gap: ${spaceMd};`,
    "}",
    "",
    ".section-rail {",
    "  grid-auto-flow: column;",
    "  grid-auto-columns: minmax(280px, 1fr);",
    "  overflow-x: auto;",
    `  padding-bottom: ${spaceSm};`,
    "}",
    "",
    ".section-shell__role {",
    "  margin: 0;",
    `  color: ${textMuted};`,
    `  font-size: ${labelSize};`,
    `  line-height: ${labelLineHeight};`,
    `  font-weight: ${labelWeight};`,
    "}",
    "",
    ".section-shell h2, .component-shell h3 {",
    "  margin: 0;",
    `  color: ${textPrimary};`,
    `  font-size: ${titleSize};`,
    `  line-height: ${titleLineHeight};`,
    `  font-weight: ${titleWeight};`,
    "}",
    "",
    ".section-shell p, .component-shell p {",
    "  margin: 0;",
    `  color: ${textSecondary};`,
    `  font-size: ${bodySize};`,
    `  line-height: ${bodyLineHeight};`,
    `  font-weight: ${bodyWeight};`,
    "}",
    "",
    ".component-shell {",
    "  display: grid;",
    `  gap: ${spaceMd};`,
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusMd};`,
    `  padding: ${spaceLg};`,
    `  background: ${surface};`,
    `  box-shadow: ${shadowCard};`,
    "}",
    "",
    ".component-shell--accent {",
    `  border-color: ${brandPrimary};`,
    "}",
    "",
    ".button-shell {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    `  min-height: calc(${spaceXl} + ${spaceSm});`,
    `  padding: ${spaceSm} ${spaceLg};`,
    `  border-radius: ${radiusPill};`,
    `  background: linear-gradient(135deg, ${brandPrimary}, ${brandAccent});`,
    "  color: white;",
    "}",
    "",
    ".workspace-topbar {",
    "  position: relative;",
    "  z-index: 1;",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  min-height: 32px;",
    "  padding: 2px 8px 0 2px;",
    "}",
    "",
    ".workspace-topbar__left {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 10px;",
    "}",
    "",
    ".workspace-topbar__cluster {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 10px;",
    "  min-width: 0;",
    "}",
    "",
    ".workspace-icon-chip {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  width: 28px;",
    "  height: 28px;",
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusSm};`,
    "  background: rgba(255, 255, 255, 0.9);",
    "  color: #475569;",
    "  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);",
    "}",
    "",
    ".workspace-icon-chip--back {",
    "  position: relative;",
    "  color: transparent;",
    "}",
    "",
    ".workspace-icon-chip--back::before {",
    "  content: '';",
    "  width: 8px;",
    "  height: 8px;",
    "  border-left: 1.8px solid #667085;",
    "  border-bottom: 1.8px solid #667085;",
    "  transform: rotate(45deg) translate(1px, -1px);",
    "}",
    "",
    ".workspace-brand-mark {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  width: 26px;",
    "  height: 26px;",
    "  border-radius: 8px;",
    `  background: linear-gradient(135deg, ${brandPrimary}, #16c7b7);`,
    "  color: white;",
    "  font-size: 14px;",
    "  font-weight: 700;",
    "}",
    "",
    ".workspace-brand-mark::before {",
    "  content: '✦';",
    "}",
    "",
    ".workspace-topbar__brand {",
    "  font-size: 14px;",
    "  font-weight: 700;",
    `  color: ${textPrimary};`,
    "}",
    "",
    ".workspace-breadcrumbs {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 6px;",
    "  white-space: nowrap;",
    "  color: #94a3b8;",
    "  font-size: 12px;",
    "}",
    "",
    ".workspace-breadcrumbs__primary {",
    `  color: ${textSecondary};`,
    "  font-weight: 500;",
    "}",
    "",
    ".workspace-breadcrumbs__sep {",
    `  color: ${textMuted};`,
    "}",
    "",
    ".workspace-breadcrumbs span:last-child {",
    "  color: #a7b3c5;",
    "}",
    "",
    ".workspace-shell {",
    "  position: relative;",
    "  z-index: 1;",
    "  display: grid;",
    "  grid-template-columns: minmax(0, 1fr) 516px;",
    "  gap: 12px;",
    "  align-items: stretch;",
    "  min-height: calc(100dvh - 74px);",
    "}",
    "",
    ".workspace-preview {",
    `  border: 1px solid ${border};`,
    "  border-radius: 17px;",
    "  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 250, 253, 0.96));",
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);",
    "  min-height: calc(100dvh - 88px);",
    "  overflow: hidden;",
    "  padding: 0;",
    "}",
    "",
    ".workspace-canvas {",
    "  height: 100%;",
    "  min-height: calc(100dvh - 112px);",
    "  border: 0;",
    "  border-radius: 17px;",
    "  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.95));",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "}",
    "",
    ".workspace-empty {",
    "  display: grid;",
    "  justify-items: center;",
    "  gap: 10px;",
    "  text-align: center;",
    "}",
    "",
    ".workspace-empty__illustration {",
    "  width: 96px;",
    "  height: 76px;",
    "  border-radius: 20px;",
    "  border: 1.5px dashed rgba(148, 163, 184, 0.62);",
    "  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(249,250,251,0.86));",
    "  position: relative;",
    "}",
    "",
    ".workspace-empty__illustration::before {",
    "  content: '';",
    "  position: absolute;",
    "  left: 50%;",
    "  top: 50%;",
    "  width: 40px;",
    "  height: 28px;",
    "  transform: translate(-50%, -35%);",
    "  border: 2px solid rgba(107, 114, 128, 0.56);",
    "  border-radius: 8px;",
    "}",
    "",
    ".workspace-empty__illustration::after {",
    "  content: '';",
    "  position: absolute;",
    "  left: 50%;",
    "  top: 21px;",
    "  width: 16px;",
    "  height: 16px;",
    "  transform: translateX(-50%);",
    "  border-radius: 50%;",
    "  border: 2px solid rgba(107, 114, 128, 0.48);",
    "  background: white;",
    "}",
    "",
    ".workspace-empty__title {",
    "  margin: 0;",
    "  font-size: 16px;",
    "  font-weight: 500;",
    "  color: #4b5563;",
    "}",
    "",
    ".workspace-empty__hint {",
    "  margin: 0;",
    "  font-size: 12px;",
    "  color: #a0aec0;",
    "}",
    "",
    ".workspace-empty__hint a {",
    `  color: ${brandPrimary};`,
    "  text-decoration: none;",
    "}",
    "",
    ".workspace-sidebar {",
    "  min-height: calc(100dvh - 88px);",
    "}",
    "",
    ".workspace-panel {",
    "  min-height: 100%;",
    `  border: 1px solid ${border};`,
    "  border-radius: 16px;",
    "  background: rgba(255, 255, 255, 0.92);",
    "  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.035);",
    "  padding: 14px 16px 14px;",
    "  display: flex;",
    "  flex-direction: column;",
    "  gap: 18px;",
    "}",
    "",
    ".workspace-panel__header {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "}",
    "",
    ".workspace-panel__block {",
    "  display: grid;",
    "  gap: 14px;",
    "}",
    "",
    ".workspace-panel__block + .workspace-panel__block {",
    "  padding-top: 2px;",
    "}",

    ".workspace-panel__block--generation {",
    "  flex: 1 1 auto;",
    "  display: flex;",
    "  flex-direction: column;",
    "  align-content: start;",
    "  gap: 12px;",
    "}",
    "",
    ".workspace-panel__title {",
    "  margin: 0;",
    "  font-size: 13px;",
    "  font-weight: 700;",
    "  color: #111827;",
    "}",
    "",
    ".workspace-panel__ornament {",
    "  width: 34px;",
    "  height: 34px;",
    "  border-radius: 50%;",
    "  border: 1px solid rgba(198, 218, 242, 0.92);",
    "  background: linear-gradient(135deg, rgba(220, 239, 255, 0.96), rgba(241, 228, 255, 0.88));",
    "  position: relative;",
    "  flex: 0 0 auto;",
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.75);",
    "}",
    "",
    ".workspace-panel__ornament::before, .workspace-panel__ornament::after {",
    "  content: '';",
    "  position: absolute;",
    "  inset: 9px;",
    "  border: 1.8px solid rgba(17, 24, 39, 0.88);",
    "  border-radius: 50%;",
    "}",
    "",
    ".workspace-panel__ornament::after {",
    "  inset: 6px 15px 15px 6px;",
    "  border-width: 1.8px 1.8px 0 0;",
    "  border-radius: 0 10px 0 0;",
    "  transform: rotate(45deg);",
    "}",
    "",
    ".workspace-fields {",
    "  display: grid;",
    "  gap: 14px;",
    "}",
    "",
    ".workspace-fields--two-column {",
    "  grid-template-columns: repeat(2, minmax(0, 1fr));",
    "  column-gap: 16px;",
    "  row-gap: 14px;",
    "}",

    ".workspace-fields--info {",
    "  gap: 14px;",
    "}",

    ".workspace-info-row {",
    "  display: grid;",
    "  grid-template-columns: repeat(2, minmax(0, 1fr));",
    "  gap: 16px;",
    "}",
    "",
    ".workspace-field {",
    "  display: grid;",
    "  gap: 7px;",
    "}",
    "",
    ".workspace-field--full {",
    "  grid-column: 1 / -1;",
    "}",
    "",
    ".workspace-field__label {",
    "  font-size: 11.5px;",
    "  font-weight: 500;",
    "  color: #1f2937;",
    "}",

    ".workspace-field__required {",
    "  color: #ef4444;",
    "  margin-right: 4px;",
    "}",
    "",
    ".workspace-input, .workspace-select, .workspace-mini-select {",
    "  min-height: 38px;",
    "  display: flex;",
    "  align-items: center;",
    "  padding: 0 12px;",
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusSm};`,
    "  background: white;",
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(15, 23, 42, 0.015);",
    "  color: #c2cad7;",
    "  font-size: 11.5px;",
    "}",
    "",
    ".workspace-mini-select {",
    "  justify-content: center;",
    "  color: #7d8798;",
    "}",
    "",
    ".workspace-segmented {",
    "  display: grid;",
    "  grid-template-columns: repeat(2, minmax(0, 1fr));",
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusSm};`,
    "  padding: 3px;",
    "  background: white;",
    "}",
    "",
    ".workspace-segmented__item {",
    "  min-height: 34px;",
    "  border: 0;",
    "  background: transparent;",
    `  border-radius: ${radiusSm};`,
    "  color: #3d4a5c;",
    "  font-size: 12px;",
    "  font-weight: 500;",
    "}",
    "",
    ".workspace-segmented__item.is-active {",
    `  background: ${brandPrimary};`,
    "  color: white;",
    "}",

    ".workspace-select::after {",
    "  content: '';",
    "  width: 6px;",
    "  height: 6px;",
    "  border-right: 1.5px solid #9aa4b2;",
    "  border-bottom: 1.5px solid #9aa4b2;",
    "  transform: rotate(45deg) translateY(-1px);",
    "  margin-left: auto;",
    "}",
    "",
    ".workspace-textarea {",
    "  min-height: clamp(186px, 26vh, 220px);",
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusSm};`,
    "  background: white;",
    "  padding: 10px 12px;",
    "  display: grid;",
    "  grid-template-rows: auto 1fr auto;",
    "  align-content: start;",
    "  gap: 10px;",
    `  color: ${textMuted};`,
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);",
    "}",
    "",
    ".workspace-upload-row {",
    "  display: flex;",
    "  align-items: flex-start;",
    "  gap: 10px;",
    "}",
    "",
    ".workspace-upload-chip {",
    "  width: 40px;",
    "  height: 40px;",
    `  border: 1px solid ${border};`,
    `  border-radius: ${radiusSm};`,
    "  background: #f8fafc;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  font-size: 18px;",
    `  color: ${textSecondary};`,
    "}",
    "",
    ".workspace-textarea__placeholder {",
    "  margin: 2px 0 0;",
    "  font-size: 12px;",
    `  color: #c9d1dc;`,
    "}",
    "",
    ".workspace-textarea__spacer {",
    "  min-height: 64px;",
    "}",
    "",
    ".workspace-chip {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 6px;",
    "  width: fit-content;",
    `  padding: 4px 10px;`,
    `  border: 1px solid ${border};`,
    "  border-radius: 999px;",
    "  background: rgba(255,255,255,0.92);",
    `  color: ${textSecondary};`,
    "  font-size: 11.5px;",
    "}",
    "",
    ".workspace-chip--optimize {",
    "  justify-self: start;",
    "  padding: 4px 8px;",
    "  border-color: rgba(51, 199, 106, 0.16);",
    "  background: rgba(51, 199, 106, 0.06);",
    "  color: #24b05a;",
    "  font-weight: 500;",
    "}",
    "",
    ".workspace-chip__spark {",
    "  font-size: 10px;",
    "  line-height: 1;",
    "}",
    "",
    ".workspace-toolbar {",
    "  margin-top: auto;",
    "  display: grid;",
    "  grid-template-columns: minmax(0, 1fr) 60px 70px;",
    "  gap: 8px;",
    "}",

    ".workspace-toolbar .workspace-select, .workspace-toolbar .workspace-mini-select {",
    "  min-height: 30px;",
    "  padding: 0 10px;",
    `  border: 1px solid ${border};`,
    "  border-radius: 8px;",
    "  background: #ffffff;",
    "  box-shadow: none;",
    "  color: #7d8798;",
    "  font-size: 11.5px;",
    "}",
    "",
    ".workspace-primary-action {",
    "  min-height: 38px;",
    "  width: 100%;",
    "  border: 0;",
    "  border-radius: 9px;",
    `  background: linear-gradient(90deg, ${brandPrimary}, ${brandAccent});`,
    "  color: white;",
    "  font-size: 14px;",
    "  font-weight: 600;",
    "  margin-top: 10px;",
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);",
    "}",
    "",
    "@media (max-width: 1600px) {",
    "  .workspace-shell {",
    "    grid-template-columns: minmax(0, 1fr) 468px;",
    "  }",
    "}",
    "",
    "@media (max-width: 1280px) {",
    "  .workspace-shell {",
    "    grid-template-columns: minmax(0, 1fr) 414px;",
    "    min-height: calc(100dvh - 72px);",
    "  }",
    "",
    "  .workspace-preview, .workspace-sidebar {",
    "    min-height: calc(100dvh - 86px);",
    "  }",
    "",
    "  .workspace-canvas {",
    "    min-height: calc(100dvh - 108px);",
    "  }",
    "}",
    "",
    "@media (max-width: 1024px) {",
    "  .section-grid--card-grid {",
    "    grid-template-columns: repeat(2, minmax(0, 1fr));",
    "  }",
    "",
    "  .workspace-shell {",
    "    grid-template-columns: minmax(0, 1fr) 348px;",
    "    min-height: calc(100dvh - 70px);",
    "  }",
    "",
    "  .workspace-fields--two-column,",
    "  .workspace-info-row {",
    "    grid-template-columns: minmax(0, 1fr);",
    "  }",
    "}",
    "",
    "@media (max-width: 900px) {",
    "  .page-main--workspace {",
    "    width: calc(100% - 18px);",
    "    min-height: auto;",
    "  }",
    "",
    "  .workspace-topbar {",
    "    padding-top: 4px;",
    "  }",
    "",
    "  .workspace-topbar__left {",
    "    flex-wrap: wrap;",
    "    row-gap: 6px;",
    "  }",
    "",
    "  .workspace-topbar__cluster {",
    "    flex-wrap: wrap;",
    "    row-gap: 4px;",
    "  }",
    "",
    "  .workspace-shell {",
    "    grid-template-columns: minmax(0, 1fr);",
    "    min-height: auto;",
    "  }",
    "",
    "  .workspace-preview, .workspace-sidebar {",
    "    min-height: auto;",
    "  }",
    "",
    "  .workspace-canvas {",
    "    min-height: 340px;",
    "  }",
    "}",
    "",
    "@media (max-width: 768px) {",
    "  .page-main {",
    "    width: min(100% - 32px, 100%);",
    `    gap: ${spaceXl};`,
    "  }",
    "",
    "  .section-shell {",
    `    padding: ${spaceLg};`,
    "  }",
    "",
    "  .section-shell__body--two-column,",
    "  .section-grid--card-grid {",
    "    grid-template-columns: minmax(0, 1fr);",
    "  }",
    "",
    "  .section-rail {",
    "    grid-auto-columns: minmax(85%, 1fr);",
    "  }",
    "",
    "  .page-main--workspace {",
    "    width: calc(100% - 16px);",
    "    gap: 10px;",
    "  }",
    "",
    "  .workspace-topbar {",
    "    gap: 8px;",
    "  }",
    "",
    "  .workspace-breadcrumbs {",
    "    white-space: normal;",
    "  }",
    "",
    "  .workspace-preview {",
    "    padding: 12px;",
    "  }",
    "",
    "  .workspace-panel {",
    "    padding: 10px;",
    "  }",
    "",
    "  .workspace-toolbar {",
    "    grid-template-columns: minmax(0, 1fr) 72px 72px;",
    "  }",
    "}",
    "",
    "@media (max-width: 560px) {",
    "  .workspace-topbar__cluster {",
    "    gap: 6px;",
    "  }",
    "",
    "  .workspace-topbar__brand {",
    "    font-size: 13px;",
    "  }",
    "",
    "  .workspace-breadcrumbs {",
    "    font-size: 11px;",
    "  }",
    "",
    "  .workspace-canvas {",
    "    min-height: 280px;",
    "  }",
    "",
    "  .workspace-empty__title {",
    "    font-size: 15px;",
    "  }",
    "",
    "  .workspace-toolbar {",
    "    grid-template-columns: minmax(0, 1fr);",
    "  }",
    "",
    "  .workspace-segmented {",
    "    grid-template-columns: minmax(0, 1fr);",
    "  }",
    "",
    "  .workspace-upload-row {",
    "    flex-direction: column;",
    "  }",
    "}",
    ...(isDarkItemWorkspace
      ? [
          "",
          "body, .page-shell, .page-shell--workspace {",
          "  background: #09090B;",
          "  color: rgba(255, 255, 255, 0.9);",
          "}",
          "",
          ".page-shell--workspace::before {",
          "  height: 120px;",
          "  background: linear-gradient(90deg, rgba(16, 40, 32, 0.9), rgba(15, 46, 22, 0.72), rgba(9, 9, 11, 0));",
          "}",
          "",
          ".workspace-topbar {",
          "  min-height: 36px;",
          "  padding: 4px 8px 0 6px;",
          "}",
          "",
          ".workspace-icon-chip {",
          "  width: 32px;",
          "  height: 32px;",
          "  border: 0;",
          "  border-radius: 8px;",
          "  background: #111111;",
          "  box-shadow: none;",
          "}",
          "",
          ".workspace-icon-chip--back::before {",
          "  border-left-color: rgba(255,255,255,0.72);",
          "  border-bottom-color: rgba(255,255,255,0.72);",
          "}",
          "",
          ".workspace-topbar__brand {",
          "  color: rgba(255,255,255,0.92);",
          "}",
          "",
          ".workspace-breadcrumbs {",
          "  color: rgba(255,255,255,0.5);",
          "}",
          "",
          ".workspace-breadcrumbs__primary, .workspace-breadcrumbs__sep, .workspace-breadcrumbs span:last-child {",
          "  color: rgba(255,255,255,0.5);",
          "}",
          "",
          ".workspace-shell--dark-item {",
          "  grid-template-columns: minmax(0, 1fr) 540px;",
          "}",
          "",
          ".workspace-preview--dark-item, .workspace-sidebar--dark-item, .workspace-panel--dark-item {",
          "  min-height: calc(100dvh - 88px);",
          "}",
          "",
          ".workspace-preview--dark-item {",
          "  border-color: rgba(255,255,255,0.05);",
          "  border-radius: 12px;",
          "  background: linear-gradient(180deg, rgba(9, 9, 11, 0.3) 0%, #09090B 10%, #09090B 100%);",
          "  box-shadow: none;",
          "}",
          "",
          ".workspace-canvas--dark-item {",
          "  min-height: calc(100dvh - 112px);",
          "  border-radius: 12px;",
          "  background: linear-gradient(180deg, rgba(9, 9, 11, 0.3) 0%, #09090B 10%, #09090B 100%);",
          "}",
          "",
          ".workspace-empty--dark-item {",
          "  gap: 8px;",
          "}",
          "",
          ".workspace-empty__illustration--dark-item {",
          "  width: 160px;",
          "  height: 160px;",
          "  border: 0;",
          "  border-radius: 20px;",
          "  background: transparent;",
          "}",
          "",
          ".workspace-empty__illustration--dark-item::before {",
          "  width: 78px;",
          "  height: 56px;",
          "  transform: translate(-50%, -30%);",
          "  border-width: 2px;",
          "  border-color: rgba(255,255,255,0.72);",
          "  border-radius: 14px;",
          "}",
          "",
          ".workspace-empty__illustration--dark-item::after {",
          "  top: 44px;",
          "  width: 26px;",
          "  height: 26px;",
          "  border-width: 2px;",
          "  border-color: rgba(255,255,255,0.68);",
          "  background: transparent;",
          "}",
          "",
          ".workspace-empty--dark-item .workspace-empty__title {",
          "  font-size: 16px;",
          "  font-weight: 400;",
          "  color: rgba(255,255,255,0.7);",
          "}",
          "",
          ".workspace-empty--dark-item .workspace-empty__hint {",
          "  font-size: 14px;",
          "  line-height: 21px;",
          "  color: rgba(255,255,255,0.5);",
          "}",
          "",
          ".workspace-empty--dark-item .workspace-empty__hint a {",
          "  color: #3B82F6;",
          "}",
          "",
          ".workspace-panel--dark-item {",
          "  border-color: rgba(255,255,255,0.05);",
          "  border-radius: 12px;",
          "  background: linear-gradient(180deg, rgba(9, 9, 11, 0.3) 0%, #09090B 10%, #09090B 100%);",
          "  box-shadow: none;",
          "  padding: 16px;",
          "  gap: 24px;",
          "}",
          "",
          ".workspace-panel__header--dark-item {",
          "  align-items: flex-start;",
          "}",
          "",
          ".workspace-panel--dark-item .workspace-panel__title {",
          "  font-size: 16px;",
          "  line-height: 21px;",
          "  color: rgba(255,255,255,0.7);",
          "}",
          "",
          ".workspace-panel--dark-item .workspace-panel__block {",
          "  gap: 16px;",
          "}",
          "",
          ".workspace-panel--dark-item .workspace-field__label {",
          "  font-size: 14px;",
          "  line-height: 20px;",
          "  color: rgba(255,255,255,0.9);",
          "}",
          "",
          ".workspace-panel--dark-item .workspace-input,",
          ".workspace-panel--dark-item .workspace-select,",
          ".workspace-panel--dark-item .workspace-mini-select,",
          ".workspace-panel--dark-item .workspace-stepper {",
          "  min-height: 40px;",
          "  border: 1px solid rgba(255,255,255,0.1);",
          "  border-radius: 6px;",
          "  background: #111111;",
          "  box-shadow: none;",
          "  color: rgba(255,255,255,0.3);",
          "  font-size: 14px;",
          "}",
          "",
          ".workspace-panel--dark-item .workspace-select::after {",
          "  border-right-color: rgba(255,255,255,0.7);",
          "  border-bottom-color: rgba(255,255,255,0.7);",
          "  opacity: 0.5;",
          "}",
          "",
          ".workspace-segmented--dark-item {",
          "  background: #111111;",
          "  border: 1px solid rgba(255,255,255,0.1);",
          "  border-radius: 6px;",
          "  padding: 4px;",
          "}",
          "",
          ".workspace-segmented--dark-item .workspace-segmented__item {",
          "  min-height: 32px;",
          "  color: rgba(255,255,255,0.7);",
          "  font-size: 14px;",
          "  border-radius: 6px;",
          "}",
          "",
          ".workspace-segmented--dark-item .workspace-segmented__item.is-active {",
          "  background: #2ECC71;",
          "  color: #FFFFFF;",
          "}",
          "",
          ".workspace-textarea--dark-item {",
          "  min-height: 208px;",
          "  border: 1px solid rgba(255,255,255,0.1);",
          "  border-radius: 6px;",
          "  background: #111111;",
          "  box-shadow: none;",
          "  padding: 12px 12px 8px;",
          "}",
          "",
          ".workspace-upload-row--dark-item {",
          "  gap: 12px;",
          "}",
          "",
          ".workspace-upload-chip--dark-item {",
          "  width: 45px;",
          "  height: 60px;",
          "  border: 0;",
          "  border-radius: 6px;",
          "  background: #18181B;",
          "  color: rgba(255,255,255,0.9);",
          "  font-size: 24px;",
          "}",
          "",
          ".workspace-textarea--dark-item .workspace-textarea__placeholder {",
          "  font-size: 14px;",
          "  line-height: 24px;",
          "  color: rgba(255,255,255,0.3);",
          "}",
          "",
          ".workspace-textarea__spacer--dark-item {",
          "  min-height: 88px;",
          "}",
          "",
          ".workspace-chip--dark-item {",
          "  border-color: rgba(255,255,255,0.1);",
          "  background: #111111;",
          "  color: rgba(255,255,255,0.9);",
          "  padding: 0 12px;",
          "  min-height: 24px;",
          "}",
          "",
          ".workspace-toolbar--dark-item {",
          "  grid-template-columns: minmax(0, 1fr) 121px 121px;",
          "}",
          "",
          ".workspace-toolbar--dark-item .workspace-select,",
          ".workspace-toolbar--dark-item .workspace-mini-select {",
          "  min-height: 40px;",
          "  padding: 0 12px;",
          "  border: 1px solid rgba(255,255,255,0.1);",
          "  border-radius: 6px;",
          "  background: #111111;",
          "  box-shadow: none;",
          "  color: rgba(255,255,255,0.7);",
          "  font-size: 14px;",
          "}",
          "",
          ".workspace-select--dream, .workspace-select--aspect {",
          "  display: flex;",
          "  align-items: center;",
          "  gap: 8px;",
          "  justify-content: flex-start;",
          "}",
          "",
          ".workspace-select__brand-mark {",
          "  width: 20px;",
          "  height: 20px;",
          "  border-radius: 6px;",
          "  background: conic-gradient(from 210deg, #27B2F0, #30F5FE, #FBC610, #FD9C22, #1C6FFF, #27B2F0);",
          "  flex: 0 0 auto;",
          "}",
          "",
          ".workspace-select__aspect-icon {",
          "  width: 12px;",
          "  height: 12px;",
          "  border: 1.2px solid rgba(255,255,255,0.7);",
          "  border-radius: 2px;",
          "  transform: rotate(90deg);",
          "  flex: 0 0 auto;",
          "}",
          "",
          ".workspace-stepper {",
          "  display: flex;",
          "  align-items: stretch;",
          "  justify-content: space-between;",
          "  padding-left: 12px;",
          "  overflow: hidden;",
          "}",
          "",
          ".workspace-stepper__value {",
          "  display: inline-flex;",
          "  align-items: center;",
          "  color: rgba(255,255,255,0.7);",
          "  font-size: 14px;",
          "}",
          "",
          ".workspace-stepper__controls {",
          "  width: 24px;",
          "  border-left: 1px solid rgba(255,255,255,0.1);",
          "  display: grid;",
          "  grid-template-rows: repeat(2, 1fr);",
          "}",
          "",
          ".workspace-stepper__up, .workspace-stepper__down {",
          "  position: relative;",
          "}",
          "",
          ".workspace-stepper__up {",
          "  border-bottom: 1px solid rgba(255,255,255,0.1);",
          "}",
          "",
          ".workspace-stepper__up::before, .workspace-stepper__down::before {",
          "  content: '';",
          "  position: absolute;",
          "  left: 50%;",
          "  top: 50%;",
          "  width: 6px;",
          "  height: 6px;",
          "  border-right: 1px solid rgba(255,255,255,0.7);",
          "  border-bottom: 1px solid rgba(255,255,255,0.7);",
          "}",
          "",
          ".workspace-stepper__up::before {",
          "  transform: translate(-50%, -25%) rotate(-135deg);",
          "}",
          "",
          ".workspace-stepper__down::before {",
          "  transform: translate(-50%, -75%) rotate(45deg);",
          "}",
          "",
          ".workspace-primary-action--dark-item {",
          "  min-height: 40px;",
          "  border-radius: 6px;",
          "  background: linear-gradient(90deg, #67E1B0 0%, #22C55E 50%, #96E16D 100%);",
          "  box-shadow: none;",
          "  font-size: 14px;",
          "}",
          "",
          "@media (max-width: 1600px) {",
          "  .workspace-shell--dark-item {",
          "    grid-template-columns: minmax(0, 1fr) 460px;",
          "  }",
          "}",
          "",
          "@media (max-width: 1280px) {",
          "  .workspace-shell--dark-item {",
          "    grid-template-columns: minmax(0, 1fr) 380px;",
          "  }",
          "}",
          "",
          "@media (max-width: 1024px) {",
          "  .workspace-shell--dark-item {",
          "    grid-template-columns: minmax(0, 1fr) 340px;",
          "  }",
          "  .workspace-toolbar--dark-item {",
          "    grid-template-columns: minmax(0, 1fr);",
          "  }",
          "}",
        ]
      : []),
    ].join("\n");
}

// 生成 React 区块组件源码。
function reactSectionContent(section, cssMode) {
  const sectionName = `${pascalCase(section.name)}Section`;
  const repeated = section.repeatedComponents || [];
  const kind = detectLayoutKind(section.layout);
  const classes = layoutClasses(kind, cssMode);
  const imports = repeated.map((name) => `import ${pascalCase(name)} from "../components/${pascalCase(name)}.jsx";`);
  const bodyMarkup = renderSectionBody(section, cssMode, "react");

  return [
    ...imports,
    "",
    `export default function ${sectionName}() {`,
    "  return (",
    cssMode === "tailwind"
      ? `    <section className="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`
      : `    <section className="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`,
    cssMode === "tailwind" ? `      <header className="${classes.header}">` : `      <header className="${classes.header}">`,
    cssMode === "tailwind"
      ? `        <p className="m-0 text-sm text-slate-500">${section.role}</p>`
      : `        <p className="section-shell__role">${section.role}</p>`,
    `        <h2>${section.name}</h2>`,
    "      </header>",
    bodyMarkup,
    "    </section>",
    "  );",
    "}",
    "",
  ].join("\n");
}

// 生成 React 复用组件源码。
function reactComponentContent(component, cssMode) {
  const name = pascalCase(component.name);
  const isButton = /button/i.test(component.name);
  return [
    `export default function ${name}() {`,
    "  return (",
    isButton
      ? cssMode === "tailwind"
        ? `    <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white">`
        : `    <button className="button-shell">`
      : cssMode === "tailwind"
        ? `    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">`
        : `    <article className="component-shell">`,
    isButton ? `      ${component.name}` : `      <h3>${component.name}</h3>`,
    isButton ? null : `      <p>${component.reason || "Replace with high-fidelity visual content."}</p>`,
    isButton ? "    </button>" : "    </article>",
    "  );",
    "}",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// 生成 React 页面入口源码。
function reactPageContent(plan, cssMode, pageFileBase) {
  const pageComponentName = `${pascalCase(plan.pageName)}Page`;
  const pageVariant = detectPageVariant(plan);
  const imports = plan.sections.map(
    (section) => `import ${pascalCase(section.name)}Section from "../sections/${pascalCase(section.name)}Section.jsx";`
  );
  const styleImport = cssMode === "tailwind" ? [] : [`import "../styles/page.${styleExtension(cssMode)}";`];
  const sectionMarkup = plan.sections
    .map((section) => `        <${pascalCase(section.name)}Section />`)
    .join("\n");
  return [
    ...styleImport,
    ...imports,
    "",
    `export default function ${pageComponentName}() {`,
    "  return (",
    cssMode === "tailwind"
      ? `    <div className="min-h-screen bg-slate-50">`
      : `    <div className="page-shell${isWorkspaceVariant(pageVariant) ? " page-shell--workspace" : ""}">`,
    cssMode === "tailwind"
      ? `      <main className="mx-auto grid w-[min(1200px,calc(100%-48px))] gap-12 py-8">`
      : `      <main className="page-main${isWorkspaceVariant(pageVariant) ? " page-main--workspace" : ""}">`,
    sectionMarkup,
    "      </main>",
    "    </div>",
    "  );",
    "}",
    "",
  ].join("\n");
}

// 生成 Vue 区块组件源码。
function vueSectionContent(section, cssMode) {
  const repeated = section.repeatedComponents || [];
  const kind = detectLayoutKind(section.layout);
  const classes = layoutClasses(kind, cssMode);
  const imports = repeated.map((name) => `import ${pascalCase(name)} from "../components/${pascalCase(name)}.vue";`);
  const bodyMarkup = renderSectionBody(section, cssMode, "vue");
  return [
    "<template>",
    cssMode === "tailwind"
      ? `  <section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`
      : `  <section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`,
    cssMode === "tailwind" ? `    <header class="${classes.header}">` : `    <header class="${classes.header}">`,
    cssMode === "tailwind"
      ? `      <p class="m-0 text-sm text-slate-500">${section.role}</p>`
      : `      <p class="section-shell__role">${section.role}</p>`,
    `      <h2>${section.name}</h2>`,
    "    </header>",
    bodyMarkup,
    "  </section>",
    "</template>",
    "",
    "<script setup>",
    ...imports,
    "</script>",
    "",
  ].join("\n");
}

// 生成 Vue 复用组件源码。
function vueComponentContent(component, cssMode) {
  const isButton = /button/i.test(component.name);
  return [
    "<template>",
    isButton
      ? cssMode === "tailwind"
        ? `  <button class="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white">`
        : `  <button class="button-shell">`
      : cssMode === "tailwind"
        ? `  <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">`
        : `  <article class="component-shell">`,
    isButton ? `    ${component.name}` : `    <h3>${component.name}</h3>`,
    isButton ? null : `    <p>${component.reason || "Replace with high-fidelity visual content."}</p>`,
    isButton ? "  </button>" : "  </article>",
    "</template>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// 生成 Vue 页面入口源码。
function vuePageContent(plan, cssMode) {
  const imports = plan.sections.map(
    (section) => `import ${pascalCase(section.name)}Section from "./sections/${pascalCase(section.name)}Section.vue";`
  );
  const styleImport = cssMode === "tailwind" ? [] : [`import "./styles/page.${styleExtension(cssMode)}";`];
  const sectionMarkup = plan.sections
    .map((section) => `      <${pascalCase(section.name)}Section />`)
    .join("\n");
  return [
    "<template>",
    cssMode === "tailwind" ? `  <div class="min-h-screen bg-slate-50">` : `  <div class="page-shell">`,
    cssMode === "tailwind"
      ? `    <main class="mx-auto grid w-[min(1200px,calc(100%-48px))] gap-12 py-8">`
      : `    <main class="page-main">`,
    sectionMarkup,
    "    </main>",
    "  </div>",
    "</template>",
    "",
    "<script setup>",
    ...styleImport,
    ...imports,
    "</script>",
    "",
  ].join("\n");
}

// 生成 Svelte 区块组件源码。
function svelteSectionContent(section, cssMode) {
  const kind = detectLayoutKind(section.layout);
  const classes = layoutClasses(kind, cssMode);
  const imports = (section.repeatedComponents || []).map(
    (name) => `import ${pascalCase(name)} from "../components/${pascalCase(name)}.svelte";`
  );
  const bodyMarkup = renderSectionBody(section, cssMode, "svelte");
  return [
    "<script>",
    ...imports,
    "</script>",
    "",
    cssMode === "tailwind"
      ? `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`
      : `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`,
    cssMode === "tailwind" ? `  <header class="${classes.header}">` : `  <header class="${classes.header}">`,
    cssMode === "tailwind"
      ? `    <p class="m-0 text-sm text-slate-500">${section.role}</p>`
      : `    <p class="section-shell__role">${section.role}</p>`,
    `    <h2>${section.name}</h2>`,
    "  </header>",
    bodyMarkup,
    "</section>",
    "",
  ].join("\n");
}

// 生成 Svelte 复用组件源码。
function svelteComponentContent(component, cssMode) {
  const isButton = /button/i.test(component.name);
  return [
    isButton
      ? cssMode === "tailwind"
        ? `<button class="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white">`
        : `<button class="button-shell">`
      : cssMode === "tailwind"
        ? `<article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">`
        : `<article class="component-shell">`,
    isButton ? `  ${component.name}` : `  <h3>${component.name}</h3>`,
    isButton ? null : `  <p>${component.reason || "Replace with high-fidelity visual content."}</p>`,
    isButton ? "</button>" : "</article>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// 生成 Svelte 页面入口源码。
function sveltePageContent(plan, cssMode) {
  const imports = plan.sections.map(
    (section) => `import ${pascalCase(section.name)}Section from "./sections/${pascalCase(section.name)}Section.svelte";`
  );
  const styleImport = cssMode === "tailwind" ? [] : [`import "./styles/page.${styleExtension(cssMode)}";`];
  const sectionMarkup = plan.sections
    .map((section) => `    <${pascalCase(section.name)}Section />`)
    .join("\n");
  return [
    "<script>",
    ...styleImport,
    ...imports,
    "</script>",
    "",
    cssMode === "tailwind" ? `<div class="min-h-screen bg-slate-50">` : `<div class="page-shell">`,
    cssMode === "tailwind"
      ? `  <main class="mx-auto grid w-[min(1200px,calc(100%-48px))] gap-12 py-8">`
      : `  <main class="page-main">`,
    sectionMarkup,
    "  </main>",
    "</div>",
    "",
  ].join("\n");
}

// 生成 HTML 组件片段；部分 workspace 组件带有更具体的默认结构。
function htmlComponentContent(component, cssMode) {
  const lowerName = String(component.name || "").toLowerCase();
  if (cssMode !== "tailwind") {
    if (lowerName === "breadcrumbitem") {
      return [
        '<nav class="workspace-breadcrumbs" aria-label="Breadcrumb">',
        '  <span class="workspace-breadcrumbs__primary">《武极天尊》</span>',
        '  <span class="workspace-breadcrumbs__sep">/</span>',
        '  <span>新建场景</span>',
        "</nav>",
        "",
      ].join("\n");
    }
    if (lowerName === "previewemptystate") {
      return [
        '<div class="workspace-empty">',
        '  <div class="workspace-empty__illustration" aria-hidden="true"></div>',
        '  <p class="workspace-empty__title">当前暂无内容</p>',
        '  <p class="workspace-empty__hint">添加场景描述开始生图，或 <a href="#">自行上传图片</a></p>',
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "formfield") {
      return [
        '<div class="workspace-fields workspace-fields--two-column">',
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label"><span class="workspace-field__required">*</span>场景名称</div>',
        '    <div class="workspace-input">请输入场景名称</div>',
        "  </div>",
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label">时间设定</div>',
        '    <div class="workspace-input">例如：白天、未来、夜晚...</div>',
        "  </div>",
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label">天气状况</div>',
        '    <div class="workspace-input">例如：阴天、雨天、晴天...</div>',
        "  </div>",
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label">场景类别</div>',
        '    <div class="workspace-select">请选择</div>',
        "  </div>",
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "segmentedtoggle") {
      return [
        '<div class="workspace-field">',
        '  <div class="workspace-field__label"><span class="workspace-field__required">*</span>生产方式</div>',
        '  <div class="workspace-segmented">',
        '    <button class="workspace-segmented__item is-active" type="button">通过模型生成</button>',
        '    <button class="workspace-segmented__item" type="button">自行上传图片</button>',
        "  </div>",
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "modelselector") {
      return [
        '<div class="workspace-field workspace-field--full">',
        '  <div class="workspace-field__label"><span class="workspace-field__required">*</span>场景描述</div>',
        '  <div class="workspace-textarea">',
        '    <div class="workspace-upload-row">',
        '      <div class="workspace-upload-chip">+</div>',
        '      <p class="workspace-textarea__placeholder">请描述你想生成的图片</p>',
        "    </div>",
        '    <div class="workspace-textarea__spacer"></div>',
        '    <button class="workspace-chip workspace-chip--optimize" type="button"><span class="workspace-chip__spark">✦</span>智能优化</button>',
        "  </div>",
        "</div>",
        '<div class="workspace-toolbar">',
        '  <div class="workspace-select">即梦4.0 · Seedream 4.5</div>',
        '  <div class="workspace-mini-select">1张</div>',
        '  <div class="workspace-mini-select">16:9</div>',
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "generatebutton") {
      return [
        '<button class="workspace-primary-action" type="button">',
        "  生成场景",
        "</button>",
        "",
      ].join("\n");
    }
  }
  const isButton = /button/i.test(component.name);
  return [
    isButton
      ? cssMode === "tailwind"
        ? `<button class="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white">`
        : `<button class="button-shell">`
      : cssMode === "tailwind"
        ? `<article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">`
        : `<article class="component-shell">`,
    isButton ? `  ${component.name}` : `  <h3>${component.name}</h3>`,
    isButton ? null : `  <p>${component.reason || "Replace with high-fidelity visual content."}</p>`,
    isButton ? "</button>" : "</article>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// 生成 HTML 区块内容，并为 workspace 变体注入更具体的页面骨架。
function htmlSectionContent(section, cssMode, componentMap = {}, pageVariant = "default") {
  const kind = detectLayoutKind(section.layout);
  const variant = detectSectionVariant(section);
  const classes = layoutClasses(kind, cssMode);
  if (cssMode !== "tailwind" && variant === "workspace-topbar") {
    const breadcrumbPrimary = pageVariant === "workspace-dark-item" ? "《武极天尊》" : "《武极天尊》";
    const breadcrumbCurrent = pageVariant === "workspace-dark-item" ? "新建物品" : "新建场景";
    return [
      '<section class="workspace-topbar" aria-label="Top navigation">',
      '  <div class="workspace-topbar__left">',
      '    <button class="workspace-icon-chip workspace-icon-chip--back" type="button" aria-label="返回"></button>',
      '    <div class="workspace-brand-mark"></div>',
      '    <div class="workspace-topbar__cluster">',
      '      <div class="workspace-topbar__brand">魔方创作平台</div>',
      `      ${componentMap.BreadcrumbItem || `<nav class="workspace-breadcrumbs"><span class="workspace-breadcrumbs__primary">${breadcrumbPrimary}</span><span class="workspace-breadcrumbs__sep">/</span><span>${breadcrumbCurrent}</span></nav>`}`,
      "    </div>",
      "  </div>",
      "</section>",
      "",
    ].join("\n");
  }
  if (cssMode !== "tailwind" && variant === "workspace-scene") {
    if (pageVariant === "workspace-dark-item") {
      return [
        '<section class="workspace-shell workspace-shell--dark-item" aria-label="Item workspace">',
        '  <div class="workspace-preview workspace-preview--dark-item">',
        '    <div class="workspace-canvas workspace-canvas--dark-item">',
        '      <div class="workspace-empty workspace-empty--dark-item">',
        '        <div class="workspace-empty__illustration workspace-empty__illustration--dark-item" aria-hidden="true"></div>',
        '        <p class="workspace-empty__title">当前暂无内容</p>',
        '        <p class="workspace-empty__hint">添加物品描述开始生图，或 <a href="#">自行上传图片</a></p>',
        "      </div>",
        "    </div>",
        "  </div>",
        '  <aside class="workspace-sidebar workspace-sidebar--dark-item">',
        '    <div class="workspace-panel workspace-panel--dark-item">',
        '      <div class="workspace-panel__header workspace-panel__header--dark-item">',
        '        <h3 class="workspace-panel__title">物品信息</h3>',
        "      </div>",
        '      <div class="workspace-panel__block workspace-panel__block--dark-item">',
        '        <div class="workspace-fields workspace-fields--stacked">',
        '          <div class="workspace-field">',
        '            <div class="workspace-field__label"><span class="workspace-field__required">*</span>物品名称</div>',
        '            <div class="workspace-input">请输入物品名称</div>',
        "          </div>",
        '          <div class="workspace-field">',
        '            <div class="workspace-field__label">关联角色</div>',
        '            <div class="workspace-select">请选择</div>',
        "          </div>",
        "        </div>",
        "      </div>",
        '      <div class="workspace-panel__block workspace-panel__block--generation workspace-panel__block--dark-item">',
        '        <h3 class="workspace-panel__title">物品图生成</h3>',
        '        <div class="workspace-field">',
        '          <div class="workspace-field__label"><span class="workspace-field__required">*</span>生产方式</div>',
        '          <div class="workspace-segmented workspace-segmented--dark-item">',
        '            <button class="workspace-segmented__item is-active" type="button">通过模型生成</button>',
        '            <button class="workspace-segmented__item" type="button">自行上传图片</button>',
        "          </div>",
        "        </div>",
        '        <div class="workspace-field workspace-field--full">',
        '          <div class="workspace-field__label"><span class="workspace-field__required">*</span>物品描述</div>',
        '          <div class="workspace-textarea workspace-textarea--dark-item">',
        '            <div class="workspace-upload-row workspace-upload-row--dark-item">',
        '              <div class="workspace-upload-chip workspace-upload-chip--dark-item">+</div>',
        '              <p class="workspace-textarea__placeholder">请描述你想生成的图片</p>',
        "            </div>",
        '            <div class="workspace-textarea__spacer workspace-textarea__spacer--dark-item"></div>',
        '            <button class="workspace-chip workspace-chip--optimize workspace-chip--dark-item" type="button"><span class="workspace-chip__spark">✦</span>智能优化</button>',
        "          </div>",
        "        </div>",
        '        <div class="workspace-toolbar workspace-toolbar--dark-item">',
        '          <div class="workspace-select workspace-select--dream"><span class="workspace-select__brand-mark" aria-hidden="true"></span><span>即梦4.0 · Seedream 4.5</span></div>',
        '          <div class="workspace-stepper"><span class="workspace-stepper__value">1张</span><span class="workspace-stepper__controls"><span class="workspace-stepper__up"></span><span class="workspace-stepper__down"></span></span></div>',
        '          <div class="workspace-select workspace-select--aspect"><span class="workspace-select__aspect-icon" aria-hidden="true"></span><span>16:9</span></div>',
        "        </div>",
        "      </div>",
        '      <button class="workspace-primary-action workspace-primary-action--dark-item" type="button">',
        "        生成物品",
        "      </button>",
        "    </div>",
        "  </aside>",
        "</section>",
        "",
      ].join("\n");
    }
    return [
      '<section class="workspace-shell" aria-label="Scene workspace">',
      '  <div class="workspace-preview">',
      '    <div class="workspace-canvas">',
      indentBlock(componentMap.PreviewEmptyState || '<div class="workspace-empty"></div>', 6),
      "    </div>",
      "  </div>",
      '  <aside class="workspace-sidebar">',
      '    <div class="workspace-panel">',
      '      <div class="workspace-panel__header">',
      '        <h3 class="workspace-panel__title">场景信息</h3>',
      '        <div class="workspace-panel__ornament" aria-hidden="true"></div>',
      "      </div>",
      '      <div class="workspace-panel__block">',
      '        <div class="workspace-fields workspace-fields--info">',
      '          <div class="workspace-info-row">',
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label"><span class="workspace-field__required">*</span>场景名称</div>',
      '              <div class="workspace-input">请输入场景名称</div>',
      "            </div>",
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label">时间设定</div>',
      '              <div class="workspace-input">例如：白天、未来、夜晚...</div>',
      "            </div>",
      "          </div>",
      '          <div class="workspace-info-row">',
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label">天气状况</div>',
      '              <div class="workspace-input">例如：阴天、雨天、晴天...</div>',
      "            </div>",
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label">场景类别</div>',
      '              <div class="workspace-select">请选择</div>',
      "            </div>",
      "          </div>",
      "        </div>",
      "      </div>",
      '      <div class="workspace-panel__block workspace-panel__block--generation">',
      '        <h3 class="workspace-panel__title">场景图生成</h3>',
      indentBlock(componentMap.SegmentedToggle || "", 8),
      indentBlock(componentMap.ModelSelector || "", 8),
      "      </div>",
      indentBlock(componentMap.GenerateButton || "", 6),
      "    </div>",
      "  </aside>",
      "</section>",
      "",
    ].join("\n");
  }
  const bodyMarkup = renderSectionBody(section, cssMode, "html", componentMap);
  return [
    cssMode === "tailwind"
      ? `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`
      : `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}">`,
    cssMode === "tailwind" ? `  <header class="${classes.header}">` : `  <header class="${classes.header}">`,
    cssMode === "tailwind"
      ? `    <p class="m-0 text-sm text-slate-500">${section.role}</p>`
      : `    <p class="section-shell__role">${section.role}</p>`,
    `    <h2>${section.name}</h2>`,
    "  </header>",
    bodyMarkup,
    "</section>",
    "",
  ].join("\n");
}

// 生成最终的 HTML 页面文档。
function htmlPageContent(plan, cssMode, cssExt, componentMap = {}) {
  const pageVariant = detectPageVariant(plan);
  const sectionMarkup = plan.sections
    .map((section) => indentBlock(htmlSectionContent(section, cssMode, componentMap, pageVariant).trimEnd(), 6))
    .join("\n");
  const styleLinks =
    cssMode === "tailwind"
      ? []
      : [
          `  <link rel="stylesheet" href="./styles/tokens.${cssExt}" />`,
          `  <link rel="stylesheet" href="./styles/page.${cssExt}" />`,
        ];
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${plan.pageName}</title>`,
    ...styleLinks,
    "</head>",
    "<body>",
    cssMode === "tailwind"
      ? '  <div class="min-h-screen bg-slate-50">'
      : `  <div class="page-shell${isWorkspaceVariant(pageVariant) ? " page-shell--workspace" : ""}">`,
    cssMode === "tailwind"
      ? '    <main class="mx-auto grid w-[min(1200px,calc(100%-48px))] gap-12 py-8">'
      : `    <main class="page-main${isWorkspaceVariant(pageVariant) ? " page-main--workspace" : ""}">`,
    sectionMarkup,
    "    </main>",
    "  </div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// 输出一份人类可读的装配指南，帮助后续继续细化视觉实现。
function assemblyGuide(plan, stack, cssMode) {
  const lines = [];
  lines.push(`# Visual Assembly Guide: ${plan.pageName}`);
  lines.push("");
  lines.push(`- Stack: ${stack}`);
  lines.push(`- CSS Mode: ${cssMode}`);
  lines.push(`- Scope: ${plan.scope}`);
  lines.push("");
  lines.push("## Sections");
  lines.push("");
  for (const section of plan.sections) {
    lines.push(`- ${section.name}: ${section.role}`);
    lines.push(`  Layout: ${section.layout}`);
    lines.push(`  Generated layout kind: ${detectLayoutKind(section.layout)}`);
    lines.push(
      `  Repeated components: ${
        section.repeatedComponents.length > 0 ? section.repeatedComponents.join(", ") : "none yet"
      }`
    );
  }
  lines.push("");
  lines.push("## Components");
  lines.push("");
  if (plan.components.length === 0) {
    lines.push("- No repeated components were declared in the plan.");
  } else {
    for (const component of plan.components) {
      lines.push(`- ${component.name}: ${component.reason || "Visual component placeholder"}`);
    }
  }
  lines.push("");
  lines.push("## Tokens");
  lines.push("");
  for (const [key, value] of flattenTokens(plan.tokens)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Assembly Steps");
  lines.push("");
  (plan.assemblySteps || []).forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  return lines.join("\n");
}

// 把 React 页面、sections 和 components 落盘到目标目录。
function writeReactScaffold(plan, outDir, cssMode, created) {
  const pageName = `${pascalCase(plan.pageName)}Page`;
  const pagePath = path.join(outDir, "src", "pages", `${pageName}.jsx`);
  writeFile(pagePath, reactPageContent(plan, cssMode, pageName));
  created.push(pagePath);

  for (const section of plan.sections) {
    const filePath = path.join(outDir, "src", "sections", `${pascalCase(section.name)}Section.jsx`);
    writeFile(filePath, reactSectionContent(section, cssMode));
    created.push(filePath);
  }

  for (const component of plan.components) {
    const filePath = path.join(outDir, "src", "components", `${pascalCase(component.name)}.jsx`);
    writeFile(filePath, reactComponentContent(component, cssMode));
    created.push(filePath);
  }
}

// 把 Vue 页面、sections 和 components 落盘到目标目录。
function writeVueScaffold(plan, outDir, cssMode, created) {
  const pagePath = path.join(outDir, "src", "App.vue");
  writeFile(pagePath, vuePageContent(plan, cssMode));
  created.push(pagePath);

  for (const section of plan.sections) {
    const filePath = path.join(outDir, "src", "sections", `${pascalCase(section.name)}Section.vue`);
    writeFile(filePath, vueSectionContent(section, cssMode));
    created.push(filePath);
  }

  for (const component of plan.components) {
    const filePath = path.join(outDir, "src", "components", `${pascalCase(component.name)}.vue`);
    writeFile(filePath, vueComponentContent(component, cssMode));
    created.push(filePath);
  }
}

// 把 Svelte 页面、sections 和 components 落盘到目标目录。
function writeSvelteScaffold(plan, outDir, cssMode, created) {
  const pagePath = path.join(outDir, "src", "App.svelte");
  writeFile(pagePath, sveltePageContent(plan, cssMode));
  created.push(pagePath);

  for (const section of plan.sections) {
    const filePath = path.join(outDir, "src", "sections", `${pascalCase(section.name)}Section.svelte`);
    writeFile(filePath, svelteSectionContent(section, cssMode));
    created.push(filePath);
  }

  for (const component of plan.components) {
    const filePath = path.join(outDir, "src", "components", `${pascalCase(component.name)}.svelte`);
    writeFile(filePath, svelteComponentContent(component, cssMode));
    created.push(filePath);
  }
}

// 把 HTML 页面、sections 和 components 落盘到目标目录。
function writeHtmlScaffold(plan, outDir, cssMode, created) {
  const cssExt = styleExtension(cssMode);
  const componentMap = Object.fromEntries(
    plan.components.map((component) => [component.name, htmlComponentContent(component, cssMode).trimEnd()])
  );
  const pagePath = path.join(outDir, "index.html");
  writeFile(pagePath, htmlPageContent(plan, cssMode, cssExt, componentMap));
  created.push(pagePath);

  for (const section of plan.sections) {
    const filePath = path.join(outDir, "sections", `${kebabCase(section.name)}.html`);
    writeFile(filePath, htmlSectionContent(section, cssMode, componentMap));
    created.push(filePath);
  }

  for (const component of plan.components) {
    const filePath = path.join(outDir, "components", `${kebabCase(component.name)}.html`);
    writeFile(filePath, htmlComponentContent(component, cssMode));
    created.push(filePath);
  }
}

// 写入各栈通用的产物：计划 JSON、token JSON、装配文档和样式文件。
function writeSharedArtifacts(plan, outDir, stack, cssMode, created) {
  const planPath = path.join(outDir, "visual-plan.json");
  writeFile(planPath, JSON.stringify(plan, null, 2));
  created.push(planPath);

  const tokenJsonPath = path.join(outDir, "visual-tokens.json");
  writeFile(tokenJsonPath, JSON.stringify(plan.tokens, null, 2));
  created.push(tokenJsonPath);

  const guidePath = path.join(outDir, "VISUAL_ASSEMBLY.md");
  writeFile(guidePath, assemblyGuide(plan, stack, cssMode));
  created.push(guidePath);

  if (cssMode !== "tailwind") {
    const ext = styleExtension(cssMode);
    const baseDir = stack === "html" ? path.join(outDir, "styles") : path.join(outDir, "src", "styles");
    const tokenPath = path.join(baseDir, `tokens.${ext}`);
    const pagePath = path.join(baseDir, `page.${ext}`);
    writeFile(tokenPath, tokenCss(plan, cssMode));
    writeFile(pagePath, pageStyles(plan, cssMode));
    created.push(tokenPath, pagePath);
  }
}

// 主流程：读取视觉计划、标准化结构、写入共享产物，再按目标栈生成脚手架。
function main() {
  const args = parseArgs(process.argv);
  const stack = args.stack || "react";
  const cssMode = args.css || "css";
  const outDir = path.resolve(args.out || path.join(process.cwd(), "generated-visual-ui"));
  const raw = readInput(args).trim();

  if (!raw) {
    console.error("Provide --input or --file with a visual plan JSON.");
    process.exit(1);
  }

  const plan = normalizePlan(parsePlan(raw));
  const created = [];

  writeSharedArtifacts(plan, outDir, stack, cssMode, created);

  if (stack === "react") {
    writeReactScaffold(plan, outDir, cssMode, created);
  } else if (stack === "vue") {
    writeVueScaffold(plan, outDir, cssMode, created);
  } else if (stack === "svelte") {
    writeSvelteScaffold(plan, outDir, cssMode, created);
  } else if (stack === "html") {
    writeHtmlScaffold(plan, outDir, cssMode, created);
  } else {
    console.error(`Unsupported stack: ${stack}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        stack,
        cssMode,
        outDir,
        pageName: plan.pageName,
        created,
      },
      null,
      2
    )
  );
}

main();
