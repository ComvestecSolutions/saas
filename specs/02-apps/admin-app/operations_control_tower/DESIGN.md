---
name: Operations Control Tower
colors:
  surface: "#10131a"
  surface-dim: "#10131a"
  surface-bright: "#363941"
  surface-container-lowest: "#0b0e15"
  surface-container-low: "#191b23"
  surface-container: "#1d2027"
  surface-container-high: "#272a31"
  surface-container-highest: "#32353c"
  on-surface: "#e1e2ec"
  on-surface-variant: "#c2c6d6"
  inverse-surface: "#e1e2ec"
  inverse-on-surface: "#2e3038"
  outline: "#8c909f"
  outline-variant: "#424754"
  surface-tint: "#adc6ff"
  primary: "#adc6ff"
  on-primary: "#002e6a"
  primary-container: "#4d8eff"
  on-primary-container: "#00285d"
  inverse-primary: "#005ac2"
  secondary: "#bcc7de"
  on-secondary: "#263143"
  secondary-container: "#3e495d"
  on-secondary-container: "#aeb9d0"
  tertiary: "#ffb786"
  on-tertiary: "#502400"
  tertiary-container: "#df7412"
  on-tertiary-container: "#461f00"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#d8e2ff"
  primary-fixed-dim: "#adc6ff"
  on-primary-fixed: "#001a42"
  on-primary-fixed-variant: "#004395"
  secondary-fixed: "#d8e3fb"
  secondary-fixed-dim: "#bcc7de"
  on-secondary-fixed: "#111c2d"
  on-secondary-fixed-variant: "#3c475a"
  tertiary-fixed: "#ffdcc6"
  tertiary-fixed-dim: "#ffb786"
  on-tertiary-fixed: "#311400"
  on-tertiary-fixed-variant: "#723600"
  background: "#10131a"
  on-background: "#e1e2ec"
  surface-variant: "#32353c"
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 24px
    letterSpacing: -0.01em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 16px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: "700"
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 16px
  gutter: 12px
  sidebar-width: 240px
  drawer-width: 480px
---

## Brand & Style

The design system is engineered for mission-critical oversight and high-stakes governance. It evokes a sense of "Industrial Precision"—drawing inspiration from aeronautic flight decks and modern IDEs. The aesthetic is strictly professional, prioritizing information density and rapid cognitive processing over decorative whitespace.

The visual style is a blend of **Corporate Modern** and **Technical Minimalism**. It utilizes a "Dark-Mode First" philosophy to reduce eye strain during prolonged monitoring sessions. Surface layers are used to establish a clear hierarchy of governance, ensuring that the operator feels in total control of the environment, actor, and data flow.

## Colors

This design system employs a strictly semantic color palette to facilitate instant status recognition. The background architecture uses **Deep Charcoal (#0F172A)** for the foundation and **Slate (#1E293B)** for functional surfaces.

- **Primary Action:** A crisp Blue (#3B82F6) reserved exclusively for intentional user interactions.
- **Status Signals:** Emerald for active/healthy states, Amber for pending/warning, and Crimson for blocked/critical errors.
- **System States:** Violet is introduced to represent "Drift"—a specific state where configuration has diverged from the source of truth.
- **Redaction:** A subdued gray pattern is used to mask sensitive PII/PHI data, indicating existence without revealing content.

## Typography

Typography is bifurcated into two functional roles: **Inter** handles all human-centric communication and interface labels, while **JetBrains Mono** is utilized for machine-centric data, including Resource IDs, JSON tokens, hashes, and system states.

To maintain high density, the base body size is set to **13px**. Leading is kept tight but legible to maximize the rows visible in data tables. All technical identifiers must be rendered in monospace to ensure character alignment and prevent misreading of similar characters (e.g., 0 and O).

## Layout & Spacing

The layout follows a **Fluid Grid** model with high-density spacing units based on a 4px scale. The primary workspace utilizes a **Split-Pane** architecture, allowing operators to keep a global list in view while drilling into details via right-aligned drawers or bottom-docked consoles.

- **Global Context Header:** Always persistent at the top, containing three distinct silos for Actor (Who), Tenant (Whose), and Environment (Where).
- **Table Density:** Row heights are compressed to 32px or 36px to maximize vertical data visibility.
- **Breakpoints:**
  - Mobile (< 768px): Drawers become full-screen overlays.
  - Desktop (> 1280px): Triple-pane layouts (Nav + List + Detail) are supported.

## Elevation & Depth

In this design system, depth is communicated through **Tonal Layering** and **Subtle Outlines** rather than heavy shadows.

1. **Level 0 (Base):** Deep Charcoal (#0F172A). Used for the main application background.
2. **Level 1 (Surface):** Slate (#1E293B). Used for cards, table headers, and sidebars.
3. **Level 2 (Overlay):** Slate-Light (#334155). Used for modals, tooltips, and floating drawers.

Borders are 1px solid and use a low-contrast opacity (10-15% white) to define boundaries without adding visual noise. High-risk modals use a 2px "Danger" top-border accent to signify gravity.

## Shapes

The shape language is "Soft-Industrial." A uniform **4px (0.25rem)** border radius is applied to buttons, input fields, and containers. This slight rounding prevents the UI from feeling aggressive while maintaining the precision of a grid-based system.

Status badges (Chips) use the same 4px radius; pill-shaped rounding is strictly forbidden to maintain the professional, structured aesthetic of the system.

## Components

### Data Tables & Status Badges

Tables are the primary vehicle for information. Columns must support "Sort" and "Filter" micro-interactions. Status badges utilize a subtle background tint of the semantic color with high-contrast text. For "Drifted" states, the badge includes a small "delta" icon.

### Split-Pane & Drawers

Detail drawers slide from the right, pushing the main content rather than overlaying it when space permits. Drawers feature a header with breadcrumbs and a "Close" button using the Escape key alias.

### Diff Viewers & Timeline Rails

Used for auditing configuration changes. Additions are highlighted in low-opacity Emerald, deletions in low-opacity Crimson. The timeline rail uses a vertical 2px line with "nodes" representing events (Actor, Action, Timestamp).

### High-Risk Action Modals

Any action with the `destructive` or `high-risk` flag must trigger a modal that requires:

1. Confirmation of the specific object name.
2. Selection of a "Reason for Action" from a governed dropdown.
3. A mandatory "Comment" field for audit logging.

### Redacted Fields

Sensitive data is obscured with a 45-degree diagonal stripe pattern (#475569). Clicking a "reveal" icon triggers an MFA challenge or an audit-logged "View" event.
