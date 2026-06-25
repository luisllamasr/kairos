/** Shared text limits — must match database CHECK constraints and RPC validation. */
export const TEXT_LIMITS = {
  title: 120,
  description: 2000,
  locationName: 200,
  personalNote: 1000,
} as const;

export function isWithinTextLimit(
  value: string | null | undefined,
  limit: number,
): boolean {
  if (value == null || value === '') return true;
  return value.length <= limit;
}
