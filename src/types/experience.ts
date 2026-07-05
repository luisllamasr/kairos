import { MemoryPermissionPolicy } from '@/types/memory';

export type ExperienceStatus = 'planned' | 'cancelled';
export type ExperienceVisibility = 'private' | 'public';
export type ExperienceInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type ExperienceInviteSuggestionStatus = 'pending' | 'approved' | 'rejected';

export type Experience = {
  id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  starts_at: string;
  ends_at: string;
  transform_at: string;
  visibility: ExperienceVisibility;
  status: ExperienceStatus;
  cancelled_at: string | null;
  purge_at: string | null;
  organizer_id: string | null;
  edit_info_policy: MemoryPermissionPolicy;
  chat_policy: MemoryPermissionPolicy;
  am_organizer: boolean;
  am_participant: boolean;
  pending_invitation_id: string | null;
  can_revive: boolean;
  can_send_chat: boolean;
  can_react_chat: boolean;
  notifications_muted: boolean;
  created_at: string;
  updated_at: string;
};

export type ExperienceListItem = {
  id: string;
  title: string;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  starts_at: string;
  ends_at: string;
  transform_at: string;
  status: ExperienceStatus;
  purge_at: string | null;
  organizer_id: string | null;
  am_organizer: boolean;
};

export type ExperienceParticipant = {
  participant_id: string;
  user_id: string;
  joined_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_organizer: boolean;
};

export type ExperienceInvitation = {
  invitation_id: string;
  invitee_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: ExperienceInvitationStatus;
  created_at: string;
  responded_at: string | null;
};

export type IncomingExperienceInvitation = {
  invitation_id: string;
  experience_id: string;
  experience_title: string;
  starts_at: string;
  invited_by: string;
  inviter_username: string | null;
  inviter_display_name: string | null;
  created_at: string;
};

export type ExperienceInviteSuggestion = {
  suggestion_id: string;
  suggested_by: string;
  suggester_username: string | null;
  suggester_display_name: string | null;
  suggested_user_id: string;
  suggested_username: string | null;
  suggested_display_name: string | null;
  status: ExperienceInviteSuggestionStatus;
  created_at: string;
  reviewed_at: string | null;
};

export function isExperienceUpcoming(
  experience: Pick<Experience, 'status' | 'transform_at'>,
): boolean {
  if (experience.status !== 'planned') return false;
  return new Date(experience.transform_at).getTime() > Date.now();
}

export function isExperienceEnded(
  experience: Pick<Experience, 'status' | 'transform_at'>,
): boolean {
  return experience.status === 'planned' && new Date(experience.transform_at).getTime() <= Date.now();
}

/** Planned row still on Home after transform_at until transform DELETEs the experience. */
export function isExperienceBecomingMemory(
  experience: Pick<ExperienceListItem, 'status' | 'transform_at'>,
): boolean {
  return isExperienceEnded(experience);
}

export function isExperiencePurgePending(
  experience: Pick<Experience, 'status' | 'purge_at'>,
): boolean {
  if (experience.status !== 'cancelled' || !experience.purge_at) return false;
  return new Date(experience.purge_at).getTime() > Date.now();
}

/** Cancelled plans keep `organizer_id` in the DB but have no active leader for permissions. */
export function hasActiveExperienceLeader(
  experience: Pick<Experience, 'status'>,
): boolean {
  return experience.status === 'planned';
}

export function canRemoveExperience(experience: Experience): boolean {
  return (
    experience.am_participant &&
    experience.am_organizer &&
    hasActiveExperienceLeader(experience) &&
    isExperienceUpcoming(experience)
  );
}

export function canManageExperienceParticipants(experience: Experience): boolean {
  return (
    experience.am_participant &&
    experience.am_organizer &&
    hasActiveExperienceLeader(experience) &&
    isExperienceUpcoming(experience)
  );
}

export function canEditExperience(experience: Experience): boolean {
  if (!experience.am_participant) return false;
  if (!isExperienceUpcoming(experience)) return false;
  if (experience.edit_info_policy === 'leader_only' && !experience.am_organizer) return false;
  return true;
}

export function canCancelExperience(experience: Experience): boolean {
  return (
    experience.am_participant &&
    experience.am_organizer &&
    hasActiveExperienceLeader(experience) &&
    isExperienceUpcoming(experience)
  );
}

export function canLeaveExperience(experience: Experience): boolean {
  if (!experience.am_participant) return false;
  return isExperienceUpcoming(experience) || isExperiencePurgePending(experience);
}

/** Solo planned leader must delete the plan; cancelled participants (including ex-leader) may always leave. */
export function canLeaveExperienceNow(
  experience: Experience,
  participantCount: number,
): boolean {
  if (!canLeaveExperience(experience)) return false;
  if (
    hasActiveExperienceLeader(experience) &&
    experience.am_organizer &&
    participantCount <= 1
  ) {
    return false;
  }
  return true;
}

export function canReviveExperience(experience: Experience): boolean {
  return experience.am_participant && experience.can_revive;
}

/** Chat-eligible lifecycle + accepted participant (matches SQL `chat_read` floor). */
export function canAccessExperienceChat(
  experience: Pick<Experience, 'am_participant' | 'status'>,
): boolean {
  if (!experience.am_participant) return false;
  return experience.status === 'planned' || experience.status === 'cancelled';
}

export function canSendExperienceChat(experience: Experience): boolean {
  return canAccessExperienceChat(experience) && experience.can_send_chat;
}

export function canReactExperienceChat(experience: Experience): boolean {
  return canAccessExperienceChat(experience) && experience.can_react_chat;
}

export function isPendingExperienceInvitee(
  experience: Pick<Experience, 'pending_invitation_id'>,
): boolean {
  return experience.pending_invitation_id !== null;
}

export function experienceParticipantDisplayName(
  participant: Pick<ExperienceParticipant, 'display_name' | 'username'>,
  unknownLabel: string,
): string {
  return participant.display_name ?? participant.username ?? unknownLabel;
}
