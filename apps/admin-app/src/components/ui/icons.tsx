import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  readonly size?: number;
};

const baseProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function Icon({
  size = 16,
  path,
  ...rest
}: IconProps & { readonly path: string }) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d={path} />
    </svg>
  );
}

export const SearchIcon = ({ size = 14, ...rest }: IconProps) => (
  <svg {...baseProps(size)} {...rest}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p} path="M10 3L5 8l5 5" />
);
export const ChevronRight = (p: IconProps) => (
  <Icon {...p} path="M6 3l5 5-5 5" />
);
export const ChevronDown = (p: IconProps) => (
  <Icon {...p} path="M3 6l5 5 5-5" />
);
export const FilterIcon = (p: IconProps) => (
  <Icon {...p} path="M2 3h12l-4.5 6V14L7 12.5V9L2 3z" />
);
export const RefreshIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4M14 2v4h-4M2 14v-4h4"
  />
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p} path="M8 2v9M4 7l4 4 4-4M2 14h12" />
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p} path="M9 2h5v5M14 2L7 9M13 9v5H2V3h5" />
);
export const PlusIcon = (p: IconProps) => <Icon {...p} path="M8 3v10M3 8h10" />;
export const XIcon = (p: IconProps) => (
  <Icon {...p} path="M4 4l8 8M12 4l-8 8" />
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p} path="M3 8l3.5 3.5L13 5" />
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p} path="M8 2l6.5 11H1.5L8 2zM8 6v3M8 11v.5" />
);
export const ShieldIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M8 1.5l5.5 2v4c0 3-2.4 5.7-5.5 6.5C4.9 13.2 2.5 10.5 2.5 7.5v-4L8 1.5z"
  />
);
export const KeyIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M10 2.5a3.5 3.5 0 100 7c.55 0 1.07-.13 1.53-.35L13 10.5l-1 1 1 1-1.5 1.5L9 11.5l-.85-1.32A3.5 3.5 0 0110 2.5z"
  />
);
export const DiffIcon = (p: IconProps) => (
  <Icon {...p} path="M5 1v4l-2 2 2 2v6M11 1v4l2 2-2 2v6M5 8h6" />
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p} path="M8 2a6 6 0 100 12 6 6 0 000-12zM8 5v3l2 2" />
);
export const SettingsIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
  />
);
export const OverviewIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z"
  />
);
export const WrenchIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M10.5 2.5a2.5 2.5 0 01-2.6 3L4 9.4l2.6 2.6 3.9-3.9a2.5 2.5 0 003-3L12.4 7l-1.9-1.9 2.1-2.6a2.6 2.6 0 00-2.1 0zM3 13l1.8-1.8"
  />
);
export const TenantsIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M2.5 13.5V5.5h4v8M9.5 13.5v-11h4v11M4.5 7.5h.1M4.5 9.5h.1M11.5 5.5h.1M11.5 7.5h.1M11.5 9.5h.1M1.5 13.5h13"
  />
);
export const BoltIcon = (p: IconProps) => (
  <Icon {...p} path="M9.5 1.5L4 8h3l-1 6.5L12 7.5H9l.5-6z" />
);
export const AuditTrailIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M3 3.5h7M3 7.5h5M3 11.5h4M10.75 9.75a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM12.4 11.4L14.5 13.5"
  />
);
export const LifebuoyIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M8 2.25a5.75 5.75 0 100 11.5 5.75 5.75 0 000-11.5zM8 5.25a2.75 2.75 0 100 5.5 2.75 2.75 0 000-5.5zM4 4l1.9 1.9M10.1 10.1L12 12M12 4l-1.9 1.9M5.9 10.1L4 12"
  />
);
export const GlobeIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M8 2a6 6 0 100 12A6 6 0 008 2zM2 8h12M8 2c1.7 1.5 2.6 3.5 2.6 6S9.7 12.5 8 14M8 2C6.3 3.5 5.4 5.5 5.4 8S6.3 12.5 8 14"
  />
);
export const RevenueIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M2 12.5h12M3 10l3-3 2 2 4-5 1 1M3 5.5v5M7 8.5v4M11 6.5v6"
  />
);
export const ArchiveIcon = (p: IconProps) => (
  <Icon {...p} path="M2.5 4.5h11v2h-11zM4 6.5v6h8v-6M6 8.5h4" />
);
export const PlugIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M6 2.5v3M10 2.5v3M4 5.5h8M8 5.5v3.5a2.5 2.5 0 01-5 0V8.5M8 9v4.5"
  />
);
export const MenuGridIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M2.5 3.5h11M2.5 8h11M2.5 12.5h11M3.5 2.5v11M8 2.5v11M12.5 2.5v11"
  />
);
export const UserBadgeIcon = (p: IconProps) => (
  <Icon
    {...p}
    path="M8 8.25a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5zM3 13.5c.75-2.1 2.4-3.25 5-3.25s4.25 1.15 5 3.25M11.75 2.5h2.75v2.75M13.125 2.5v4"
  />
);
