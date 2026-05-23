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
