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

function detectFidelityMode(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value || {});
  return /pixel[- ]?perfect|像素级|逐像素|精确还原|exact[- ]?fidelity/i.test(text)
    ? "pixel-perfect"
    : "high-fidelity";
}

function validatePixelPerfectSpec(spec, sections) {
  const errors = [];
  const referenceRaster = spec.referenceRaster || spec.measurements?.referenceRaster;
  const cssViewport = spec.cssViewport || spec.measurements?.cssViewport;
  const devicePixelRatio = spec.devicePixelRatio || spec.measurements?.devicePixelRatio;
  if (!referenceRaster?.width || !referenceRaster?.height) {
    errors.push("Missing exact reference raster width and height.");
  }
  if (!cssViewport?.width || !cssViewport?.height) {
    errors.push("Missing exact CSS viewport width and height.");
  }
  if (!devicePixelRatio || devicePixelRatio <= 0) {
    errors.push("Missing a positive device pixel ratio.");
  }
  if (referenceRaster?.width && cssViewport?.width && devicePixelRatio) {
    const expectedWidth = cssViewport.width * devicePixelRatio;
    const expectedHeight = cssViewport.height * devicePixelRatio;
    if (referenceRaster.width !== Math.round(expectedWidth) || referenceRaster.height !== Math.round(expectedHeight)) {
      errors.push("Reference raster must equal CSS viewport multiplied by device pixel ratio.");
    }
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push("Missing visually inspected semantic sections.");
  }
  const regions = spec.regions || spec.keyRegions || spec.measurements?.regions || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    errors.push("Missing named key-element regions for region-level verification.");
  }
  const capture = spec.captureEnvironment;
  if (!capture) {
    errors.push("Missing browser, DPR, font, and animation capture environment.");
  } else {
    if (!capture.browser) errors.push("Capture environment is missing the browser or rendering engine.");
    if (!Number.isFinite(capture.zoom)) errors.push("Capture environment is missing browser zoom.");
    if (capture.fontsReady !== true) errors.push("Capture environment must require fontsReady: true.");
    if (capture.animationsFrozen !== true) errors.push("Capture environment must require animationsFrozen: true.");
  }
  for (const section of sections || []) {
    if (!section.box && !section.region && !section.styles?.box) {
      errors.push(`Section ${section.name || "unnamed"} is missing an exact bounding box.`);
    }
  }
  for (const region of regions || []) {
    const role = String(region.role || region.kind || "").toLowerCase();
    const box = region.box || region.region;
    if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) {
      errors.push(`Region ${region.name || "unnamed"} is missing a valid x/y/width/height box.`);
      continue;
    }
    const renderable = Boolean(region.visibleText !== undefined || region.assetSource || region.componentName);
    if (renderable && !region.parentSection) {
      errors.push(`Renderable region ${region.name || "unnamed"} is missing parentSection.`);
    }
    if (region.parentSection && !sections.some((section) => section.name === region.parentSection)) {
      errors.push(`Region ${region.name || "unnamed"} references unknown parentSection ${region.parentSection}.`);
    }
    if (/heading|title/.test(role)) {
      const typography = region.typography || region.styles || {};
      if (region.expectedLineCount === undefined && region.lineCount === undefined) {
        errors.push(`Heading region ${region.name || "unnamed"} is missing an expected line count.`);
      }
      if (!typography.fontFamily || !typography.fontSize || !typography.fontWeight || !typography.lineHeight) {
        errors.push(`Heading region ${region.name || "unnamed"} is missing exact font family, size, weight, or line height.`);
      }
      if (!typography.fontSource) {
        errors.push(`Heading region ${region.name || "unnamed"} is missing a font source or system-font declaration.`);
      }
    }
    if (/logo|icon|illustration|image/.test(role) && !region.assetSource) {
      errors.push(`Asset region ${region.name || "unnamed"} is missing assetSource.`);
    }
  }
  for (const component of spec.components || []) {
    if ((component.box || component.styles?.box) && !component.relativeBox && !component.parentSection) {
      errors.push(`Component ${component.name || "unnamed"} has an absolute raster box but no parentSection.`);
    }
    if (component.parentSection && !sections.some((section) => section.name === component.parentSection)) {
      errors.push(`Component ${component.name || "unnamed"} references unknown parentSection ${component.parentSection}.`);
    }
  }
  return errors;
}

function recoverPixelPerfectPlan(spec) {
  const plan = JSON.parse(JSON.stringify(spec || {}));
  const recoveryActions = [];
  const referenceRaster = plan.referenceRaster || plan.measurements?.referenceRaster ||
    (plan.measurements?.imageMetadata?.width && plan.measurements?.imageMetadata?.height
      ? { width: plan.measurements.imageMetadata.width, height: plan.measurements.imageMetadata.height }
      : null);
  if (!referenceRaster?.width || !referenceRaster?.height) {
    return {
      recoverable: false,
      plan,
      errors: ["Reference raster is unavailable. Run auto-sample-screenshot.js on the supplied screenshot first."],
    };
  }
  plan.referenceRaster = referenceRaster;

  const captureScaleMissing = !plan.devicePixelRatio || !plan.cssViewport?.width || !plan.cssViewport?.height;
  const captureScaleInvalid = !captureScaleMissing && (
    referenceRaster.width !== Math.round(plan.cssViewport.width * plan.devicePixelRatio) ||
    referenceRaster.height !== Math.round(plan.cssViewport.height * plan.devicePixelRatio)
  );
  if (captureScaleMissing || captureScaleInvalid) {
    plan.devicePixelRatio = 1;
    plan.cssViewport = { width: referenceRaster.width, height: referenceRaster.height };
    recoveryActions.push({
      type: "normalize-capture-baseline",
      message: captureScaleInvalid
        ? "The supplied viewport/DPR cannot reproduce the reference raster; reset to a DPR 1 baseline and continue."
        : "Original DPR was unavailable; use a DPR 1 baseline whose CSS viewport equals the reference raster, then iterate from the captured diff.",
      cssViewport: plan.cssViewport,
      devicePixelRatio: 1,
    });
  }

  plan.captureEnvironment = {
    browser: plan.captureEnvironment?.browser || "Chromium",
    zoom: Number.isFinite(plan.captureEnvironment?.zoom) ? plan.captureEnvironment.zoom : 1,
    fontsReady: true,
    animationsFrozen: true,
    ...(plan.captureEnvironment || {}),
  };

  if (!Array.isArray(plan.sections) || plan.sections.length === 0) {
    plan.sections = [{
      name: "Page",
      role: "Recovered full-page baseline",
      layout: "measured-canvas",
      positioning: "absolute",
      box: { x: 0, y: 0, width: referenceRaster.width, height: referenceRaster.height },
      repeatedComponents: [],
    }];
    recoveryActions.push({
      type: "create-baseline-section",
      message: "No semantic sections were available; create a full-page measured section so code generation can continue.",
    });
  }

  const regions = Array.isArray(plan.regions)
    ? plan.regions
    : Array.isArray(plan.measurements?.regions)
      ? plan.measurements.regions
      : [];
  if (regions.length === 0) {
    plan.intermediateOnly = true;
    plan.regions = plan.sections
      .filter((section) => section.box || section.styles?.box)
      .map((section) => ({
        name: `${section.name} verification region`,
        role: "region",
        box: section.box || section.styles.box,
        parentSection: section.name,
      }));
    recoveryActions.push({
      type: "create-verification-regions",
      message: "No named regions were available; seed section-level verification regions and refine them after the first diff.",
    });
  } else {
    plan.regions = regions;
    plan.intermediateOnly = !regions.some((region) =>
      region.visibleText !== undefined || region.assetSource || region.componentName
    );
  }

  const scaleY = plan.cssViewport.height / referenceRaster.height;
  for (const region of plan.regions) {
    const box = region.box || region.region;
    if (!box) continue;
    if (!region.parentSection && (region.visibleText !== undefined || region.assetSource || region.componentName)) {
      const containing = plan.sections
        .filter((section) => {
          const sectionBox = section.box || section.styles?.box;
          return sectionBox && box.x >= sectionBox.x && box.y >= sectionBox.y &&
            box.x + box.width <= sectionBox.x + sectionBox.width &&
            box.y + box.height <= sectionBox.y + sectionBox.height;
        })
        .sort((a, b) => {
          const aBox = a.box || a.styles.box;
          const bBox = b.box || b.styles.box;
          return aBox.width * aBox.height - bBox.width * bBox.height;
        })[0];
      region.parentSection = containing?.name || plan.sections[0]?.name;
      recoveryActions.push({
        type: "infer-parent-section",
        region: region.name,
        parentSection: region.parentSection,
      });
    }
    if (/heading|title|text|label/i.test(region.role || region.kind || "") && region.visibleText !== undefined) {
      const lineCount = region.expectedLineCount || region.lineCount || 1;
      const estimatedFontSize = Math.max(8, Math.round((box.height * scaleY / lineCount) * 0.72));
      region.expectedLineCount = lineCount;
      region.typography = {
        fontFamily: "Arial, sans-serif",
        fontSource: "estimated-system-fallback",
        fontSize: `${estimatedFontSize}px`,
        fontWeight: 400,
        lineHeight: `${Math.max(estimatedFontSize, Math.round(box.height * scaleY / lineCount))}px`,
        ...(region.typography || {}),
      };
      if (region.typography.fontSource === "estimated-system-fallback") {
        recoveryActions.push({
          type: "estimate-typography",
          region: region.name,
          message: "Use estimated typography for the first render, then correct it from named-region bounds, ink coverage, and line-band differences.",
        });
      }
    }
  }

  plan.coordinateSpace = plan.coordinateSpace || "reference-raster-px";
  plan.readiness = "ready-with-estimates";
  plan.recoveryActions = [...(plan.recoveryActions || []), ...recoveryActions];
  return { recoverable: true, plan, recoveryActions };
}

// 当输入本身是 JSON 规格时，补齐默认值并规范结构。
function normalizeJsonSpec(spec) {
  const scope = spec.scope || "full-page";
  const pageName = spec.pageName || "Screenshot Reconstruction";
  const fidelityMode = spec.fidelityMode || detectFidelityMode(spec);
  const sections = Array.isArray(spec.sections)
    ? spec.sections.map((section) => ({
        ...section,
        positioning: section.positioning || ((spec.fidelityMode || detectFidelityMode(spec)) === "pixel-perfect" && (section.box || section.styles?.box) ? "absolute" : section.positioning),
        repeatedComponents: Array.isArray(section.repeatedComponents)
          ? Array.from(new Set(section.repeatedComponents))
          : [],
      }))
    : [];
  const regionSpecs = spec.regions || spec.keyRegions || spec.measurements?.regions || [];
  const regionComponents = fidelityMode === "pixel-perfect"
    ? regionSpecs
        .filter((region) => region.visibleText !== undefined || region.assetSource || region.componentName)
        .map((region) => {
          const typography = region.typography || {};
          const { fontSource, ...typographyStyles } = typography;
          return {
            name: region.componentName || region.name,
            kind: region.kind || region.role || "region",
            parentSection: region.parentSection,
            box: region.box || region.region,
            positioning: "absolute",
            visibleText: region.visibleText || "",
            assetSource: region.assetSource || null,
            alt: region.alt || region.accessibleName || region.name,
            fontSource: fontSource || null,
            styles: {
              ...typographyStyles,
              ...(region.styles || {}),
              ...(String(region.visibleText || "").includes("\n") && !region.styles?.whiteSpace
                ? { whiteSpace: "pre-line" }
                : {}),
            },
          };
        })
    : [];
  for (const component of regionComponents) {
    const parent = sections.find((section) => section.name === component.parentSection);
    if (parent) {
      parent.repeatedComponents = Array.from(new Set([...(parent.repeatedComponents || []), component.name]));
    }
  }
  const declaredComponents = Array.isArray(spec.components) ? spec.components : [];
  const inferredComponents = fidelityMode === "pixel-perfect" ? [] : inferComponents(JSON.stringify(spec), sections);
  const components = dedupeByName([...declaredComponents, ...regionComponents, ...inferredComponents]);
  const validationErrors = fidelityMode === "pixel-perfect"
    ? validatePixelPerfectSpec(spec, sections)
    : [];
  return {
    scope,
    pageName,
    fidelityMode,
    intermediateOnly: Boolean(spec.intermediateOnly),
    readiness: validationErrors.length === 0 ? (spec.readiness || "ready") : "blocked-by-measurements",
    validationErrors,
    referenceRaster: spec.referenceRaster || spec.measurements?.referenceRaster || null,
    cssViewport: spec.cssViewport || spec.measurements?.cssViewport || null,
    devicePixelRatio: spec.devicePixelRatio || spec.measurements?.devicePixelRatio || null,
    coordinateSpace: spec.coordinateSpace || "reference-raster-px",
    measurements: spec.measurements || null,
    captureEnvironment: spec.captureEnvironment || null,
    regions: regionSpecs,
    shell: spec.shell || (fidelityMode === "pixel-perfect" ? {} : inferShell(JSON.stringify(spec), scope, sections)),
    preciseOverrides: spec.preciseOverrides || {},
    sections,
    components,
    tokens: spec.tokens || (fidelityMode === "pixel-perfect" ? {} : inferTokens(JSON.stringify(spec))),
    assemblySteps: buildAssemblyPlan(sections, components),
  };
}

// 当输入是自然语言描述时，直接从文本构造重建计划。
function buildPlanFromText(text) {
  const scope = detectScope(text);
  const pageName = guessPageName(text);
  const fidelityMode = detectFidelityMode(text);
  if (fidelityMode === "pixel-perfect") {
    return {
      scope,
      pageName,
      fidelityMode,
      readiness: "blocked-by-measurements",
      validationErrors: [
        "Pixel-perfect planning requires an exact viewport.",
        "Pixel-perfect planning requires visually inspected section and key-element bounding boxes.",
        "Pixel-perfect planning requires exact typography and capture-environment measurements.",
      ],
      shell: {},
      sections: [],
      components: [],
      tokens: {},
      assemblySteps: [
        "Measure the screenshot before generating structure or visual tokens.",
        "Do not substitute heuristic defaults for missing pixel-perfect measurements.",
      ],
    };
  }
  const sections = inferSectionsFromText(text);
  const components = inferComponents(text, sections);
  const tokens = inferTokens(text);
  const shell = inferShell(text, scope, sections);

  return {
    scope,
    pageName,
    fidelityMode,
    readiness: "ready",
    validationErrors: [],
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
  lines.push(`- **Fidelity:** ${plan.fidelityMode}`);
  lines.push(`- **Readiness:** ${plan.readiness}`);
  lines.push(`- **Header:** ${plan.shell.hasHeader === undefined ? "Unmeasured" : plan.shell.hasHeader ? "Yes" : "No"}`);
  lines.push(`- **Footer:** ${plan.shell.hasFooter === undefined ? "Unmeasured" : plan.shell.hasFooter ? "Yes" : "No"}`);
  lines.push(`- **Max Width:** ${plan.shell.maxWidth || "Unmeasured"}`);
  lines.push(`- **Background:** ${plan.shell.background || "Unmeasured"}`);
  lines.push("");
  if (plan.validationErrors && plan.validationErrors.length > 0) {
    lines.push("## Missing Measurements");
    lines.push("");
    plan.validationErrors.forEach((error) => lines.push(`- ${error}`));
    lines.push("");
  }
  lines.push("## Sections");
  lines.push("");
  if (plan.sections.length === 0) lines.push("- No semantic sections measured yet.");
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
  const tokenLines = formatTokenList(plan.tokens);
  if (tokenLines.length === 0) lines.push("- No exact tokens measured yet.");
  tokenLines.forEach((line) => lines.push(line));
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

if (require.main === module) {
  main();
}

module.exports = { buildPlanFromText, normalizeJsonSpec, recoverPixelPerfectPlan };
