import { Schema } from "effect";

const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const isLeapYear = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number) => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
};

const isIsoTimestamp = (value: string) => {
  const match = isoTimestampPattern.exec(value);

  if (match == null) {
    return false;
  }

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  const hourText = match[4];
  const minuteText = match[5];
  const secondText = match[6];
  const offsetHourText = match[9];
  const offsetMinuteText = match[10];

  if (
    yearText == null ||
    monthText == null ||
    dayText == null ||
    hourText == null ||
    minuteText == null ||
    secondText == null
  ) {
    return false;
  }

  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const second = Number.parseInt(secondText, 10);

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  if (
    offsetHourText != null &&
    offsetMinuteText != null &&
    (Number.parseInt(offsetHourText, 10) > 23 ||
      Number.parseInt(offsetMinuteText, 10) > 59)
  ) {
    return false;
  }

  return true;
};

export const IsoTimestampSchema = Schema.NonEmptyString.pipe(
  Schema.filter(isIsoTimestamp),
);

export type IsoTimestamp = Schema.Schema.Type<typeof IsoTimestampSchema>;
