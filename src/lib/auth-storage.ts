import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Storage layout (all internal — never exposed outside this file):
 *
 * - INDEX_KEY (AsyncStorage): non-sensitive index — activeUserId + per-account
 *   snapshots (email/username/display name/avatar for the switcher UI).
 * - Per-user session tokens (AsyncStorage, key per user): the full Supabase
 *   session JSON, AES-256-CTR encrypted. Not sensitive enough to justify a
 *   SecureStore key each (would also hit its 2KB/value limit — see below),
 *   but the *content* is a bearer credential, so it is encrypted at rest.
 * - AES key (SecureStore, one key for the whole vault): the only thing that
 *   actually lives in the Keychain/Keystore. Small (32 bytes hex), so it
 *   comfortably fits, and losing device-level access (e.g. jailbreak file
 *   read) no longer hands over plaintext refresh tokens.
 *
 * Why not put encrypted session blobs in SecureStore too? Expo SecureStore
 * rejects/warns above ~2048 bytes per value (Android Keystore constraint).
 * A full Supabase session (access token JWT + refresh token + user object)
 * routinely exceeds that. This mirrors Supabase's own documented pattern for
 * Expo + SecureStore ("LargeSecureStore"), with one correction: the AES key
 * is generated once and reused, not regenerated on every write. Kairos vaults
 * multiple accounts at once, so a "new key per write" approach (as in the
 * single-session tutorial example) would silently corrupt every *other*
 * account's already-encrypted entry on the next write.
 */

const INDEX_KEY = 'kairos.auth.index.v2';
const VAULT_KEY_LEGACY_V1 = 'kairos.auth.v1';
const AES_KEY_STORE_KEY = 'kairos.auth.vaultKey';

/** Metadata stored per remembered account — used by the switcher UI. */
export type AccountSnapshot = {
  userId: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  lastActiveAt: number;
};

/** Snapshot plus whether a local session exists for this user. */
export type RememberedAccount = AccountSnapshot & {
  hasSession: boolean;
};

type VaultIndex = {
  version: 2;
  activeUserId: string | null;
  snapshots: Record<string, AccountSnapshot>;
};

/** Controls how removeItem behaves when Supabase calls signOut. */
type RemoveMode = 'purge-active' | 'purge-session-only' | 'active-only';

let removeMode: RemoveMode = 'purge-active';

/**
 * Runs `fn` (expected to trigger exactly one Supabase-driven `removeItem`
 * call, e.g. via `supabase.auth.signOut()`) with `mode` applied, and always
 * restores the default afterwards — even if `fn` throws. This replaces a
 * bare exported setter, which required every call site to remember to pair
 * "set mode" with "call signOut" and left the flag stuck on failure.
 */
export async function withAuthRemoveMode<T>(mode: RemoveMode, fn: () => Promise<T>): Promise<T> {
  removeMode = mode;
  try {
    return await fn();
  } finally {
    removeMode = 'purge-active';
  }
}

/** The `authStorageKey` passed to `createMultiAccountAuthStorage`, cached for
 * migrating pre-vault (single-session) installs. Set synchronously at client
 * construction time (see `src/lib/supabase.ts`), before any other vault
 * function can run. */
let cachedAuthStorageKey: string | null = null;

function emptyIndex(): VaultIndex {
  return { version: 2, activeUserId: null, snapshots: {} };
}

async function readIndex(): Promise<VaultIndex> {
  await ensureMigrated();
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return emptyIndex();
  try {
    const parsed = JSON.parse(raw) as VaultIndex;
    if (parsed.version !== 2) return emptyIndex();
    return {
      version: 2,
      activeUserId: parsed.activeUserId ?? null,
      snapshots: parsed.snapshots ?? {},
    };
  } catch {
    return emptyIndex();
  }
}

async function writeIndex(index: VaultIndex): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function sessionStorageKey(userId: string): string {
  return `kairos.auth.session.${userId}`;
}

function parseUserIdFromSession(sessionJson: string): string | null {
  try {
    const parsed = JSON.parse(sessionJson) as { user?: { id?: string } };
    return parsed.user?.id ?? null;
  } catch {
    return null;
  }
}

function parseEmailFromSession(sessionJson: string): string {
  try {
    return (JSON.parse(sessionJson) as { user?: { email?: string } }).user?.email ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Encryption — AES-256-CTR, one persisted key for the whole vault, random IV
// per encrypted value (IV is not secret; it is stored alongside the ciphertext).
// ---------------------------------------------------------------------------

let cachedEncryptionKey: Uint8Array | null = null;

async function getEncryptionKey(): Promise<Uint8Array> {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  const existing = await SecureStore.getItemAsync(AES_KEY_STORE_KEY);
  if (existing) {
    cachedEncryptionKey = aesjs.utils.hex.toBytes(existing);
    return cachedEncryptionKey;
  }

  const generated = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(AES_KEY_STORE_KEY, aesjs.utils.hex.fromBytes(generated));
  cachedEncryptionKey = generated;
  return generated;
}

async function encryptString(value: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = await Crypto.getRandomBytesAsync(16);
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  return aesjs.utils.hex.fromBytes(iv) + aesjs.utils.hex.fromBytes(encryptedBytes);
}

/** Returns null if `payload` is missing, malformed, or fails to decrypt (e.g.
 * a corrupted entry) — callers treat that the same as "no session stored". */
async function decryptString(payload: string): Promise<string | null> {
  try {
    const key = await getEncryptionKey();
    const ivHex = payload.slice(0, 32);
    const cipherHex = payload.slice(32);
    const iv = aesjs.utils.hex.toBytes(ivHex);
    const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  } catch {
    return null;
  }
}

async function readSessionJson(userId: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(sessionStorageKey(userId));
  if (!raw) return null;
  return decryptString(raw);
}

async function writeSessionJson(userId: string, sessionJson: string): Promise<void> {
  const encrypted = await encryptString(sessionJson);
  await AsyncStorage.setItem(sessionStorageKey(userId), encrypted);
}

async function deleteSessionJson(userId: string): Promise<void> {
  await AsyncStorage.removeItem(sessionStorageKey(userId));
}

// ---------------------------------------------------------------------------
// One-time, automatic migration to the encrypted layout. Runs lazily on first
// use and is safe to await concurrently from multiple call sites.
// ---------------------------------------------------------------------------

let migrationPromise: Promise<void> | null = null;

function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runMigration();
  }
  return migrationPromise;
}

async function runMigration(): Promise<void> {
  const alreadyMigrated = await AsyncStorage.getItem(INDEX_KEY);
  if (alreadyMigrated) return;

  // Case 1: existing multi-account vault (plaintext sessions in one blob).
  const legacyVaultRaw = await AsyncStorage.getItem(VAULT_KEY_LEGACY_V1);
  if (legacyVaultRaw) {
    try {
      const legacyVault = JSON.parse(legacyVaultRaw) as {
        activeUserId: string | null;
        sessions: Record<string, string>;
        snapshots: Record<string, AccountSnapshot>;
      };

      for (const [userId, sessionJson] of Object.entries(legacyVault.sessions ?? {})) {
        await writeSessionJson(userId, sessionJson);
      }
      await writeIndex({
        version: 2,
        activeUserId: legacyVault.activeUserId ?? null,
        snapshots: legacyVault.snapshots ?? {},
      });
      await AsyncStorage.removeItem(VAULT_KEY_LEGACY_V1);
      return;
    } catch {
      // Fall through — treat as if there was nothing to migrate.
    }
  }

  // Case 2: pre-vault single-session installs (very old — kept for safety).
  if (cachedAuthStorageKey) {
    const legacySingleSession = await AsyncStorage.getItem(cachedAuthStorageKey);
    if (legacySingleSession) {
      const userId = parseUserIdFromSession(legacySingleSession);
      if (userId) {
        await writeSessionJson(userId, legacySingleSession);
        await writeIndex({
          version: 2,
          activeUserId: userId,
          snapshots: {
            [userId]: {
              userId,
              email: parseEmailFromSession(legacySingleSession),
              username: null,
              display_name: null,
              avatar_url: null,
              lastActiveAt: Date.now(),
            },
          },
        });
        await AsyncStorage.removeItem(cachedAuthStorageKey);
        return;
      }
    }
  }

  // Nothing to migrate — first run on a fresh install.
  await writeIndex(emptyIndex());
}

/** All remembered accounts with local session status (for switcher and sign-in). */
export async function listRememberedAccounts(): Promise<RememberedAccount[]> {
  const index = await readIndex();
  const withSession = await Promise.all(
    Object.values(index.snapshots).map(async (snapshot) => ({
      ...snapshot,
      hasSession: (await AsyncStorage.getItem(sessionStorageKey(snapshot.userId))) !== null,
    })),
  );
  return withSession.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export async function hasStoredSession(userId: string): Promise<boolean> {
  await ensureMigrated();
  return (await AsyncStorage.getItem(sessionStorageKey(userId))) !== null;
}

/** Remove local session tokens only — snapshot remains (signed-out remembered account). */
export async function purgeSessionFromVault(userId: string): Promise<void> {
  const index = await readIndex();
  await deleteSessionJson(userId);
  if (index.activeUserId === userId) {
    index.activeUserId = null;
  }
  await writeIndex(index);
}

/** Remove all local data for a user — does not delete the Kairos account on the server. */
export async function forgetAccountOnDevice(userId: string): Promise<void> {
  await removeAccountFromVault(userId);
}

export async function updateAccountSnapshot(
  userId: string,
  patch: Partial<Omit<AccountSnapshot, 'userId' | 'lastActiveAt'>>,
): Promise<void> {
  const index = await readIndex();
  const existing = index.snapshots[userId];
  index.snapshots[userId] = {
    userId,
    email: patch.email ?? existing?.email ?? '',
    username: patch.username !== undefined ? patch.username : (existing?.username ?? null),
    display_name:
      patch.display_name !== undefined ? patch.display_name : (existing?.display_name ?? null),
    avatar_url:
      patch.avatar_url !== undefined ? patch.avatar_url : (existing?.avatar_url ?? null),
    lastActiveAt: existing?.lastActiveAt ?? Date.now(),
  };
  await writeIndex(index);
}

export async function removeAccountFromVault(userId: string): Promise<void> {
  const index = await readIndex();
  await deleteSessionJson(userId);
  delete index.snapshots[userId];
  if (index.activeUserId === userId) {
    index.activeUserId = null;
  }
  await writeIndex(index);
}

export async function getStoredSessionJson(userId: string): Promise<string | null> {
  await ensureMigrated();
  return readSessionJson(userId);
}

/** Write the latest session tokens for a user without changing the active session. */
export async function persistSessionInVault(session: Session): Promise<void> {
  await ensureMigrated();
  await writeSessionJson(session.user.id, JSON.stringify(session));
}

/**
 * Clear the active session pointer only — keeps all stored session tokens intact.
 * Used when opening Add account; must NOT call supabase.auth.signOut(), which
 * revokes tokens on the server while the vault still holds the old refresh token.
 */
export async function deactivateActiveSessionInVault(): Promise<void> {
  const index = await readIndex();
  index.activeUserId = null;
  await writeIndex(index);
}

export async function setActiveUserInVault(userId: string): Promise<void> {
  const index = await readIndex();
  index.activeUserId = userId;
  if (index.snapshots[userId]) {
    index.snapshots[userId].lastActiveAt = Date.now();
  }
  await writeIndex(index);
}

/**
 * Supabase auth storage adapter — one active session in the SDK, multiple sessions in the vault.
 */
export function createMultiAccountAuthStorage(authStorageKey: string) {
  cachedAuthStorageKey = authStorageKey;

  return {
    getItem: async (key: string): Promise<string | null> => {
      if (key !== authStorageKey) {
        return AsyncStorage.getItem(key);
      }

      await ensureMigrated();
      const index = await readIndex();
      if (!index.activeUserId) return null;
      return readSessionJson(index.activeUserId);
    },

    setItem: async (key: string, value: string): Promise<void> => {
      if (key !== authStorageKey) {
        await AsyncStorage.setItem(key, value);
        return;
      }

      await ensureMigrated();

      const userId = parseUserIdFromSession(value);
      if (!userId) return;

      await writeSessionJson(userId, value);

      const index = await readIndex();
      index.activeUserId = userId;
      const email = parseEmailFromSession(value);
      const existing = index.snapshots[userId];
      index.snapshots[userId] = {
        userId,
        email: email || existing?.email || '',
        username: existing?.username ?? null,
        display_name: existing?.display_name ?? null,
        avatar_url: existing?.avatar_url ?? null,
        lastActiveAt: Date.now(),
      };
      await writeIndex(index);
    },

    removeItem: async (key: string): Promise<void> => {
      if (key !== authStorageKey) {
        await AsyncStorage.removeItem(key);
        return;
      }

      await ensureMigrated();
      const index = await readIndex();

      if (removeMode === 'active-only') {
        index.activeUserId = null;
      } else if (removeMode === 'purge-session-only' && index.activeUserId) {
        await deleteSessionJson(index.activeUserId);
        index.activeUserId = null;
      } else if (index.activeUserId) {
        await deleteSessionJson(index.activeUserId);
        delete index.snapshots[index.activeUserId];
        index.activeUserId = null;
      }

      await writeIndex(index);
    },
  };
}

export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}
