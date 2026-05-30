import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";

export type ShellMode = "sidebar-expanded" | "sidebar-collapsed" | "nav-drawer";

export type DeviceState = {
  readonly deviceType: DeviceType;
  readonly shellMode: ShellMode;
  readonly isMobile: boolean;
  readonly isTablet: boolean;
  readonly isDesktop: boolean;
};

const breakpoints = {
  mobile: 640,
  tablet: 1024,
} as const;

const resolveDeviceType = (width: number): DeviceType => {
  if (width < breakpoints.mobile) return "mobile";
  if (width < breakpoints.tablet) return "tablet";
  return "desktop";
};

const resolveShellMode = (deviceType: DeviceType): ShellMode => {
  if (deviceType === "mobile") return "nav-drawer";
  if (deviceType === "tablet") return "sidebar-collapsed";
  return "sidebar-expanded";
};

const buildDeviceState = (width: number): DeviceState => {
  const deviceType = resolveDeviceType(width);
  const shellMode = resolveShellMode(deviceType);

  return {
    deviceType,
    shellMode,
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
  };
};

const DeviceContext = createContext<DeviceState>({
  deviceType: "desktop",
  shellMode: "sidebar-expanded",
  isMobile: false,
  isTablet: false,
  isDesktop: true,
});

export type DeviceProviderProps = {
  readonly children: ReactNode;
};

const ssrDeviceWidth = 1280;

export function DeviceProvider({ children }: DeviceProviderProps) {
  const [state, setState] = useState<DeviceState>(() =>
    buildDeviceState(ssrDeviceWidth),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setState(buildDeviceState(window.innerWidth));
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <DeviceContext.Provider value={state}>{children}</DeviceContext.Provider>
  );
}

export const useDeviceType = (): DeviceType =>
  useContext(DeviceContext).deviceType;

export const useResponsiveShell = (): ShellMode =>
  useContext(DeviceContext).shellMode;

export const useDeviceState = (): DeviceState => useContext(DeviceContext);
