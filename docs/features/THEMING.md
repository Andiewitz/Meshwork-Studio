# Theming & Design System

> How Meshwork Studio's dark/light modes work, and the neo-brutalist design language that runs through every component.

## Table of Contents

1. [Theme System](#theme-system)
2. [Neo-Brutalist Design Language](#neo-brutalist-design-language)
3. [CSS Variables](#css-variables)
4. [Dark Mode Design Decisions](#dark-mode-design-decisions)
5. [Brand Identity](#brand-identity)
6. [Key Files](#key-files)

---

## Theme System

### `useTheme` Hook

**File:** `client/src/hooks/use-theme.tsx`

The theme hook exposes three values:

```typescript
const { theme, setTheme, resolvedTheme } = useTheme();

// theme: "dark" | "light" | "system"   — the user's preference
// resolvedTheme: "dark" | "light"       — the actual applied theme
// setTheme(theme): void                 — update and persist preference
```

`resolvedTheme` differs from `theme` when `theme === "system"` — it resolves to whatever the OS preference is at that moment.

### Persistence

The user's theme preference is stored in `localStorage` under the key `meshwork-theme`. On page load, the stored value is read before the first render, so there's no "flash of wrong theme."

```typescript
const THEME_STORAGE_KEY = "meshwork-theme";

// Read on init
const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
return stored || "system"; // Default: follow OS

// Written on change
localStorage.setItem(THEME_STORAGE_KEY, newTheme);
```

### How Themes Are Applied

The `ThemeProvider` applies the resolved theme by toggling a class on `document.documentElement`:

```typescript
const root = document.documentElement;
root.classList.remove("dark", "light");
root.classList.add(resolved); // "dark" or "light"
root.style.colorScheme = resolved; // Tells browser scrollbars, inputs, etc.
```

Tailwind's `darkMode: "class"` config picks up the `.dark` class and applies dark variants throughout the app.

### System Preference Tracking

When `theme === "system"`, the provider listens for OS preference changes in real-time:

```typescript
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", handleChange);
```

If the user switches their OS from light to dark mode while the app is open, the theme updates immediately without any user action.

### Usage in Components

```typescript
import { useTheme } from "@/hooks/use-theme";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
```

---

## Sharp Glassmorphism Design Language

Meshwork Studio uses a **Sharp Glassmorphism** aesthetic: this blends structural clarity with modern overlays. It evolved from a pure neo-brutalist origin, maintaining sharp corners and high contrast, but introduces frosted glass effects for depth and focus.

### Core Principles

1. **Hard edges** — `border-radius: 0` everywhere (`--radius: 0rem`)
2. **Glass Overlays** — Use of `backdrop-filter: blur()` and semi-transparent backgrounds for modals, drawers, and headers (e.g., Mosh AI Drawer, node tooltips).
3. **High contrast** — Deep charcoal and warm off-white, with brand red for accents
4. **Uppercase typography** — Labels and headings in uppercase with wide letter-spacing

### Utility Classes

These classes are defined in `client/src/index.css` under `@layer components`:

#### `.neo-border`

```css
/* 2px solid border in foreground color */
border: 2px solid #1a1a1a; /* light mode */
border: 2px solid #cececb; /* dark mode — warm off-white, not pure white */
```

#### `.neo-shadow`

```css
/* Hard offset shadow — like a physical lift */
box-shadow: 8px 8px 0px 0px rgba(26, 26, 26, 1); /* light mode */
box-shadow: 6px 6px 0px 0px rgba(255, 61, 0, 0.7); /* dark mode — brand red */
transition:
  transform 0.3s ease,
  box-shadow 0.3s ease;

/* On hover: element lifts, shadow grows */
transform: translate(-4px, -4px);
box-shadow: 12px 12px 0px 0px...;
```

#### `.neo-shadow-lg`

```css
/* Larger shadow for cards and modals */
box-shadow: 12px 12px 0px 0px...;
```

#### `.neo-card`

```css
/* Combines border + shadow + background */
@apply neo-border neo-shadow bg-card p-4 rounded-none;
```

#### `.accent-btn`

```css
/* Primary action button — orange-red with bold border */
background: #ff3d00;
border: 2px solid #1a1a1a;
font-weight: bold;
text-transform: uppercase;
letter-spacing: wider;
box-shadow: 4px 4px 0px 0px rgba(26, 26, 26, 1);

/* On hover: button presses down */
transform: translate(2px, 2px);
box-shadow: 2px 2px 0px 0px...;
```

#### `.meshwork-bg-text`

A giant watermark "MESHWORK STUDIO" behind all dashboard content. Nearly invisible (3% opacity in light mode, 4% brand-red tint in dark mode). Creates depth without distraction.

---

## CSS Variables

Full variable set defined in `client/src/index.css`:

### Light Mode (Default)

| Variable       | Value     | Usage                                   |
| -------------- | --------- | --------------------------------------- |
| `--background` | `#F0F0F0` | Page background                         |
| `--foreground` | `#1A1A1A` | Text, borders, shadows                  |
| `--card`       | `#FFFFFF` | Card/panel backgrounds                  |
| `--primary`    | `#FF3D00` | Accent color, buttons                   |
| `--border`     | `#1A1A1A` | All borders                             |
| `--radius`     | `0rem`    | Zero border radius — no rounded corners |

### Dark Mode

| Variable       | Value     | Usage                              |
| -------------- | --------- | ---------------------------------- |
| `--background` | `#121212` | Deep charcoal — not pure black     |
| `--foreground` | `#EBEBEA` | Warm off-white — easier on eyes    |
| `--card`       | `#1A1A1A` | Panel backgrounds                  |
| `--primary`    | `#FF3D00` | **Same as light** — brand retained |
| `--border`     | `#CECECB` | Warm off-white borders             |

---

## Dark Mode Design Decisions

### Why Not Just Invert Colors?

Simple dark mode patterns that just flip black↔white cause problems:

- **Pure white borders** on a dark background glow harshly (fluorescent)
- **White box-shadows** look unnatural and cheap
- Swapping the primary accent from brand red to purple loses brand identity

### What We Do Instead

**1. Keep the brand orange-red as primary.**
`#FF3D00` works beautifully against dark backgrounds — no change needed.

**2. Warm off-white borders instead of pure white.**
`#CECECB` (30° hue, 10% saturation, 80% lightness) reads as clearly white but without the harsh fluorescent glow.

**3. Brand-red accent shadows in dark mode.**
Instead of `rgba(255, 255, 255, 1)` white shadows, dark mode uses `rgba(255, 61, 0, 0.7)` — the brand red at 70% opacity. This ties the depth effect to the brand color and avoids the "neon on black" look.

**4. Deep charcoal background, not pure black.**
`#121212` (7% lightness) is easier on the eyes than `#000000` and prevents the contrast from being jarring.

---

## Brand Identity

### Logo / Favicon

The app icon is a custom SVG mesh network icon — a triangle of three nodes connected by lines. This directly represents the "Meshwork" concept.

Design rules:

- **Zero border-radius** on the outer container (hard square, neo-brutalist)
- **Black background** `#1A1A1A`
- **Orange-red border** `#FF3D00` — 2.5px, inset on all sides
- **White lines** connecting the three nodes (crisp, square linecaps)
- **Square nodes**: top-left in `#FF3D00`, top-right and bottom in white

The icon appears in:

- Browser tab (favicon: `client/public/favicon.svg`)
- Sidebar logo (collapsed + expanded)
- Login page header
- Register page header

### Typography

| Font            | Usage                                         |
| --------------- | --------------------------------------------- |
| `DM Sans`       | Body text, labels, UI copy (variable weight)  |
| `Space Grotesk` | Display/headings — geometric, slightly quirky |
| `Inter`         | Secondary labels                              |

### Colors

| Name       | Hex       | Usage                                     |
| ---------- | --------- | ----------------------------------------- |
| Brand Red  | `#FF3D00` | Primary buttons, accents, active states   |
| Charcoal   | `#1A1A1A` | Foreground, borders, shadows (light mode) |
| Off-White  | `#F0F0F0` | Background (light mode)                   |
| Warm White | `#EBEBEA` | Foreground text (dark mode)               |

---

## Key Files

| File                                               | Purpose                                                     |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `client/src/hooks/use-theme.tsx`                   | `useTheme` hook + `ThemeProvider`                           |
| `client/src/index.css`                             | CSS variables, neo-brutalist utilities, dark mode overrides |
| `client/public/favicon.svg`                        | Brand icon SVG                                              |
| `client/src/components/layout/DashboardLayout.tsx` | Sidebar logo usage                                          |
| `tailwind.config.ts`                               | Tailwind dark mode config (`darkMode: "class"`)             |
