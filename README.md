# Pixel-perfect-UI

一个面向截图还原和现有页面视觉修正的前端 Skill。它会测量参考图、生成或修改代码、确定性截图、生成像素差异图，并根据差异继续修正，而不是只返回验证失败。

支持 HTML、React、Vue、Svelte，以及 CSS、Tailwind CSS、Less 和 SCSS。

## 效果对比

以下示例使用同一张 Lucide 页面截图作为参考，分别由 **GLM 5.2** 和 **ChatGPT 5.6** 使用 Pixel-perfect-UI 完成还原。

差异图中，红色区域表示实现图与原图之间仍存在的像素差异。

### 1. 原图

![Lucide 原始页面](docs/images/lucide-reference.png)

### 2. GLM 5.2 实现图

![GLM 5.2 还原结果](docs/images/lucide-glm-5.2.png)

### 3. GLM 5.2 Diff 图

![GLM 5.2 像素差异](docs/images/lucide-glm-5.2-diff.png)

### 4. ChatGPT 5.6 实现图

![ChatGPT 5.6 还原结果](docs/images/lucide-chatgpt-5.6.png)

### 5. ChatGPT 5.6 Diff 图

![ChatGPT 5.6 像素差异](docs/images/lucide-chatgpt-5.6-diff.png)

在这组样例中，GLM 5.2 完成了页面主体结构，但在首屏内容、文字、导航和组件位置上仍有明显偏差。ChatGPT 5.6 的页面布局、区块边界、排版和主要组件更接近原图，剩余差异主要集中在字体渲染、图标和局部像素细节。

> 示例仅用于展示 UI 还原效果。Lucide 名称、页面内容及相关素材归原项目所有。

## 核心能力

- 从完整截图或局部截图生成可运行的前端代码。
- 在现有项目中定位并修改对应页面、组件和样式。
- 测量 viewport、DPR、区块边界、排版、颜色和视觉规则。
- 固定字体、图片和动画状态，生成确定性浏览器截图。
- 输出 Diff 图和结构化验证结果，并按差异继续修正。
- 截图尺寸或测量信息不完整时自动恢复执行，不把阻塞报告当成最终结果。

## 安装

需要本机已安装 Node.js 和 npm。

```bash
git clone https://github.com/xuexiswmz/Pixel-perfect-UI.git
cd Pixel-perfect-UI
```

安装到当前项目的 Codex：

```bash
node scripts/install-skill.js --ai codex --target /path/to/your-project --install-deps
```

安装到 Cursor：

```bash
node scripts/install-skill.js --ai cursor --target /path/to/your-project --install-deps
```

也可以一次安装到所有已支持的 AI 工具目录：

```bash
node scripts/install-skill.js --ai all --target /path/to/your-project --install-deps
```

Codex 安装位置为 `.codex/skills/pixel-perfect-ui/`，Cursor 安装位置为 `.cursor/skills/pixel-perfect-ui/`。

## 使用

在对话中附上参考图，并明确调用 Skill：

```text
使用 $pixel-perfect-ui，高保真还原这张截图。
在当前项目中实现可运行代码，保持原有技术栈；完成后按原图尺寸截图、生成 Diff，并根据差异继续修正。
```

修改现有页面时可以这样写：

```text
使用 $pixel-perfect-ui，根据参考图修正当前页面。
请定位真正拥有该区域的组件，只修改相关代码，并在每轮修改后重新截图和比较。
```

如果已知目标信息，建议同时提供：

- 页面路由或宿主组件
- 参考图对应的 viewport 和 DPR
- 目标技术栈与样式体系
- 必须复用的字体、图标和图片资源

## 工作方式

1. 分析参考图和现有项目，锁定 viewport、DPR 与目标文件。
2. 测量主要区块、文字换行、间距、边框、图片和组件形态。
3. 生成新页面或对现有页面执行最小范围修改。
4. 浏览器截图并生成 Diff，根据误差继续迭代，最终交付代码和验证结果。

详细执行规范参见 [SKILL.md](SKILL.md)。

## 验证

```bash
npm install
npm run verify:all
```

如需同时验证浏览器截图能力：

```bash
npm run verify:all:browser
```

## 主要目录

```text
pixel-perfect-ui/
├── SKILL.md              # Skill 主工作流
├── scripts/              # 测量、生成、截图、Diff 和安装工具
├── references/           # 工作流与数据契约
├── assets/               # 模板和测试资源
├── agents/openai.yaml    # Codex 展示与默认提示词
└── docs/images/          # README 效果对比图
```
