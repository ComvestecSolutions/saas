/**
 * Operator Desk shell patterns (admin-app spec §Shell, ADR-022).
 *
 * Composition rule (binding):
 *   AppDesk
 *     ├── PulseRibbon          (32px top, glass)
 *     ├── EdgeRail             (56px left, matte)
 *     ├── Workbench            (center, hosts 1–4 Panes)
 *     │     └── Pane*
 *     ├── ContextSpine         (320px right, glass; collapses to 56)
 *     └── CommandStrip         (48px bottom, glass)
 *           ├── Omnibar
 *           ├── WorkspaceTabs
 *           ├── AlertsPulse
 *           └── RunAsBanner
 *
 * Visual depth is two layers only (matte canvas + glass). Nesting
 * glass inside glass is forbidden. Spacing between adjacent surfaces
 * must never sum to more than 10px.
 */
export { AppDesk } from "./AppDesk";
export type { AppDeskProps } from "./AppDesk";
export { PulseRibbon } from "./PulseRibbon";
export type { PulseRibbonProps, PulseSegment, PulseTone } from "./PulseRibbon";
export { EdgeRail } from "./EdgeRail";
export type { EdgeRailProps, EdgeRailItem } from "./EdgeRail";
export { Workbench } from "./Workbench";
export type { WorkbenchProps } from "./Workbench";
export { Pane } from "./Pane";
export type { PaneProps } from "./Pane";
export { ContextSpine } from "./ContextSpine";
export type { ContextSpineProps } from "./ContextSpine";
export { CommandStrip } from "./CommandStrip";
export type { CommandStripProps } from "./CommandStrip";
export { Omnibar } from "./Omnibar";
export type { OmnibarProps, OmnibarSuggestion } from "./Omnibar";
export { WorkspaceTabs } from "./WorkspaceTabs";
export type { WorkspaceTabsProps, WorkspaceTab } from "./WorkspaceTabs";
export { AlertsPulse } from "./AlertsPulse";
export type { AlertsPulseProps } from "./AlertsPulse";
export { RunAsBanner } from "./RunAsBanner";
export type { RunAsBannerProps } from "./RunAsBanner";
