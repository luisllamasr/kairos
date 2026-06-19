import { supabase } from '@/lib/supabase';

// ── Username validation ───────────────────────────────────────────────────────
//
// These rules must stay consistent with the database CHECK constraints:
//   profiles_username_format:       ^[a-z0-9._-]{3,30}$
//   profiles_username_has_alphanum: [a-z0-9]
//
// isValidUsernameChars uses charCodeAt instead of a regex character class
// because Hermes (React Native's JS engine) inconsistently handles classes
// containing period and hyphen — /^[-a-z0-9._]+$/ fails to match '-' and '.'
// at runtime despite both being correctly included in the class.

export function isValidUsernameChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (
      (c >= 97 && c <= 122) || // a-z
      (c >= 48 && c <= 57) ||  // 0-9
      c === 46 ||               // .
      c === 95 ||               // _
      c === 45                  // -
    ) {
      continue;
    }
    return false;
  }
  return true;
}

export const USERNAME_HAS_ALPHANUM = /[a-z0-9]/;

// Returns true when the username passes all three constraints.
// Use this instead of calling the individual checks directly.
export function validateUsername(username: string): boolean {
  if (!username || username.length < 3) return false;
  if (!isValidUsernameChars(username)) return false;
  if (!USERNAME_HAS_ALPHANUM.test(username)) return false;
  return true;
}

// ── Avatar upload ─────────────────────────────────────────────────────────────
//
// Uploads an avatar using base64 data returned by expo-image-picker.
//
// Why not fetch(localUri).blob():
//   React Native's Hermes fetch implementation does not read local file:// URIs
//   into the response body — the resulting blob is always 0 bytes.
//
// Why base64 + atob + Uint8Array:
//   expo-image-picker reads the file at the native layer and returns base64.
//   atob() is available globally in React Native 0.71+ (Hermes includes it).
//   Uploading a Uint8Array is reliable across all Supabase JS SDK versions.
//
// Path convention: avatars/{userId}/avatar_{timestamp}.jpg
//
// Why a unique path per upload instead of a fixed path:
//   Supabase Storage public buckets are served through a CDN. When the same
//   path is re-uploaded (even after a remove()), the CDN may keep serving the
//   previously cached bytes because the cache key (the URL) has not changed.
//   A unique filename per upload gives the CDN a new cache key each time, so
//   the new avatar is always fetched fresh — no query-param hacks required.
//   After the DB update succeeds, cleanupUserAvatars() sweeps all stale
//   files for the user so storage stays clean.
export async function uploadAvatar(
  base64Data: string,
  userId: string,
): Promise<string | null> {
  try {
    const path = `${userId}/avatar_${Date.now()}.jpg`;
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg' });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

// Removes every avatar in the user's folder except the current one.
//
// Why sweep the whole folder instead of deleting only the previous path:
//   Fire-and-forget cleanup can fail (network outage, app crash mid-upload).
//   Sweeping the folder on every successful update is self-healing — stale
//   files from any previous failed cleanup are removed automatically the next
//   time the user saves a new avatar, without any retry infrastructure.
//
// Errors are intentionally ignored: a cleanup failure must not block the
// caller or roll back the profile update — orphaned files are acceptable
// and will be swept on the next successful avatar change.
export async function cleanupUserAvatars(userId: string, currentPath: string): Promise<void> {
  const { data: files } = await supabase.storage.from('avatars').list(userId);
  if (!files?.length) return;
  const stale = files
    .map(f => `${userId}/${f.name}`)
    .filter(path => path !== currentPath);
  if (stale.length > 0) {
    await supabase.storage.from('avatars').remove(stale);
  }
}

// ── Avatar URL ────────────────────────────────────────────────────────────────

// Returns the public CDN URL for a storage path in the avatars bucket.
// Returns null when storagePath is falsy — Avatar renders an initials
// placeholder in that case.
export function getAvatarPublicUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  return supabase.storage.from('avatars').getPublicUrl(storagePath).data.publicUrl;
}
