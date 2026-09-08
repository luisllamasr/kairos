// Privacy v1 client wrappers (docs/PROJECT.md §6). These call the public,
// non-participant read RPCs plus the one write that controls them
// (set_memory_profile_visibility). The existing participant-side memory API
// in @/lib/memories.ts is untouched — that API stays participant-only.

import { supabase } from '@/lib/supabase';
import { MemoryListItem } from '@/types/memory';
import { PublicMemory, PublicMemoryMedia } from '@/types/public-memory';

type RpcResult = { ok: boolean; error: boolean };

function mapProfileMemoryListItem(row: Record<string, unknown>): MemoryListItem {
  return {
    id: row.id as string,
    title: row.title as string,
    location_name: (row.location_name as string | null) ?? null,
    happened_starts_at: row.happened_starts_at as string,
    happened_ends_at: row.happened_ends_at as string,
  };
}

function mapPublicMemory(row: Record<string, unknown>): PublicMemory {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    location_name: (row.location_name as string | null) ?? null,
    location_latitude: (row.location_latitude as number | null) ?? null,
    location_longitude: (row.location_longitude as number | null) ?? null,
    happened_starts_at: row.happened_starts_at as string,
    happened_ends_at: row.happened_ends_at as string,
    participant_count: row.participant_count as number,
  };
}

function mapPublicMemoryMedia(row: Record<string, unknown>): PublicMemoryMedia {
  return {
    id: row.id as string,
    storage_path: row.storage_path as string,
    mime_type: row.mime_type as string,
    sort_order: row.sort_order as number,
  };
}

/** Memories surfaced on a profile (list_profile_memories) — same shape as MemoryListItem. */
export async function listProfileMemories(username: string): Promise<{
  data: MemoryListItem[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_profile_memories', {
    p_username: username,
  });
  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapProfileMemoryListItem(row)),
    error: false,
  };
}

/** Full public read of a memory the caller does not participate in (get_public_memory). */
export async function getPublicMemory(
  memoryId: string,
): Promise<{ data: PublicMemory | null; error: boolean }> {
  const { data, error } = await supabase.rpc('get_public_memory', {
    p_memory_id: memoryId,
  });
  if (error) return { data: null, error: true };
  const rows = (data ?? []) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return { data: null, error: false };
  return { data: mapPublicMemory(row), error: false };
}

/** Media for a public memory read (list_public_memory_media) — no uploader identity. */
export async function listPublicMemoryMedia(memoryId: string): Promise<{
  data: PublicMemoryMedia[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_public_memory_media', {
    p_memory_id: memoryId,
  });
  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapPublicMemoryMedia(row)),
    error: false,
  };
}

/** Per-memory opt-out from surfacing a shared memory on my own profile. */
export async function setMemoryProfileVisibility(
  memoryId: string,
  visible: boolean,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('set_memory_profile_visibility', {
    p_memory_id: memoryId,
    p_visible: visible,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}
