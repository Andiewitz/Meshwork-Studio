---
name: Meshwork Studio
description: A calm, theme-aware workspace for designing architecture diagrams.
colors:
  dashboard-light-ground: "#eef1f5"
  dashboard-light-surface: "#ffffff"
  dashboard-light-ink: "#212936"
  dashboard-light-primary: "#263b59"
  dashboard-dark-ground: "#09090b"
  dashboard-dark-surface: "#14151d"
  dashboard-dark-ink: "#f5f5f7"
  dashboard-dark-primary: "#ffffff"
  editor-light-canvas: "#ffffff"
  editor-dark-canvas: "#0a0a0a"
  editor-light-header-action: "#316ac5"
  diagram-edge: "#d9e7ff"
  diagram-compute: "#e5e8f3"
  diagram-data: "#dff2e5"
  diagram-async: "#ffebcd"
typography:
  body:
    fontFamily: '"DM Sans", system-ui, sans-serif'
  display:
    fontFamily: '"Geomini", "DM Sans", system-ui, sans-serif'
  label:
    fontFamily: '"Geist Mono", monospace'
rounded:
  sm: "3px"
  md: "6px"
  lg: "9px"
---

# Meshwork Studio design system

## Overview

Meshwork is a focused workspace for creating and sharing architecture diagrams. Product chrome should be calm and legible so the canvas and the user's work remain the focus. Both light and dark modes are supported; some existing components still need a theme and accessibility pass, so do not assume every surface is verified.

The current dashboard and editor implementations are the visual reference. The light dashboard has a soft mint, blue-green and sage atmosphere. The dark dashboard retains its existing gradient. The editor's light canvas is white, with subtle component shadows for contrast. Do not redesign the dashboard sidebar as part of unrelated work.

## Colors

Use semantic roles and the active theme. The light dashboard uses near-white surfaces, dark blue-gray text and a deep navy primary action; the dark dashboard uses dark surfaces, light text and a light primary action. Editor header actions may use blue in light mode. Mint and sage are atmospheric accents; diagram layer colors communicate diagram meaning.

The global `primary` token is orange-red and remains in older screens. It is not a reliable proxy for newer dashboard or workspace action colors. Use the surface-specific roles below where those designs apply rather than changing the global token across unrelated pages. Red, green and amber have feedback meanings; ensure icons, text, backgrounds and actions are legible in both themes.

| Area                                  | Current implementation                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Shared semantic colors and typography | `client/src/index.css`, exposed through `tailwind.config.ts`                         |
| Dashboard, project cards and previews | `client/src/components/layout/dashboard-theme.css` (`dashboard-*`)                   |
| Editor surfaces, dialogs and controls | `client/src/workspace-theme.css` (`workspace-*`, `ws-*`)                             |
| Settings surfaces                     | `client/src/pages/settings.css`                                                      |
| Diagram layers and shapes             | `client/src/components/canvas/nodes/nodePresentation.ts` and `node-layer-colors.css` |

These files describe the current implementation. The separate token sets are not fully unified; prefer the established role for the surface being changed and improve shared primitives deliberately.

## Typography

Use DM Sans for normal UI and body copy. Geomini is available for short display and page headings; Geist Mono is for technical metadata, identifiers and shortcuts. Use sentence case for product copy and reserve uppercase tracking for short labels. Supporting text must remain readable; existing 9–10px editor labels are audit candidates, not a size target.

## Layout

The dashboard presents projects through a spacious main area, with previews that vary with diagram content. The editor uses a central canvas with compact surrounding controls and panels. Keep existing sidebar composition intact unless the work specifically calls for changing it.

There is no blanket 1024px blocking gate. Layouts should adapt to available width, with scrollable overlays and reachable controls; absence of a gate does not mean every mobile editor flow has been validated. Check desktop and narrow viewports when changing a flow.

## Elevation & Depth

Dark mode separates surfaces primarily through tone and restrained borders. Light mode uses white and pale gray-blue surfaces with subtle shadows for floating controls, panels and canvas components. Avoid heavy neo-brutalist shadows. Preserve the existing dark gradient when adjusting light-mode styling.

## Shapes

Use softly rounded cards and controls consistent with neighboring components. Compact controls commonly use 6–9px radii; larger panels and dialogs can use more generous rounding, and pills suit compact actions and identity indicators. Prefer visual consistency and clear interaction states over forcing one radius on every component.

The canvas encodes diagram meaning through shape and color: clients use pill shapes; databases have a cylinder form; queues have a distinct queue form; external services use a dashed treatment; other components generally use rounded cards. Light mode uses muted layer colors and dark mode uses corresponding subdued dark surfaces. Preserve user-selected and vendor-specific styles.

## Components

- **Actions and inputs:** Reuse existing primitives where they match the target surface; otherwise extend them with a semantic, theme-aware variant. Provide clear hover, disabled and keyboard-focus states. The current global `Button` default does not necessarily match dashboard or editor primary actions.
- **Dialogs and popovers:** Use shared accessible dialog/popover behavior, with the owning surface's theme colors, readable contrast and scrolling at short viewport heights. Preserve actions and permissions.
- **Project previews:** Use simplified, recognizable architecture diagrams with layer colors and varied layouts. Keep the project's actual content and meaning intact.
- **Notifications:** Toasts use rounded surfaces, a status icon, title, optional description and action, plus a dismiss control. Choose status and action colors that work in both themes; do not rely on color alone.
- **Loading, empty and error states:** Prefer skeletons or contextual placeholders for page and content loading. Use concise status feedback for short actions and show a useful recovery action for errors. A skeleton does not replace all progress feedback.
- **Connections:** Sync calls use a solid arrow, asynchronous events a dashed arrow, and primary paths a highlighted arrow. Request and response are two separately editable arrows. Preserve other user-selected line types and styles.

## Do's and Don'ts

- Verify light and dark modes, text and non-text contrast, visible keyboard focus, reduced motion and responsive behavior on the changed surface.
- Use existing named colors and primitives before adding a local override. Preserve the light dashboard gradient, dark gradient and editor canvas treatment.
- Do not replace diagram semantic colors or a user's custom styles with application-chrome colors.
- Keep user-facing copy in terms of projects; internal API and storage names may still use `workspace`.
- Update this guide when the intended visual direction changes. Do not treat unfinished legacy styling as a new design decision.
