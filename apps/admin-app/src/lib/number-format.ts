const adminNumberLocale = "en-US";

export const formatAdminNumber = (
  value: number,
  options?: Intl.NumberFormatOptions,
): string => new Intl.NumberFormat(adminNumberLocale, options).format(value);

export const formatAdminInteger = (value: number): string =>
  formatAdminNumber(value);
