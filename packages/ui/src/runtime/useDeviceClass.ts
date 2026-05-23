import { useDeviceType, type DeviceType } from "./device";

/**
 * Operator Desk device classification (admin-app spec rule 12).
 *
 * Returns the same three-class taxonomy as `useDeviceType` but under
 * the binding name the desk patterns and the responsive recomposition
 * rules use. Keeping the alias makes the binding contract explicit
 * without forking the underlying breakpoint source.
 */
export type DeviceClass = DeviceType;

export const useDeviceClass = (): DeviceClass => useDeviceType();
