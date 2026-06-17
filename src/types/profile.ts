// Mirrors the public.profiles table schema.
// Update this type whenever a migration changes the profiles table.
export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

// A profile is considered complete when the user has finished onboarding.
// username is the minimum required field — routing gates on this.
export function isProfileComplete(profile: Profile): boolean {
  return profile.username !== null;
}
