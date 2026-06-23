/** Mutual friendship state between the viewer and a public profile. */
export type RelationshipStatus =
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'friends';

export function parseRelationshipStatus(value: unknown): RelationshipStatus {
  if (
    value === 'none' ||
    value === 'pending_outgoing' ||
    value === 'pending_incoming' ||
    value === 'friends'
  ) {
    return value;
  }
  return 'none';
}
