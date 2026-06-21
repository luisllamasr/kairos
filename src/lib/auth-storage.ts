import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';

const VAULT_KEY = 'kairos.auth.v1';

/** Metadata stored per remembered account — used by the switcher UI. */
export type AccountSnapshot = {
  userId: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  lastActiveAt: number;
};

type AuthVault = {
  version: 1;
  activeUserId: string | null;
  /** userId → raw Supabase session JSON (same shape as the default auth storage value). */
  sessions: Record<string, string>;
  snapshots: Record<string, AccountSnapshot>;
};

/** Controls how removeItem behaves when Supabase calls signOut. */
type RemoveMode = 'purge-active' | 'active-only';

let removeMode: RemoveMode = 'purge-active';

export function setAuthRemoveMode(mode: RemoveMode): void {
  removeMode = mode;
}

function emptyVault(): AuthVault {
  return { version: 1, activeUserId: null, sessions: {}, snapshots: {} };
}

async function readVault(): Promise<AuthVault> {
  const raw = await AsyncStorage.getItem(VAULT_KEY);
  if (!raw) return emptyVault();
  try {
    const parsed = JSON.parse(raw) as AuthVault;
    if (parsed.version !== 1) return emptyVault();
    return {
      version: 1,
      activeUserId: parsed.activeUserId ?? null,
      sessions: parsed.sessions ?? {},
      snapshots: parsed.snapshots ?? {},
    };
  } catch {
    return emptyVault();
  }
}

async function writeVault(vault: AuthVault): Promise<void> {
  await AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

function parseUserIdFromSession(sessionJson: string): string | null {
  try {
    const parsed = JSON.parse(sessionJson) as { user?: { id?: string } };
    return parsed.user?.id ?? null;
  } catch {
    return null;
  }
}

/** One-time migration from pre-vault single-session storage. */
async function migrateLegacySession(authStorageKey: string, vault: AuthVault): Promise<AuthVault> {
  if (Object.keys(vault.sessions).length > 0) return vault;

  const legacy = await AsyncStorage.getItem(authStorageKey);
  if (!legacy) return vault;

  const userId = parseUserIdFromSession(legacy);
  if (!userId) return vault;

  vault.sessions[userId] = legacy;
  vault.activeUserId = userId;
  const email = (() => {
    try {
      return (JSON.parse(legacy) as { user?: { email?: string } }).user?.email ?? '';
    } catch {
      return '';
    }
  })();
  vault.snapshots[userId] = {
    userId,
    email,
    username: null,
    display_name: null,
    avatar_url: null,
    lastActiveAt: Date.now(),
  };
  await AsyncStorage.removeItem(authStorageKey);
  await writeVault(vault);
  return vault;
}

export async function listAccountSnapshots(): Promise<AccountSnapshot[]> {
  const vault = await readVault();
  return Object.values(vault.snapshots).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export async function updateAccountSnapshot(
  userId: string,
  patch: Partial<Omit<AccountSnapshot, 'userId' | 'lastActiveAt'>>,
): Promise<void> {
  const vault = await readVault();
  const existing = vault.snapshots[userId];
  vault.snapshots[userId] = {
    userId,
    email: patch.email ?? existing?.email ?? '',
    username: patch.username !== undefined ? patch.username : (existing?.username ?? null),
    display_name:
      patch.display_name !== undefined ? patch.display_name : (existing?.display_name ?? null),
    avatar_url:
      patch.avatar_url !== undefined ? patch.avatar_url : (existing?.avatar_url ?? null),
    lastActiveAt: existing?.lastActiveAt ?? Date.now(),
  };
  await writeVault(vault);
}

export async function removeAccountFromVault(userId: string): Promise<void> {
  const vault = await readVault();
  delete vault.sessions[userId];
  delete vault.snapshots[userId];
  if (vault.activeUserId === userId) {
    vault.activeUserId = null;
  }
  await writeVault(vault);
}

export async function getStoredSessionJson(userId: string): Promise<string | null> {
  const vault = await readVault();
  return vault.sessions[userId] ?? null;
}

/** Write the latest session tokens for a user without changing the active session. */
export async function persistSessionInVault(session: Session): Promise<void> {
  const vault = await readVault();
  vault.sessions[session.user.id] = JSON.stringify(session);
  await writeVault(vault);
}

/**
 * Clear the active session pointer only — keeps all stored session tokens intact.
 * Used when opening Add account; must NOT call supabase.auth.signOut(), which
 * revokes tokens on the server while the vault still holds the old refresh token.
 */
export async function deactivateActiveSessionInVault(): Promise<void> {
  const vault = await readVault();
  vault.activeUserId = null;
  await writeVault(vault);
}

export async function setActiveUserInVault(userId: string): Promise<void> {
  const vault = await readVault();
  vault.activeUserId = userId;
  if (vault.snapshots[userId]) {
    vault.snapshots[userId].lastActiveAt = Date.now();
  }
  await writeVault(vault);
}

/**
 * Supabase auth storage adapter — one active session in the SDK, multiple sessions in the vault.
 */
export function createMultiAccountAuthStorage(authStorageKey: string) {
  return {
    getItem: async (key: string): Promise<string | null> => {
      if (key !== authStorageKey) {
        return AsyncStorage.getItem(key);
      }

      let vault = await readVault();
      vault = await migrateLegacySession(authStorageKey, vault);

      if (!vault.activeUserId) return null;
      return vault.sessions[vault.activeUserId] ?? null;
    },

    setItem: async (key: string, value: string): Promise<void> => {
      if (key !== authStorageKey) {
        await AsyncStorage.setItem(key, value);
        return;
      }

      const userId = parseUserIdFromSession(value);
      if (!userId) return;

      const vault = await readVault();
      vault.sessions[userId] = value;
      vault.activeUserId = userId;

      const email = (() => {
        try {
          return (JSON.parse(value) as { user?: { email?: string } }).user?.email ?? '';
        } catch {
          return '';
        }
      })();

      const existing = vault.snapshots[userId];
      vault.snapshots[userId] = {
        userId,
        email: email || existing?.email || '',
        username: existing?.username ?? null,
        display_name: existing?.display_name ?? null,
        avatar_url: existing?.avatar_url ?? null,
        lastActiveAt: Date.now(),
      };

      await writeVault(vault);
    },

    removeItem: async (key: string): Promise<void> => {
      if (key !== authStorageKey) {
        await AsyncStorage.removeItem(key);
        return;
      }

      const vault = await readVault();
      const mode = removeMode;
      removeMode = 'purge-active';

      if (mode === 'active-only') {
        vault.activeUserId = null;
      } else if (vault.activeUserId) {
        delete vault.sessions[vault.activeUserId];
        delete vault.snapshots[vault.activeUserId];
        vault.activeUserId = null;
      }

      await writeVault(vault);
    },
  };
}

export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}
