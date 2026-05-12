---
name: Architect dark-mode email system
colors:
  surface: "#141218"
  surface-dim: "#141218"
  surface-bright: "#3b383e"
  surface-container-lowest: "#0f0d13"
  surface-container-low: "#1d1b20"
  surface-container: "#211f24"
  surface-container-high: "#2b292f"
  surface-container-highest: "#36343a"
  on-surface: "#e6e0e9"
  on-surface-variant: "#cbc4d2"
  inverse-surface: "#e6e0e9"
  inverse-on-surface: "#322f35"
  outline: "#948e9c"
  outline-variant: "#494551"
  surface-tint: "#cfbcff"
  primary: "#cfbcff"
  on-primary: "#381e72"
  primary-container: "#6750a4"
  on-primary-container: "#e0d2ff"
  inverse-primary: "#6750a4"
  secondary: "#cdc0e9"
  on-secondary: "#342b4b"
  secondary-container: "#4d4465"
  on-secondary-container: "#bfb2da"
  tertiary: "#e7c365"
  on-tertiary: "#3e2e00"
  tertiary-container: "#c9a74d"
  on-tertiary-container: "#503d00"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#e9ddff"
  primary-fixed-dim: "#cfbcff"
  on-primary-fixed: "#22005d"
  on-primary-fixed-variant: "#4f378a"
  secondary-fixed: "#e9ddff"
  secondary-fixed-dim: "#cdc0e9"
  on-secondary-fixed: "#1f1635"
  on-secondary-fixed-variant: "#4b4263"
  tertiary-fixed: "#ffdf93"
  tertiary-fixed-dim: "#e7c365"
  on-tertiary-fixed: "#241a00"
  on-tertiary-fixed-variant: "#594400"
  background: "#141218"
  on-background: "#e6e0e9"
  surface-variant: "#36343a"
typography:
  h1:
    fontFamily: Metropolis
    fontSize: 28px
    fontWeight: "700"
    lineHeight: 36px
    letterSpacing: -0.02em
  h2:
    fontFamily: Metropolis
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 28px
  eyebrow:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "700"
    lineHeight: 16px
    letterSpacing: 0.1em
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 20px
  meta-code:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container_max_width: 600px
  stack_xl: 48px
  stack_lg: 32px
  stack_md: 24px
  stack_sm: 16px
  stack_xs: 8px
  inline_gutter: 20px
---

## Brand & Style

This design system is built on a foundation of **Architectural Precision**. It leverages a sophisticated dark-mode palette to reduce cognitive load while maintaining an authoritative presence. The brand personality is serious and institutional yet technologically advanced, evoking the feeling of a high-end command center or a professional blueprint.

The visual style blends **Minimalism** with **Tonal Layering**. It avoids unnecessary ornamentation, relying instead on structural grid alignment, disciplined typography, and meaningful color accents to guide the recipient's eye through complex data and operational workflows. Each of the three surfaces—Public, Product, and Admin—utilizes the same structural grammar but shifts its tonal density to reflect the user's current context.

## Colors

The color system is strictly dark-mode, utilizing a range of "near-black" neutrals to create depth without the harshness of pure black.

1.  **Public Web (Editorial Enterprise):** Uses a near-black canvas (`#0A0A0A`) to make typography pop. Accents of **Verdigris** (`#2D6A6A`) and **Copper** (`#B87333`) provide a sophisticated, editorial feel reminiscent of architectural blueprints.
2.  **Product App (Precision Workspace):** Employs **Slate and Graphite** tones. The primary workspace uses `#1A1A1B` with slightly elevated panels to create a clear operational hierarchy.
3.  **Admin App (Operations Control Tower):** Utilizes **Midnight Steel**. The desaturated palette ensures that functional status indicators and technical data remain the primary focus.

## Typography

The typographic hierarchy is designed for high-density information environments.

- **Headlines:** Use **Metropolis** for a geometric, authoritative feel. Large headers are slightly tracked in to feel tight and engineered.
- **Body Text:** Uses **Inter** for its exceptional legibility at small sizes and high x-height, essential for dark-mode rendering where light text can "glow" on dark backgrounds.
- **Technical Labels:** Uses **JetBrains Mono** for IDs, timestamps, and system values in the Admin and Product surfaces, providing a clear visual distinction between narrative content and technical data.

## Layout & Spacing

This design system uses a **Fixed Grid** approach for email clients, centered at 600px.

- **Structural Grammar:** Every email follows a strict vertical stack: Branded Header → Eyebrow Context → Primary Panel → Secondary Metadata → Primary CTA → Calm Footer.
- **Public Surface:** Uses generous whitespace (`stack_xl`) to emphasize an editorial feel.
- **Product Surface:** Uses standard operational spacing (`stack_lg`) for balance.
- **Admin Surface:** Increases density (`stack_md` and `stack_sm`) to allow for complex audit logs and multi-row data tables within the viewport.

## Elevation & Depth

In a dark-mode environment, depth is communicated through **Tonal Layering** rather than traditional shadows, which can often appear muddy in email clients.

- **Base Canvas:** The deepest layer (`#121212`).
- **Primary Panels:** Elevated by one tonal step (e.g., `#1A1A1B`). Panels use a subtle 1px border (`#2A2A2B`) to define edges against the canvas.
- **Active Elements:** Buttons and interactive chips sit at the highest perceived elevation through color saturation or high-contrast borders.
- **Admin Specifics:** Uses "inset" styling for code blocks and ID labels to suggest they are part of the system infrastructure.

## Shapes

The shape language is **Soft (0.25rem)**, emphasizing a professional, engineered aesthetic.

- **Panels & Cards:** Use a consistent 4px (0.25rem) corner radius.
- **Buttons:** Follow the 4px rule to maintain a serious, enterprise-grade appearance.
- **Status Chips:** May use a larger 12px (0.75rem) radius to differentiate them as discrete status indicators within data-heavy rows.
- **Admin Surface:** Strictly adheres to 4px or even 0px for technical labels to reinforce the "Control Tower" feeling.

## Components

### Buttons

- **Primary:** Solid background (accent color), bold typography, minimal padding (12px 24px).
- **Secondary:** Ghost style with a 1px border.
- **Admin Action:** High-contrast background with a distinct "Danger" variant for governed actions.

### Status Chips

- Compact, utilizing a 10% opacity background of the status color with a 100% opacity text label. Used for "Operational," "Pending," or "System Alert."

### Primary Panel

- An email-safe `<div>` or `<table>` wrapper with a subtle border and 32px internal padding. This is the stage for the main message.

### Metadata Rows

- Used heavily in Product and Admin views. Key-value pairs using `Label-font` for the key (muted color) and `Body-font` for the value.

### Footer

- Minimalist and calm. Centered text, small font size (`body-sm`), containing legal links and the Comvestec Solutions identifier.
