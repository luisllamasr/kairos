import { RelationshipStatus } from '@/types/relationship';

/** Fields exposed by search_profiles / get_public_profile / list_friends RPCs. */
export type PublicProfile = {
  user_id?: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Public profile with relationship context and identity stats from get_public_profile. */
export type PublicProfileWithRelationship = PublicProfile & {
  relationship_status: RelationshipStatus;
  friend_count: number;
  /**
   * NOT the owner's total memory count (see docs/PROJECT.md §6, "public
   * profile memory count is viewer-scoped"). Exactly the number of rows
   * `listProfileMemories(username)` returns to this same caller — i.e.
   * memories this viewer is actually allowed to see through the owner's
   * profile. Never the raw total, so it never disagrees with the rendered
   * list and never leaks the existence of hidden memories.
   */
  visible_memory_count: number;
  /** Null when viewing your own profile — mutual-with-self is meaningless. */
  mutual_friend_count: number | null;
};

/** Incoming friend request row from list_incoming_friend_requests. */
export type IncomingFriendRequest = PublicProfile & {
  requested_at: string;
};
