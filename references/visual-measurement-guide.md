# Visual Measurement Guide

When analyzing a screenshot or mockup for pixel-perfect code generation, extract these precise values and include them in the visual plan JSON as `preciseOverrides`, per-section `styles`, and per-component `styles`.

## Page Shell

Measure and record in `preciseOverrides.pageShell`:

- `backgroundColor` — the exact page background color as hex (e.g. `"#F5F5F5"`, `"#FAFBFC"`)
- `maxWidth` — the content area max-width (e.g. `"780px"`, `"1200px"`)

Example:
```json
{
  "preciseOverrides": {
    "pageShell": {
      "backgroundColor": "#FAFBFC"
    }
  }
}
```

## Sections

For each section, add a `styles` object with directly observed CSS values:

```json
{
  "sections": [
    {
      "name": "Hero",
      "role": "Primary introduction and CTA",
      "layout": "two-column",
      "repeatedComponents": ["PrimaryButton"],
      "styles": {
        "padding": "80px 0",
        "backgroundColor": "#FFFFFF",
        "gap": "32px"
      }
    }
  ]
}
```

Key properties to observe per section:
- `padding` — inner spacing (e.g. `"48px 0"`, `"80px 0"`)
- `backgroundColor` — section background (e.g. `"#FFFFFF"`, `"#F0F4F8"`)
- `gap` — vertical spacing between section children (e.g. `"24px"`, `"32px"`)
- `maxWidth` — container width if different from page default

## Components

For each reusable component, add a `styles` object:

```json
{
  "components": [
    {
      "name": "PrimaryButton",
      "reason": "CTA button",
      "styles": {
        "backgroundColor": "#1A73E8",
        "color": "#FFFFFF",
        "borderRadius": "4px",
        "padding": "10px 24px",
        "fontSize": "14px",
        "fontWeight": "600"
      }
    }
  ]
}
```

Key properties to observe per component:
- `backgroundColor` — fill color as hex
- `color` — text color as hex
- `borderRadius` — corner rounding (e.g. `"4px"`, `"8px"`, `"999px"`)
- `border` — border style (e.g. `"1px solid #E2E8F0"`)
- `padding` — inner spacing
- `fontSize` — text size
- `fontWeight` — text weight (`400`, `500`, `600`, `700`)
- `boxShadow` — shadow (e.g. `"0 2px 8px rgba(0,0,0,0.08)"`)

## Pre-fill tips

1. **Colors**: Always extract exact hex values, never approximate. Use an eyedropper tool if available.
2. **Spacing**: Measure gaps, paddings, margins in pixels. Note any asymmetry.
3. **Borders**: Record border width, style, and color.
4. **Shadows**: Record horizontal offset, vertical offset, blur radius, spread, and color.
5. **Typography**: Record exact font sizes, line-heights, font-weights, and font-families.

## Example complete plan with precision

```json
{
  "scope": "full-page",
  "pageName": "SaaS Dashboard",
  "preciseOverrides": {
    "pageShell": {
      "backgroundColor": "#F7F8FA",
      "maxWidth": "1280px"
    },
    "sections": {
      "Header": {
        "padding": "16px 32px",
        "backgroundColor": "#FFFFFF",
        "border": "1px solid #E5E7EB"
      },
      "StatsRow": {
        "gap": "16px",
        "padding": "24px 0"
      }
    },
    "components": {
      "StatCard": {
        "backgroundColor": "#FFFFFF",
        "borderRadius": "12px",
        "padding": "20px",
        "boxShadow": "0 1px 3px rgba(0,0,0,0.06)"
      },
      "PrimaryButton": {
        "backgroundColor": "#6366F1",
        "color": "#FFFFFF",
        "borderRadius": "8px",
        "padding": "8px 16px",
        "fontSize": "14px",
        "fontWeight": "500"
      }
    }
  },
  "sections": [
    {
      "name": "Header",
      "role": "Top navigation bar",
      "layout": "horizontal shell",
      "styles": {
        "padding": "16px 32px",
        "backgroundColor": "#FFFFFF"
      }
    },
    {
      "name": "StatsRow",
      "role": "KPI cards row",
      "layout": "card-grid",
      "repeatedComponents": ["StatCard"],
      "styles": {
        "gap": "16px",
        "padding": "24px 0"
      }
    }
  ],
  "components": [
    {
      "name": "StatCard",
      "reason": "Repeated metric display card",
      "styles": {
        "backgroundColor": "#FFFFFF",
        "borderRadius": "12px",
        "padding": "20px",
        "boxShadow": "0 1px 3px rgba(0,0,0,0.06)"
      }
    },
    {
      "name": "PrimaryButton",
      "reason": "Primary CTA",
      "styles": {
        "backgroundColor": "#6366F1",
        "color": "#FFFFFF",
        "borderRadius": "8px",
        "padding": "8px 16px",
        "fontSize": "14px",
        "fontWeight": "500"
      }
    }
  ],
  "tokens": {
    "color": {
      "bg": "#F7F8FA",
      "surface": "#FFFFFF",
      "border": "#E5E7EB",
      "text": {
        "primary": "#111827",
        "secondary": "#6B7280",
        "muted": "#9CA3AF"
      },
      "brand": {
        "primary": "#6366F1",
        "accent": "#8B5CF6"
      }
    }
  }
}
```
