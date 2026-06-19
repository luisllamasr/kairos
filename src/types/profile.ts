// Mirrors the public.profiles table schema.
// Update this type whenever a migration changes the profiles table.
export type Profile = {
  id: string;
  // null until the user completes onboarding. Routing gates on this field.
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};
