# Meshwork Studio Design System

This is the single product-design reference for Meshwork Studio. It defines
the visual language and the rules for implementing it. The executable tokens
remain in `client/src/index.css`; Tailwind exposes them through
`tailwind.config.ts`.

## Product character

Meshwork is a focused, dark-first desktop workspace for architecture work.
The interface should feel precise and calm: low-contrast surfaces establish
structure, orange identifies an important product action, teal identifies the
AI assistant, and infrastructure vendors retain their own identity only inside
the diagram.

Do not mix in a page-specific aesthetic (for example, a purple dashboard, a
blue primary button, or the retired neo-brutalist hard shadows). Decorative
colour is not a substitute for hierarchy.

## Source of truth and ownership

| Concern           | Source of truth                                        | Use it for                                |
| ----------------- | ------------------------------------------------------ | ----------------------------------------- |
| Primitive values  | `client/src/index.css`                                 | CSS custom properties and global behavior |
| Tailwind names    | `tailwind.config.ts`                                   | Application classes                       |
| Reusable controls | `client/src/components/ui/`                            | Buttons, inputs, cards, dialogs, menus    |
| Product layout    | `client/src/components/layout/` and feature components | Page and workspace composition            |
| Logo              | `client/src/components/MeshworkLogo.tsx`               | Meshwork branding only                    |

New reusable styling belongs in a token or a component primitive. Do not add a
second global stylesheet, a competing component-library theme, or a raw hex
value merely to style an ordinary product control.

## Foundations

### Color roles

Use roles rather than memorising values. Values may change; the role should
not.

| Role             | Token/classes                                                                 | Intended use                                               |
| ---------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| App background   | `background`                                                                  | The outermost canvas/page                                  |
| Surface ladder   | `surface-lowest`, `surface-low`, `surface`, `surface-high`, `surface-highest` | Increasing elevation; advance one step at a time           |
| Content surfaces | `card`, `popover`, `input`                                                    | Cards, overlays, form controls                             |
| Primary action   | `primary` / `primary-hover`                                                   | One clear next action in a region                          |
| AI context       | `mosh-*`                                                                      | Jenkos/Mosh state and actions only                         |
| Neutral action   | `secondary`, `muted`, `accent`                                                | Secondary controls and selection states                    |
| Feedback         | `destructive`, `success`, `warning`                                           | Errors, successful completion, and warnings—not decoration |
| Text             | `foreground`, `muted-foreground`, `subtle-foreground`                         | Primary, secondary, and quiet supporting copy              |
| Borders/focus    | `border`, `border-strong`, `ring`                                             | Structural separation and visible keyboard focus           |

Primary is the Meshwork orange-red. Purple, blue, and vendor colours are
reserved for recognized third-party services, diagram node identity, or data
visualisation. They must not replace `primary` in normal product chrome.

### Typography

- `font-sans` / `font-body` (`DM Sans`) is the default for UI and prose.
- `font-headline` / `font-display` (`Geomini`) is for short page and section
  headings only.
- `font-mono` / `font-label` (`Geist Mono`) is for shortcuts, IDs, technical
  metadata, and compact all-caps labels.

Use normal sentence case for product copy. Reserve all caps and increased
tracking for compact labels, not paragraphs. Headings are bold and tight;
body text should be legible before it is ornamental.

### Shape, depth, and motion

- Default control radius is 8px; compact controls may use 6px and small tags
  3px. Use pills only for small status/identity elements.
- Use the surface ladder, a subtle border, and a restrained shadow to show
  elevation. Frosted overlays are appropriate for transient UI such as menus,
  dialogs, and workspace controls.
- Transitions should communicate cause and effect. Standard interactions are
  150–200ms; page transitions may be about 180ms. Do not add perpetual motion
  unless it communicates live status.
- The canvas is an exception: node and provider colours represent the diagram's
  content, not the application theme.

## Component rules

Use the component in `client/src/components/ui/` before creating a local
equivalent.

| Need                                 | Standard                                                  |
| ------------------------------------ | --------------------------------------------------------- |
| Primary/secondary/destructive action | `Button` variants                                         |
| Grouped content                      | `Card` with `CardHeader`, `CardContent`, and `CardFooter` |
| Confirmation                         | `AlertDialog`                                             |
| Optional/compact actions             | `DropdownMenu`, `Popover`, or a ghost button              |
| Form labeling and validation         | `Label`, `Input`, `Textarea`, with text error feedback    |
| Loading/empty/error states           | Existing loading and error-boundary primitives            |

Avoid importing the retired `animated-button` primitive or recreating a
primary button using `bg-*`, `text-*`, and `hover:*` overrides. If a primitive
lacks a legitimate shared variant, add it to that primitive with a semantic
name and document the reason in the pull request.

## Accessibility baseline

- Every interactive control has a programmatic name and visible keyboard focus.
- Do not convey a state using color alone; include text, an icon, or a shape.
- Keep supporting text readable against the actual surface beneath it. Test
  focus, hover, disabled, error, and loading states in the browser.
- Honour reduced motion for new non-essential animation.
- Treat the 1024px workspace gate as a product constraint. Do not claim the
  workspace editor supports phones without changing that behavior and testing
  it.

## Theming status

The supported product interface is **dark-first**. The repository previously
advertised a light/neo-brutalist system, but its token values and much of the
application chrome were already dark-only. That duplicate, incomplete system
is retired rather than documented as supported behavior. A future light theme
requires a complete semantic-token palette and visual regression coverage
before it is exposed as a preference.

## Implementation checklist

Before merging a UI change:

1. Use a semantic token or existing primitive for ordinary UI.
2. Keep primary actions orange-red and AI-specific UI teal.
3. Check keyboard focus, disabled/loading/error states, and contrast.
4. Check the page alongside the dashboard and workspace so the surface ladder
   does not jump unexpectedly.
5. Update this document and `docs/features/THEMING.md` only when the design
   contract—not just an implementation detail—changes.

## Migration rule

Existing hard-coded legacy values are migrated when the containing component is
otherwise changed. Do not perform broad cosmetic search-and-replace work that
changes semantic vendor/node colours. Replace application-chrome values first,
then add or use a token when a repeated, non-semantic value remains.
