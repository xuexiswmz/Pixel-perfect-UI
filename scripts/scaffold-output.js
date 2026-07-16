#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseArgs, pascalCase, kebabCase, ensureDir, writeFile } = require("../lib/utils");

// 用 __KEY__ 占位符把模板渲染成最终文件内容。
function render(template, replacements) {
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`__${key}__`, value);
  }
  return output;
}

// 从 assets/templates 目录读取对应模板。
function loadTemplate(relativePath) {
  const templatePath = path.join(__dirname, "..", "assets", "templates", relativePath);
  return fs.readFileSync(templatePath, "utf8");
}

// 主流程：按目标 stack 和 cssMode 选择模板，生成最小可用脚手架。
function main() {
  const args = parseArgs(process.argv);
  const stack = args.stack || "html";
  const cssMode = args.css || "css";
  const rawName = args.name || "feature-section";
  const title = args.title || "Feature Section";
  const outDir = path.resolve(args.out || path.join(process.cwd(), "generated-ui"));

  const componentName = pascalCase(rawName);
  const fileBase = kebabCase(rawName);
  const rootClass = fileBase;
  const id = fileBase;
  const styleExt = cssMode === "scss" ? "scss" : cssMode === "less" ? "less" : "css";

  const replacements = {
    COMPONENT_NAME: componentName,
    TITLE: title,
    ROOT_CLASS: rootClass,
    ID: id,
    STYLE_FILE: `${fileBase}.${styleExt}`,
    STYLE_LANG: cssMode === "tailwind" ? "css" : styleExt,
  };

  const useTsx = Boolean(args.tsx);
  const reactExt = useTsx ? "tsx" : "jsx";

  if (stack === "html") {
    const htmlTemplate = cssMode === "tailwind" ? "html/module.tailwind.html" : "html/module.html";
    const htmlFile = path.join(outDir, `${fileBase}.html`);
    writeFile(htmlFile, render(loadTemplate(htmlTemplate), replacements));
    created.push(htmlFile);

    if (cssMode !== "tailwind") {
      const styleFile = path.join(outDir, `${fileBase}.${styleExt}`);
      writeFile(styleFile, render(loadTemplate(`styles/module.${styleExt}`), replacements));
      created.push(styleFile);
    }
  } else if (stack === "react") {
    const jsxTemplate =
      cssMode === "tailwind" ? `react/Component.tailwind.${reactExt}` : `react/Component.${reactExt}`;
    const jsxFile = path.join(outDir, `${componentName}.${reactExt}`);
    writeFile(jsxFile, render(loadTemplate(jsxTemplate), replacements));
    created.push(jsxFile);

    if (cssMode !== "tailwind") {
      const styleFile = path.join(outDir, `${fileBase}.${styleExt}`);
      writeFile(styleFile, render(loadTemplate(`styles/module.${styleExt}`), replacements));
      created.push(styleFile);
    }
  } else if (stack === "vue") {
    const vueTemplate = cssMode === "tailwind" ? "vue/Component.tailwind.vue" : "vue/Component.vue";
    const vueFile = path.join(outDir, `${componentName}.vue`);
    writeFile(vueFile, render(loadTemplate(vueTemplate), replacements));
    created.push(vueFile);
  } else if (stack === "svelte") {
    const svelteTemplate =
      cssMode === "tailwind" ? "svelte/Component.tailwind.svelte" : "svelte/Component.svelte";
    const svelteFile = path.join(outDir, `${componentName}.svelte`);
    writeFile(svelteFile, render(loadTemplate(svelteTemplate), replacements));
    created.push(svelteFile);
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
        created,
      },
      null,
      2
    )
  );
}

main();
