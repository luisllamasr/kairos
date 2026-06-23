import { supabase } from '@/lib/supabase';
import { PublicProfile, PublicProfileWithRelationship } from '@/types/public-profile';
import { parseRelationshipStatus } from '@/types/relationship';

export const USERNAME_SEARCH_MIN_LENGTH = 3;

/** Normalize user input for username search and profile lookup. */
export function normalizeUsernameQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

export async function searchProfiles(
  query: string,
): Promise<{ data: PublicProfile[]; error: boolean }> {
  const normalized = normalizeUsernameQuery(query);
  if (normalized.length < USERNAME_SEARCH_MIN_LENGTH) {
    return { data: [], error: false };
  }

  const { data, error } = await supabase.rpc('search_profiles', {
    p_query: normalized,
    p_limit: 20,
  });

  if (error) return { data: [], error: true };
  return { data: (data ?? []) as PublicProfile[], error: false };
}

export async function getPublicProfile(
  username: string,
): Promise<{ data: PublicProfileWithRelationship | null; error: boolean }> {
  const normalized = normalizeUsernameQuery(username);
  if (!normalized) return { data: null, error: false };

  const { data, error } = await supabase.rpc('get_public_profile', {
    p_username: normalized,
  });

  if (error) return { data: null, error: true };
  const rows = (data ?? []) as Array<PublicProfileWithRelationship & { relationship_status: unknown }>;
  const row = rows[0];
  if (!row) return { data: null, error: false };

  return {
    data: {
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      relationship_status: parseRelationshipStatus(row.relationship_status),
    },
    error: false,
  };
}
