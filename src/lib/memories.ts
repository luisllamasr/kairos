import { TEXT_LIMITS } from '@/constants/text-limits';
import { supabase } from '@/lib/supabase';
import {
  Memory,
  MemoryListItem,
  MemoryMedia,
  MemoryParticipant,
} from '@/types/memory';

type RpcResult = { ok: boolean; error: boolean };

function mapListItem(row: Record<string, unknown>): MemoryListItem {
  return {
    id: row.id as string,
    title: row.title as string,
    location_name: (row.location_name as string | null) ?? null,
    happened_starts_at: row.happened_starts_at as string,
    happened_ends_at: row.happened_ends_at as string,
  };
}

function mapMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    location_name: (row.location_name as string | null) ?? null,
    location_latitude: (row.location_latitude as number | null) ?? null,
    location_longitude: (row.location_longitude as number | null) ?? null,
    happened_starts_at: row.happened_starts_at as string,
    happened_ends_at: row.happened_ends_at as string,
    transformed_at: row.transformed_at as string,
    leader_id: (row.leader_id as string | null) ?? null,
    edit_info_policy: row.edit_info_policy as Memory['edit_info_policy'],
    add_media_policy: row.add_media_policy as Memory['add_media_policy'],
    my_personal_note: (row.my_personal_note as string | null) ?? null,
    am_leader: Boolean(row.am_leader),
    updated_at: row.updated_at as string,
  };
}

function mapParticipant(row: Record<string, unknown>): MemoryParticipant {
  return {
    participant_id: row.participant_id as string,
    user_id: (row.user_id as string | null) ?? null,
    joined_at: row.joined_at as string,
    left_at: (row.left_at as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    is_leader: Boolean(row.is_leader),
  };
}

function mapMedia(row: Record<string, unknown>): MemoryMedia {
  return {
    id: row.id as string,
    storage_path: row.storage_path as string,
    mime_type: row.mime_type as string,
    byte_size: (row.byte_size as number | null) ?? null,
    sort_order: row.sort_order as number,
    created_at: row.created_at as string,
    uploaded_by_user_id: (row.uploaded_by_user_id as string | null) ?? null,
  };
}

export async function transformMyDueExperiences(): Promise<RpcResult> {
  const { error } = await supabase.rpc('transform_my_due_experiences');
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function listMyMemories(search?: string): Promise<{
  data: MemoryListItem[];
  error: boolean;
  errorMessage?: string;
}> {
  const { data, error } = await supabase.rpc('list_my_memories', {
    p_search: search?.trim() || null,
  });
  if (error) return { data: [], error: true, errorMessage: error.message };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapListItem(row)),
    error: false,
  };
}

export async function getMemory(id: string): Promise<{ data: Memory | null; error: boolean }> {
  const { data, error } = await supabase.rpc('get_memory', { p_id: id });
  if (error) return { data: null, error: true };
  const rows = (data ?? []) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return { data: null, error: false };
  return { data: mapMemory(row), error: false };
}

export async function listMemoryParticipants(memoryId: string): Promise<{
  data: MemoryParticipant[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_memory_participants', {
    p_memory_id: memoryId,
  });
  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapParticipant(row)),
    error: false,
  };
}

export async function listMemoryMedia(memoryId: string): Promise<{
  data: MemoryMedia[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_memory_media', {
    p_memory_id: memoryId,
  });
  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapMedia(row)),
    error: false,
  };
}

export async function ensureExperienceTransformed(
  experienceId: string,
): Promise<{ data: string | null; error: boolean }> {
  const { data, error } = await supabase.rpc('ensure_experience_transformed', {
    p_experience_id: experienceId,
  });
  if (error) return { data: null, error: true };
  return { data: (data as string | null) ?? null, error: false };
}

// Reads the caller's own profile_visible flag for a memory they participate
// in. Direct table read (not an RPC) — memory_participants already grants
// SELECT to authenticated with a fellow-participant RLS policy, same pattern
// as the direct profiles.update() calls used elsewhere in the app.
export async function getMyMemoryProfileVisibility(
  memoryId: string,
  userId: string,
): Promise<{ data: boolean | null; error: boolean }> {
  const { data, error } = await supabase
    .from('memory_participants')
    .select('profile_visible')
    .eq('memory_id', memoryId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();
  if (error) return { data: null, error: true };
  return { data: (data?.profile_visible as boolean | undefined) ?? null, error: false };
}

export async function updateMyMemoryNote(
  memoryId: string,
  note: string | null,
): Promise<RpcResult> {
  if (note && note.length > TEXT_LIMITS.personalNote) {
    return { ok: false, error: true };
  }
  const { error } = await supabase.rpc('update_my_memory_note', {
    p_id: memoryId,
    p_note: note,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function leaveMemory(
  memoryId: string,
  newLeaderId?: string | null,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('leave_memory', {
    p_id: memoryId,
    p_new_leader_id: newLeaderId ?? null,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function transferMemoryLeadership(
  memoryId: string,
  newLeaderId: string,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('transfer_memory_leadership', {
    p_memory_id: memoryId,
    p_new_leader_id: newLeaderId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function registerMemoryPhoto(input: {
  memoryId: string;
  mediaId: string;
  storagePath: string;
  mimeType: string;
  byteSize?: number | null;
}): Promise<RpcResult> {
  const { error } = await supabase.rpc('register_memory_photo', {
    p_memory_id: input.memoryId,
    p_media_id: input.mediaId,
    p_storage_path: input.storagePath,
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize ?? null,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function deleteMemoryPhoto(mediaId: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('delete_memory_photo', { p_media_id: mediaId });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function getMemoryPhotoSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('memories')
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
