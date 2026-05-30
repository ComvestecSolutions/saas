export const formatAdminTimestamp = (value: string | undefined): string =>
  value === undefined || value.length === 0
    ? "n/a"
    : value.slice(0, 16).replace("T", " ");

export const formatAdminDate = (value: string | undefined): string =>
  value === undefined || value.length === 0 ? "n/a" : value.slice(0, 10);
