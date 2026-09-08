// Mirrors public.memory_visibility (docs/PROJECT.md §6, Privacy v1).
export type MemoriesVisibility = 'only_me' | 'friends' | 'everyone';

// Mirrors the public.profiles table schema.
// Update this type whenever a migration changes the profiles table.
export type Profile = {
  id: string;
  // null until the user completes onboarding. Routing gates on this field.
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  // Who can see this user's memories on their own profile. NOT NULL, defaults
  // to 'friends' at the DB level — set explicitly during onboarding.
  memories_visibility: MemoriesVisibility;
  created_at: string;
  updated_at: string;
};
