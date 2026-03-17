# IDE Installation

This skill is designed to work across multiple local AI coding environments.

## Supported Targets

- Claude Code
- Codex
- Cursor
- Windsurf
- Continue
- OpenCode
- Gemini CLI
- Roo Code
- Qoder
- Kiro
- GitHub Copilot chat-style skill folders
- Droid / Factory
- Antigravity / Agent-style folders

## Installer

Use the bundled installer:

```bash
node scripts/install-skill.js --ai codex
node scripts/install-skill.js --ai cursor
node scripts/install-skill.js --ai claude
node scripts/install-skill.js --ai all
```

Optional dependency install for AST precision:

```bash
node scripts/install-skill.js --ai codex --install-deps
```

## What the Installer Does

1. copies `agents/`, `assets/`, `references/`, `scripts/`, and `package.json`
2. writes a platform-specific `SKILL.md`
3. strips frontmatter for platforms that usually prefer plain markdown
4. optionally runs `npm install --omit=dev` in the installed skill directory

## Runtime Behavior

- With `typescript` installed, React and TSX files use AST-based location.
- Without `typescript`, the skill falls back to structure-tree parsing for markup-like content.

This fallback keeps the skill usable in lightweight environments while still allowing higher precision in richer IDE setups.
