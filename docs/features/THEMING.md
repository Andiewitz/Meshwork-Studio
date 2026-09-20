# Theming implementation

The canonical Meshwork Studio design system is [the root `DESIGN.md`](../../DESIGN.md).
This page records only the implementation boundary for contributors.

## Current support

Meshwork Studio ships one intentional, dark-first product interface. The former
light/system preference exposed an incomplete alternate palette while many page
surfaces remained hard-coded dark. It has been removed instead of implying a
supported light mode.

## Implementation files

| File                                     | Responsibility                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `client/src/index.css`                   | CSS custom properties, global typography, shared utilities, and canvas-specific styling |
| `tailwind.config.ts`                     | Semantic Tailwind names backed by the CSS properties                                    |
| `client/src/components/ui/`              | Reusable control variants                                                               |
| `client/src/components/MeshworkLogo.tsx` | Product logomark                                                                        |

Use semantic Tailwind names such as `bg-primary`, `bg-surface-high`,
`text-muted-foreground`, and `border-border` for application chrome. Preserve
vendor colours only where they identify a vendor or a diagram node. See
[`DESIGN.md`](../../DESIGN.md) for the hierarchy, component rules,
accessibility baseline, and migration policy.

## Adding a future theme

Do not add a selector or a `dark:` override in isolation. A supported theme
needs a complete semantic-token palette, primitives that consume those tokens,
browser coverage of key pages and overlays, and an update to `DESIGN.md`.
