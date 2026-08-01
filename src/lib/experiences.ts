import { supabase } from '@/lib/supabase';
import {
  Experience,
  ExperienceInvitation,
  ExperienceInviteSuggestion,
  ExperienceListItem,
  ExperienceParticipant,
  IncomingExperienceInvitation,
} from '@/types/experience';

type RpcResult = { ok: boolean; error: boolean; errorCode?: string };

/** Postgres RAISE EXCEPTION messages we map to specific UI copy. */
export type ExperienceInviteErrorCode =
  | 'suggestion pending'
  | 'invite pending'
  | 'already participant'
  | 'invite blocked'
  | 'not friends'
  | 'invites closed'
  | 'not friends with leader';

function rpcErrorCode(error: { message?: string } | null): string | undefined {
  const message = error?.message?.trim();
  return message && message.length > 0 ? message : undefined;
}

export type CreateExperienceInput = {
  title: string;
  description?: string | null;
  locationName?: string | null;
  startsAt: string;
  endsAt: string;
  inviteeIds?: string[];
};

export type UpdateExperienceInput = CreateExperienceInput & {
  id: string;
  expectedUpdatedAt?: string;
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
    organizer_id: (row.organizer_id as string | null) ?? null,
    edit_info_policy: row.edit_info_policy as Experience['edit_info_policy'],
    chat_policy: row.chat_policy as Experience['chat_policy'],
    am_organizer: Boolean(row.am_organizer),
    am_participant: Boolean(row.am_participant),
    pending_invitation_id: (row.pending_invitation_id as string | null) ?? null,
    can_revive: Boolean(row.can_revive),
    can_send_chat: Boolean(row.can_send_chat),
    can_react_chat: Boolean(row.can_react_chat),
    notifications_muted: Boolean(row.notifications_muted),
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
    organizer_id: (row.organizer_id as string | null) ?? null,
    am_organizer: Boolean(row.am_organizer),
  };
}

function mapParticipant(row: Record<string, unknown>): ExperienceParticipant {
  return {
    participant_id: row.participant_id as string,
    user_id: row.user_id as string,
    joined_at: row.joined_at as string,
    username: (row.username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    is_organizer: Boolean(row.is_organizer),
  };
}

function mapInvitation(row: Record<string, unknown>): ExperienceInvitation {
  return {
    invitation_id: row.invitation_id as string,
    invitee_id: row.invitee_id as string,
    username: (row.username as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    status: row.status as ExperienceInvitation['status'],
    created_at: row.created_at as string,
    responded_at: (row.responded_at as string | null) ?? null,
  };
}

function mapIncomingInvitation(row: Record<string, unknown>): IncomingExperienceInvitation {
  return {
    invitation_id: row.invitation_id as string,
    experience_id: row.experience_id as string,
    experience_title: row.experience_title as string,
    starts_at: row.starts_at as string,
    invited_by: row.invited_by as string,
    inviter_username: (row.inviter_username as string | null) ?? null,
    inviter_display_name: (row.inviter_display_name as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

function mapSuggestion(row: Record<string, unknown>): ExperienceInviteSuggestion {
  return {
    suggestion_id: row.suggestion_id as string,
    suggested_by: row.suggested_by as string,
    suggester_username: (row.suggester_username as string | null) ?? null,
    suggester_display_name: (row.suggester_display_name as string | null) ?? null,
    suggested_user_id: row.suggested_user_id as string,
    suggested_username: (row.suggested_username as string | null) ?? null,
    suggested_display_name: (row.suggested_display_name as string | null) ?? null,
    status: row.status as ExperienceInviteSuggestion['status'],
    created_at: row.created_at as string,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
  };
}

export async function purgeMyStaleExperiences(): Promise<RpcResult> {
  const { error } = await supabase.rpc('purge_my_stale_experiences');
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
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

export async function listExperienceParticipants(experienceId: string): Promise<{
  data: ExperienceParticipant[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_experience_participants', {
    p_experience_id: experienceId,
  });

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapParticipant(row)),
    error: false,
  };
}

export async function listIncomingExperienceInvitations(): Promise<{
  data: IncomingExperienceInvitation[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_incoming_experience_invitations');

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapIncomingInvitation(row)),
    error: false,
  };
}

export async function listExperienceInvitations(experienceId: string): Promise<{
  data: ExperienceInvitation[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_experience_invitations', {
    p_experience_id: experienceId,
  });

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapInvitation(row)),
    error: false,
  };
}

export async function listExperienceInviteSuggestions(experienceId: string): Promise<{
  data: ExperienceInviteSuggestion[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_experience_invite_suggestions', {
    p_experience_id: experienceId,
  });

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapSuggestion(row)),
    error: false,
  };
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
    p_invitee_ids:
      input.inviteeIds && input.inviteeIds.length > 0 ? input.inviteeIds : null,
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
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });

  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function cancelExperience(id: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('cancel_experience', { p_id: id });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

/**
 * Hard-deletes an experience for everyone. Not used by the product UI —
 * participants exit via `leaveExperience`; last leave orphans/purges the row.
 * Kept for admin/internal callers and parity with the RPC surface.
 */
export async function deleteExperience(id: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('delete_experience', { p_id: id });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function reviveExperience(id: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('revive_experience', { p_id: id });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function leaveExperience(
  id: string,
  newOrganizerId?: string | null,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('leave_experience', {
    p_id: id,
    p_new_organizer_id: newOrganizerId ?? null,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function removeExperienceParticipant(
  experienceId: string,
  userId: string,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('remove_experience_participant', {
    p_experience_id: experienceId,
    p_user_id: userId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function transferExperienceLeadership(
  experienceId: string,
  newOrganizerId: string,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('transfer_experience_leadership', {
    p_experience_id: experienceId,
    p_new_organizer_id: newOrganizerId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export type ExperienceBatchSocialFailure = {
  userId: string;
  errorCode: string;
};

export type ExperienceBatchSocialResult = {
  sent: string[];
  failures: ExperienceBatchSocialFailure[];
  /** True when the RPC itself failed (auth, not allowed, etc.). */
  error: boolean;
  errorCode?: string;
};

function mapBatchSocialResult(data: unknown): ExperienceBatchSocialResult {
  const row = (data ?? {}) as { sent?: unknown; failures?: unknown };
  const sent = Array.isArray(row.sent)
    ? row.sent.filter((id): id is string => typeof id === 'string')
    : [];
  const failures: ExperienceBatchSocialFailure[] = Array.isArray(row.failures)
    ? row.failures
        .map((item) => {
          const failure = item as { user_id?: unknown; error?: unknown };
          if (typeof failure.user_id !== 'string' || typeof failure.error !== 'string') {
            return null;
          }
          return { userId: failure.user_id, errorCode: failure.error.trim() };
        })
        .filter((item): item is ExperienceBatchSocialFailure => item !== null)
    : [];
  return { sent, failures, error: false };
}

export async function sendExperienceInvitation(
  experienceId: string,
  inviteeId: string,
): Promise<{ data: string | null; error: boolean; errorCode?: string }> {
  const { data, error } = await supabase.rpc('send_experience_invitation', {
    p_experience_id: experienceId,
    p_invitee_id: inviteeId,
  });
  if (error) return { data: null, error: true, errorCode: rpcErrorCode(error) };
  return { data: (data as string | null) ?? null, error: false };
}

export async function sendExperienceInvitations(
  experienceId: string,
  inviteeIds: string[],
): Promise<ExperienceBatchSocialResult> {
  const { data, error } = await supabase.rpc('send_experience_invitations', {
    p_experience_id: experienceId,
    p_invitee_ids: inviteeIds,
  });
  if (error) {
    return { sent: [], failures: [], error: true, errorCode: rpcErrorCode(error) };
  }
  return mapBatchSocialResult(data);
}

export async function acceptExperienceInvitation(invitationId: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('accept_experience_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function declineExperienceInvitation(invitationId: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('decline_experience_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function suggestExperienceInvite(
  experienceId: string,
  suggestedUserId: string,
): Promise<{ data: string | null; error: boolean; errorCode?: string }> {
  const { data, error } = await supabase.rpc('suggest_experience_invite', {
    p_experience_id: experienceId,
    p_suggested_user_id: suggestedUserId,
  });
  if (error) return { data: null, error: true, errorCode: rpcErrorCode(error) };
  return { data: (data as string | null) ?? null, error: false };
}

export async function suggestExperienceInvites(
  experienceId: string,
  suggestedUserIds: string[],
): Promise<ExperienceBatchSocialResult> {
  const { data, error } = await supabase.rpc('suggest_experience_invites', {
    p_experience_id: experienceId,
    p_suggested_user_ids: suggestedUserIds,
  });
  if (error) {
    return { sent: [], failures: [], error: true, errorCode: rpcErrorCode(error) };
  }
  return mapBatchSocialResult(data);
}

export async function reviewExperienceInviteSuggestion(
  suggestionId: string,
  approve: boolean,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('review_experience_invite_suggestion', {
    p_suggestion_id: suggestionId,
    p_approve: approve,
  });
  if (error) return { ok: false, error: true, errorCode: rpcErrorCode(error) };
  return { ok: true, error: false };
}

export async function withdrawExperienceInvitation(invitationId: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('withdraw_experience_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) return { ok: false, error: true, errorCode: rpcErrorCode(error) };
  return { ok: true, error: false };
}

export async function withdrawExperienceInviteSuggestion(
  suggestionId: string,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('withdraw_experience_invite_suggestion', {
    p_suggestion_id: suggestionId,
  });
  if (error) return { ok: false, error: true, errorCode: rpcErrorCode(error) };
  return { ok: true, error: false };
}

export async function setExperienceNotificationsMuted(
  experienceId: string,
  muted: boolean,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('set_experience_notifications_muted', {
    p_experience_id: experienceId,
    p_muted: muted,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}
