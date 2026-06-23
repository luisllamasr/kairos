import { RelationshipStatus } from '@/types/relationship';

/** Fields exposed by search_profiles / get_public_profile RPCs. */
export type PublicProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Public profile with relationship context from get_public_profile. */
export type PublicProfileWithRelationship = PublicProfile & {
  relationship_status: RelationshipStatus;
};

/** Incoming friend request row from list_incoming_friend_requests. */
export type IncomingFriendRequest = PublicProfile & {
  requested_at: string;
};
