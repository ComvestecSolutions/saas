/**
 * Liquid-glass surface helper (admin-app spec §14, plan §13).
 *
 * Returns an object containing:
 *   - `className`: the canonical "ops-glass" hook for app-level CSS
 *     consumers that prefer class-driven styling.
 *   - `style`: inline CSS custom-property + composed background/blur/
 *     border/shadow that matches the binding glass variables, so the
 *     primitive works even before the consuming app wires the
 *     stylesheet.
 *
 * Glass is the only layer allowed above the matte canvas. Never nest
 * glass inside glass.
 */

import type { CSSProperties } from "react";

export type DomainTint =
  | "identity"
  | "governance"
  | "tenants"
  | "billing"
  | "branding"
  | "retention"
  | "support"
  | "observability";

export type GlassSurfaceProps = {
  readonly domainTint?: DomainTint;
  /**
   * Optional override of the radius token (defaults to pane = 8px).
   * Use `shell` for the outermost desk containers.
   */
  readonly radius?: "primitive" | "pane" | "shell";
};

export type GlassSurfaceResult = {
  readonly className: string;
  readonly style: CSSProperties;
  readonly dataDomain: DomainTint | undefined;
};

const radiusVar: Record<NonNullable<GlassSurfaceProps["radius"]>, string> = {
  primitive: "4px",
  pane: "8px",
  shell: "10px",
};

export const glassSurface = (
  properties: GlassSurfaceProps = {},
): GlassSurfaceResult => {
  const radius = radiusVar[properties.radius ?? "pane"];
  return {
    className: "ops-glass",
    style: {
      background:
        "linear-gradient(180deg, var(--glass-overlay-top), var(--glass-overlay-bottom)), var(--glass-bg)",
      backgroundImage:
        "linear-gradient(180deg, var(--glass-overlay-top), var(--glass-overlay-bottom)), linear-gradient(var(--glass-tint-domain), transparent)",
      backdropFilter: "blur(var(--glass-blur))",
      WebkitBackdropFilter: "blur(var(--glass-blur))",
      border: "var(--glass-border)",
      boxShadow: "var(--glass-highlight), var(--glass-shadow)",
      borderRadius: radius,
    },
    dataDomain: properties.domainTint,
  };
};
