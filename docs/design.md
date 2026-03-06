# Design System — Bloomberg Terminal UI

## Design Philosophy

Blossom is styled after the **Bloomberg Terminal** — the canonical professional intelligence interface. The design must feel like the real thing: intimidating, sharp, information-dense. Every pixel earns its place.

### Core Principles

1. **Monospace-only** — JetBrains Mono everywhere, no UI fonts
2. **True black** — `#000000` background, not dark gray
3. **Orange authority** — `#FF6600` Bloomberg orange for all labels, active states, headers
4. **Maximum density** — 22px row height, no wasted whitespace
5. **No decorative elements** — no rounded corners, no shadows, no gradients
6. **Color carries meaning** — green = up/good, red = critical/down, amber = medium, cyan = info

---

## Color Palette

```css
--bb-black:     #000000   /* True background */
--bb-bg:        #040404   /* Slight lift */
--bb-bg2:       #0c0c0c   /* Panel backgrounds */
--bb-bg3:       #141414   /* Hover, headers */
--bb-border:    #1e1e1e   /* Row separators */
--bb-border2:   #2a2a2a   /* Section separators */

--bb-orange:    #ff6600   /* Bloomberg brand, active, labels */
--bb-orange2:   #cc5200   /* Dimmer orange for glows */
--bb-orange-bg: rgba(255,102,0,0.1)

--bb-white:     #e8e8e8   /* Primary data text */
--bb-gray:      #787878   /* Secondary / muted */
--bb-gray2:     #444444   /* Dimmer elements */
--bb-gray3:     #282828   /* Subtle fills */

--bb-up:        #00e676   /* Positive price change */
--bb-down:      #ff3333   /* Negative / CRITICAL */
--bb-cyan:      #00c8ff   /* Info / LOW threat / prediction low-risk */
--bb-yellow:    #f0c040   /* MEDIUM threat / amber warning */
```

---

## Typography

Single font: **JetBrains Mono** (Google Fonts)

```css
font-family: 'JetBrains Mono', 'Courier New', monospace;
-webkit-font-smoothing: none;  /* Intentional: CRT pixel feel */
```

| Usage | Size | Weight | Color |
|-------|------|--------|-------|
| Section labels | 9px | 700 | `--bb-orange` |
| Column headers | 9px | 700 | `--bb-gray` |
| Ticker symbols | 11px | 700 | `--bb-orange` |
| Data values | 11-12px | 400-600 | `--bb-white` |
| Secondary text | 9-10px | 400 | `--bb-gray` |
| Timestamps | 9px | 400 | `--bb-gray` |

---

## Layout

### Dimensions

```
--titlebar-h: 24px   /* Orange brand bar */
--tabbar-h:   26px   /* F-key tab row */
--row-h:      22px   /* Standard data row height */
```

### Structure

```
[24px] Titlebar — Bloomberg orange, full width
[26px] Tab bar  — F1–F4 tabs + live tickers
[∞px]  Content  — Full viewport, scrollable
```

The content area uses `position: absolute; inset: 0` so each tab pane truly fills 100% of the remaining space.

---

## Threat Level Color System

| Level | Text Style | Background | Border |
|-------|-----------|-----------|--------|
| `CRITICAL` | black on solid red | `#ff3333` | — |
| `HIGH` | white text | transparent | `#cc3300` bordered |
| `MEDIUM` | amber text | transparent | amber bordered |
| `LOW` | cyan text | transparent | cyan 50% bordered |
| `INFO` | gray text | transparent | gray bordered |

---

## Component Patterns

### Section Headers (sticky)
```css
.markets-section-header {
  padding: 3px 12px;
  font-size: 9px; font-weight: 700;
  color: var(--bb-orange);
  background: var(--bb-bg3);
  border-top/bottom: 1px solid var(--bb-border2);
  position: sticky; top: 0; z-index: 2;
}
```

### Data Rows
```css
.market-row {
  display: grid;
  grid-template-columns: 60px 1fr 110px 80px 80px;
  min-height: var(--row-h);  /* 22px */
  border-bottom: 1px solid var(--bb-border);
  padding: 2px 12px;
}
```
Rows hover to `--bb-bg3`, zero transition delay.

### Tab Bar
Active tab: white `background: var(--bb-black)`, orange label, orange F-key badge.  
Inactive tab: `background: var(--bb-bg2)`, gray text.  
Active indicator: 2px top stripe in `--bb-orange`.

---

## Anti-Slop Enforcement

Per the [Anti-Slop Design Skill](../.agent/skills/anti-slop-design/SKILL.md):

| Rule | Applied in Blossom |
|------|-------------------|
| Never emoji as icons | ✅ Lucide SVG icons everywhere |
| Distinctive font | ✅ JetBrains Mono (not Inter/Roboto) |
| No indigo/purple gradients | ✅ Orange + black palette |
| No over-boxed layouts | ✅ Rows live on canvas, no white cards |
| No border-heavy generic boxes | ✅ 1px dark borders only as row separators |
| Color + weight for hierarchy | ✅ Orange = authority, gray = secondary |
| Integrated over boxed | ✅ Elements on canvas directly |

---

## Responsive Behavior

At `max-width: 640px`:
- Tabs collapse to icon-only (label and shortcut hidden)
- `tab-inner` centers the icon
- Page scrolls normally (`overflow: auto`)
- Market col headers hidden; rows become 4-column
- Country risk reason column hidden

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
