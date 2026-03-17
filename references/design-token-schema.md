# Design Token Schema

The current minimal engineering token schema is grouped instead of flat.

## Groups

- `color`
- `space`
- `radius`
- `shadow`
- `typography`
- `layout`

## Example Shape

```json
{
  "tokens": {
    "color": {
      "bg": "#F8FAFC",
      "surface": "#FFFFFF",
      "border": "#E2E8F0",
      "text": {
        "primary": "#0F172A",
        "secondary": "#475569",
        "muted": "#64748B"
      },
      "brand": {
        "primary": "#2563EB",
        "accent": "#7C3AED"
      }
    },
    "space": {
      "xs": "4px",
      "sm": "8px",
      "md": "16px",
      "lg": "24px",
      "xl": "32px",
      "section": "96px"
    },
    "radius": {
      "sm": "8px",
      "md": "16px",
      "lg": "24px",
      "pill": "999px"
    },
    "shadow": {
      "card": "0 12px 40px rgba(15, 23, 42, 0.06)",
      "popover": "0 20px 50px rgba(15, 23, 42, 0.12)"
    },
    "typography": {
      "hero": { "size": "56px", "lineHeight": "64px", "weight": 700 },
      "title": { "size": "32px", "lineHeight": "40px", "weight": 600 },
      "body": { "size": "16px", "lineHeight": "28px", "weight": 400 },
      "label": { "size": "14px", "lineHeight": "20px", "weight": 500 }
    },
    "layout": {
      "container": "1200px",
      "heroGap": "48px",
      "gridGap": "24px"
    }
  }
}
```

## Why This Shape

- `color` supports text tiers and brand roles
- `space` keeps spacing consistent across sections and components
- `radius` supports cards, controls, and pills
- `shadow` supports different elevation layers
- `typography` supports semantic text roles instead of one-off sizes
- `layout` controls container width and section-level spacing

## Consumption Rules

- planning scripts may output approximate values
- scaffold generation should merge missing fields with defaults
- generated styles should consume these tokens instead of hardcoding repeated values whenever possible
