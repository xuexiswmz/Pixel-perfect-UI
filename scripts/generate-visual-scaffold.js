#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArgs, readInput, ensureDir, writeFile, pascalCase, kebabCase } = require("../lib/utils");
const { pageStyles, renderAllPrecisionCss } = require("../lib/page-styles");

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
  if (matchesAny(joined, ["workspace", "preview", "configuration panel", "canvas", "sidebar"])) {
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
    preciseOverrides: plan.preciseOverrides || {},
    sections: sections.map((section) => ({
      name: section.name || "Section",
      role: section.role || "Section role",
      layout: section.layout || "custom layout",
      repeatedComponents: Array.isArray(section.repeatedComponents)
        ? Array.from(new Set(section.repeatedComponents))
        : [],
      styles: section.styles || null,
    })),
    components: dedupeByName(
      [...declaredComponents, ...inferredComponents].map((c) => ({
        ...c,
        styles: c.styles || null,
      }))
    ),
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
      ? `    <section className="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`
      : `    <section className="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`,
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
  const dataComp = kebabCase(component.name);
  const isButton = /button/i.test(component.name);
  return [
    `export default function ${name}() {`,
    "  return (",
    isButton
      ? cssMode === "tailwind"
        ? `    <button className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white" data-component="${dataComp}">`
        : `    <button className="button-shell" data-component="${dataComp}">`
      : cssMode === "tailwind"
        ? `    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-component="${dataComp}">`
        : `    <article className="component-shell" data-component="${dataComp}">`,
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
      ? `  <section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`
      : `  <section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`,
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
  const dataComp = kebabCase(component.name);
  const isButton = /button/i.test(component.name);
  return [
    "<template>",
    isButton
      ? cssMode === "tailwind"
        ? `  <button class="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white" data-component="${dataComp}">`
        : `  <button class="button-shell" data-component="${dataComp}">`
      : cssMode === "tailwind"
        ? `  <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-component="${dataComp}">`
        : `  <article class="component-shell" data-component="${dataComp}">`,
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
  const pageVariant = detectPageVariant(plan);
  const imports = plan.sections.map(
    (section) => `import ${pascalCase(section.name)}Section from "./sections/${pascalCase(section.name)}Section.vue";`
  );
  const styleImport = cssMode === "tailwind" ? [] : [`import "./styles/page.${styleExtension(cssMode)}";`];
  const sectionMarkup = plan.sections
    .map((section) => `      <${pascalCase(section.name)}Section />`)
    .join("\n");
  return [
    "<template>",
    cssMode === "tailwind" ? `  <div class="min-h-screen bg-slate-50">` : `  <div class="page-shell${isWorkspaceVariant(pageVariant) ? " page-shell--workspace" : ""}">`,
    cssMode === "tailwind"
      ? `    <main class="mx-auto grid w-[min(1200px,calc(100%-48px))] gap-12 py-8">`
      : `    <main class="page-main${isWorkspaceVariant(pageVariant) ? " page-main--workspace" : ""}">`,
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
      ? `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`
      : `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`,
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
  const dataComp = kebabCase(component.name);
  const isButton = /button/i.test(component.name);
  return [
    isButton
      ? cssMode === "tailwind"
        ? `<button class="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white" data-component="${dataComp}">`
        : `<button class="button-shell" data-component="${dataComp}">`
      : cssMode === "tailwind"
        ? `<article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-component="${dataComp}">`
        : `<article class="component-shell" data-component="${dataComp}">`,
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
  const pageVariant = detectPageVariant(plan);
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
    cssMode === "tailwind" ? `<div class="min-h-screen bg-slate-50">` : `<div class="page-shell${isWorkspaceVariant(pageVariant) ? " page-shell--workspace" : ""}">`,
    cssMode === "tailwind"
      ? `  <main class="mx-auto grid w-[min(1200px,calc(100%-48px))] gap-12 py-8">`
      : `  <main class="page-main${isWorkspaceVariant(pageVariant) ? " page-main--workspace" : ""}">`,
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
        '  <span class="workspace-breadcrumbs__primary">Project Name</span>',
        '  <span class="workspace-breadcrumbs__sep">/</span>',
        '  <span>New Item</span>',
        "</nav>",
        "",
      ].join("\n");
    }
    if (lowerName === "previewemptystate") {
      return [
        '<div class="workspace-empty">',
        '  <div class="workspace-empty__illustration" aria-hidden="true"></div>',
        '  <p class="workspace-empty__title">No content yet</p>',
        '  <p class="workspace-empty__hint">Add a description to generate, or <a href="#">upload an image</a></p>',
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "formfield") {
      return [
        '<div class="workspace-fields workspace-fields--two-column">',
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label"><span class="workspace-field__required">*</span>Name</div>',
        '    <div class="workspace-input">Enter name</div>',
        "  </div>",
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label">Setting</div>',
        '    <div class="workspace-input">e.g. Day, Future, Night...</div>',
        "  </div>",
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label">Condition</div>',
        '    <div class="workspace-input">e.g. Cloudy, Rainy, Sunny...</div>',
        "  </div>",
        '  <div class="workspace-field">',
        '    <div class="workspace-field__label">Category</div>',
        '    <div class="workspace-select">Select</div>',
        "  </div>",
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "segmentedtoggle") {
      return [
        '<div class="workspace-field">',
        '  <div class="workspace-field__label"><span class="workspace-field__required">*</span>Method</div>',
        '  <div class="workspace-segmented">',
        '    <button class="workspace-segmented__item is-active" type="button">Generate</button>',
        '    <button class="workspace-segmented__item" type="button">Upload</button>',
        "  </div>",
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "modelselector") {
      return [
        '<div class="workspace-field workspace-field--full">',
        '  <div class="workspace-field__label"><span class="workspace-field__required">*</span>Description</div>',
        '  <div class="workspace-textarea">',
        '    <div class="workspace-upload-row">',
        '      <div class="workspace-upload-chip">+</div>',
        '      <p class="workspace-textarea__placeholder">Describe what you want to generate</p>',
        "    </div>",
        '    <div class="workspace-textarea__spacer"></div>',
        '    <button class="workspace-chip workspace-chip--optimize" type="button"><span class="workspace-chip__spark">✦</span>Optimize</button>',
        "  </div>",
        "</div>",
        '<div class="workspace-toolbar">',
        '  <div class="workspace-select">Model v4 · Latest</div>',
        '  <div class="workspace-mini-select">1</div>',
        '  <div class="workspace-mini-select">16:9</div>',
        "</div>",
        "",
      ].join("\n");
    }
    if (lowerName === "generatebutton") {
      return [
        '<button class="workspace-primary-action" type="button">',
        "  Generate",
        "</button>",
        "",
      ].join("\n");
    }
  }
  const dataComp = kebabCase(component.name);
  const isButton = /button/i.test(component.name);
  return [
    isButton
      ? cssMode === "tailwind"
        ? `<button class="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white" data-component="${dataComp}">`
        : `<button class="button-shell" data-component="${dataComp}">`
      : cssMode === "tailwind"
        ? `<article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-component="${dataComp}">`
        : `<article class="component-shell" data-component="${dataComp}">`,
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
    const breadcrumbPrimary = "Project Name";
    const breadcrumbCurrent = "New Item";
    return [
      '<section class="workspace-topbar" aria-label="Top navigation">',
      '  <div class="workspace-topbar__left">',
      '    <button class="workspace-icon-chip workspace-icon-chip--back" type="button" aria-label="Back"></button>',
      '    <div class="workspace-brand-mark"></div>',
      '    <div class="workspace-topbar__cluster">',
      '      <div class="workspace-topbar__brand">Brand</div>',
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
        '<section class="workspace-shell workspace-shell--dark-item" aria-label="Workspace">',
        '  <div class="workspace-preview workspace-preview--dark-item">',
        '    <div class="workspace-canvas workspace-canvas--dark-item">',
        '      <div class="workspace-empty workspace-empty--dark-item">',
        '        <div class="workspace-empty__illustration workspace-empty__illustration--dark-item" aria-hidden="true"></div>',
        '        <p class="workspace-empty__title">No content yet</p>',
        '        <p class="workspace-empty__hint">Add a description to generate, or <a href="#">upload an image</a></p>',
        "      </div>",
        "    </div>",
        "  </div>",
        '  <aside class="workspace-sidebar workspace-sidebar--dark-item">',
        '    <div class="workspace-panel workspace-panel--dark-item">',
        '      <div class="workspace-panel__header workspace-panel__header--dark-item">',
        '        <h3 class="workspace-panel__title">Info</h3>',
        "      </div>",
        '      <div class="workspace-panel__block workspace-panel__block--dark-item">',
        '        <div class="workspace-fields workspace-fields--stacked">',
        '          <div class="workspace-field">',
        '            <div class="workspace-field__label"><span class="workspace-field__required">*</span>Name</div>',
        '            <div class="workspace-input">Enter name</div>',
        "          </div>",
        '          <div class="workspace-field">',
        '            <div class="workspace-field__label">Related Role</div>',
        '            <div class="workspace-select">Select</div>',
        "          </div>",
        "        </div>",
        "      </div>",
        '      <div class="workspace-panel__block workspace-panel__block--generation workspace-panel__block--dark-item">',
        '        <h3 class="workspace-panel__title">Generation</h3>',
        '        <div class="workspace-field">',
        '          <div class="workspace-field__label"><span class="workspace-field__required">*</span>Method</div>',
        '          <div class="workspace-segmented workspace-segmented--dark-item">',
        '            <button class="workspace-segmented__item is-active" type="button">Generate</button>',
        '            <button class="workspace-segmented__item" type="button">Upload</button>',
        "          </div>",
        "        </div>",
        '        <div class="workspace-field workspace-field--full">',
        '          <div class="workspace-field__label"><span class="workspace-field__required">*</span>Description</div>',
        '          <div class="workspace-textarea workspace-textarea--dark-item">',
        '            <div class="workspace-upload-row workspace-upload-row--dark-item">',
        '              <div class="workspace-upload-chip workspace-upload-chip--dark-item">+</div>',
        '              <p class="workspace-textarea__placeholder">Describe what you want to generate</p>',
        "            </div>",
        '            <div class="workspace-textarea__spacer workspace-textarea__spacer--dark-item"></div>',
        '            <button class="workspace-chip workspace-chip--optimize workspace-chip--dark-item" type="button"><span class="workspace-chip__spark">✦</span>Optimize</button>',
        "          </div>",
        "        </div>",
        '        <div class="workspace-toolbar workspace-toolbar--dark-item">',
        '          <div class="workspace-select workspace-select--dream"><span class="workspace-select__brand-mark" aria-hidden="true"></span><span>Model v4 · Latest</span></div>',
        '          <div class="workspace-stepper"><span class="workspace-stepper__value">1</span><span class="workspace-stepper__controls"><span class="workspace-stepper__up"></span><span class="workspace-stepper__down"></span></span></div>',
        '          <div class="workspace-select workspace-select--aspect"><span class="workspace-select__aspect-icon" aria-hidden="true"></span><span>16:9</span></div>',
        "        </div>",
        "      </div>",
        '      <button class="workspace-primary-action workspace-primary-action--dark-item" type="button">',
        "        Generate",
        "      </button>",
        "    </div>",
        "  </aside>",
        "</section>",
        "",
      ].join("\n");
    }
    return [
      '<section class="workspace-shell" aria-label="Workspace">',
      '  <div class="workspace-preview">',
      '    <div class="workspace-canvas">',
      indentBlock(componentMap.PreviewEmptyState || '<div class="workspace-empty"></div>', 6),
      "    </div>",
      "  </div>",
      '  <aside class="workspace-sidebar">',
      '    <div class="workspace-panel">',
      '      <div class="workspace-panel__header">',
      '        <h3 class="workspace-panel__title">Info</h3>',
      '        <div class="workspace-panel__ornament" aria-hidden="true"></div>',
      "      </div>",
      '      <div class="workspace-panel__block">',
      '        <div class="workspace-fields workspace-fields--info">',
      '          <div class="workspace-info-row">',
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label"><span class="workspace-field__required">*</span>Name</div>',
      '              <div class="workspace-input">Enter name</div>',
      "            </div>",
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label">Setting</div>',
      '              <div class="workspace-input">e.g. Day, Future, Night...</div>',
      "            </div>",
      "          </div>",
      '          <div class="workspace-info-row">',
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label">Condition</div>',
      '              <div class="workspace-input">e.g. Cloudy, Rainy, Sunny...</div>',
      "            </div>",
      '            <div class="workspace-field">',
      '              <div class="workspace-field__label">Category</div>',
      '              <div class="workspace-select">Select</div>',
      "            </div>",
      "          </div>",
      "        </div>",
      "      </div>",
      '      <div class="workspace-panel__block workspace-panel__block--generation">',
      '        <h3 class="workspace-panel__title">Generation</h3>',
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
      ? `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`
      : `<section class="${classes.root}" aria-label="${section.name}" data-layout="${layoutSlug(section.layout)}" data-layout-kind="${kind}" data-section="${kebabCase(section.name)}">`,
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
    const pageCss = pageStyles(plan, cssMode, detectPageVariant(plan))
      + renderAllPrecisionCss(plan);
    writeFile(tokenPath, tokenCss(plan, cssMode));
    writeFile(pagePath, pageCss);
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
