const DEFAULT_END_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Suggest an end datetime three hours after start (dinner-style default). */
export function suggestEndDate(start: Date): Date {
  return new Date(start.getTime() + DEFAULT_END_OFFSET_MS);
}

export function formatExperienceDateTime(dateIso: string, locale: string): string {
  const date = new Date(dateIso);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatExperienceRange(
  startsAt: string,
  endsAt: string,
  locale: string,
): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(start);
    const startTime = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(start);
    const endTime = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(end);
    return `${day} · ${startTime} – ${endTime}`;
  }

  return `${formatExperienceDateTime(startsAt, locale)} – ${formatExperienceDateTime(endsAt, locale)}`;
}

export function toIsoString(date: Date): string {
  return date.toISOString();
}

export function datesAreValid(start: Date, end: Date): boolean {
  return end.getTime() > start.getTime();
}
