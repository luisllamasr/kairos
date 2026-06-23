/** Fields exposed by search_profiles / get_public_profile RPCs. */
export type PublicProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};
