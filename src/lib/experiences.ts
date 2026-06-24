import { supabase } from '@/lib/supabase';
import { Experience, ExperienceListItem } from '@/types/experience';

type RpcResult = { ok: boolean; error: boolean };

export type CreateExperienceInput = {
  title: string;
  description?: string | null;
  locationName?: string | null;
  startsAt: string;
  endsAt: string;
};

export type UpdateExperienceInput = CreateExperienceInput & {
  id: string;
};

function mapExperience(row: Record<string, unknown>): Experience {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    location_name: (row.location_name as string | null) ?? null,
    location_latitude: (row.location_latitude as number | null) ?? null,
    location_longitude: (row.location_longitude as number | null) ?? null,
    starts_at: row.starts_at as string,
    ends_at: row.ends_at as string,
    transform_at: row.transform_at as string,
    visibility: row.visibility as Experience['visibility'],
    status: row.status as Experience['status'],
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    purge_at: (row.purge_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapListItem(row: Record<string, unknown>): ExperienceListItem {
  return {
    id: row.id as string,
    title: row.title as string,
    location_name: (row.location_name as string | null) ?? null,
    location_latitude: (row.location_latitude as number | null) ?? null,
    location_longitude: (row.location_longitude as number | null) ?? null,
    starts_at: row.starts_at as string,
    ends_at: row.ends_at as string,
    transform_at: row.transform_at as string,
    status: row.status as ExperienceListItem['status'],
    purge_at: (row.purge_at as string | null) ?? null,
  };
}

export async function listMyHomeExperiences(): Promise<{
  data: ExperienceListItem[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_my_home_experiences');

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapListItem(row)),
    error: false,
  };
}

export async function getExperience(
  id: string,
): Promise<{ data: Experience | null; error: boolean }> {
  const { data, error } = await supabase.rpc('get_experience', { p_id: id });

  if (error) return { data: null, error: true };
  const rows = (data ?? []) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return { data: null, error: false };
  return { data: mapExperience(row), error: false };
}

export async function createExperience(
  input: CreateExperienceInput,
): Promise<{ data: string | null; error: boolean }> {
  const { data, error } = await supabase.rpc('create_experience', {
    p_title: input.title,
    p_description: input.description ?? null,
    p_location_name: input.locationName ?? null,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  });

  if (error) return { data: null, error: true };
  return { data: (data as string | null) ?? null, error: false };
}

export async function updateExperience(input: UpdateExperienceInput): Promise<RpcResult> {
  const { error } = await supabase.rpc('update_experience', {
    p_id: input.id,
    p_title: input.title,
    p_description: input.description ?? null,
    p_location_name: input.locationName ?? null,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  });

  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function cancelExperience(id: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('cancel_experience', { p_id: id });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function deleteExperience(id: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('delete_experience', { p_id: id });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}
