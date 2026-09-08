import { useSegments } from 'expo-router';

/**
 * Which tab currently hosts a screen in the shared profile route family
 * (PublicProfileScreen and its friends/mutual-friends lists — each
 * duplicated under both (search) and (profile) so Back returns to whichever
 * tab the viewer came from; see src/components/PublicProfileScreen.tsx).
 *
 * Used to build further in-tab pushes explicitly rather than relying on
 * Expo Router's "current group" resolution for a bare, group-less path —
 * that resolution exists, but nothing else in this app depends on it, and
 * an explicit, testable string check is one line cheaper to reason about.
 */
export function useCurrentProfileTabGroup(): '(search)' | '(profile)' {
  const segments = useSegments() as string[];
  return segments.includes('(profile)') ? '(profile)' : '(search)';
}
