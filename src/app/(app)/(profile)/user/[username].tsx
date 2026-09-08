// Thin route re-export — see src/components/PublicProfileScreen.tsx for the
// shared implementation and why this is duplicated (unchanged) under
// src/app/(app)/(search)/user/[username].tsx as well. Keeping this route
// under Profile means router.back() from here returns to Friends or Friend
// Requests when opened from either of those Profile-tab screens.
export { PublicProfileScreen as default } from '@/components/PublicProfileScreen';
