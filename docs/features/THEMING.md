# Theming implementation

The product design reference is [the root `DESIGN.md`](../../DESIGN.md). Meshwork exposes both light and dark modes. Their key implementation sources are `client/src/index.css` for shared semantic colors, `client/src/components/layout/dashboard-theme.css` for dashboard roles, `client/src/workspace-theme.css` for editor roles, and `client/src/pages/settings.css` for settings. Theme selection is managed by `client/src/components/ThemeProvider.tsx`.

These overlapping role sets reflect an ongoing migration, not a guarantee that all components are consistent or accessible. For a change, follow the owning surface's established colors and verify the actual output in both themes, including portaled dialogs and feedback states. Preserve the mint/sage light dashboard atmosphere, the existing dark gradient, and the white light-mode canvas. See `DESIGN.md` for component and diagram conventions.
