export type MemoryPermissionPolicy = 'all_participants' | 'leader_only';

export type MemoryParticipantRole = 'organizer' | 'participant';

export type MemoryListItem = {
  id: string;
  title: string;
  location_name: string | null;
  happened_starts_at: string;
  happened_ends_at: string;
};

export type Memory = {
  id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  happened_starts_at: string;
  happened_ends_at: string;
  transformed_at: string;
  leader_id: string | null;
  edit_info_policy: MemoryPermissionPolicy;
  add_media_policy: MemoryPermissionPolicy;
  my_personal_note: string | null;
  am_leader: boolean;
  updated_at: string;
};

export type MemoryParticipant = {
  participant_id: string;
  user_id: string | null;
  role: MemoryParticipantRole;
  joined_at: string;
  left_at: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type MemoryMedia = {
  id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number | null;
  sort_order: number;
  created_at: string;
  uploaded_by_user_id: string | null;
};

export function isMemoryParticipantActive(
  participant: Pick<MemoryParticipant, 'user_id' | 'left_at'>,
): boolean {
  return participant.user_id !== null && participant.left_at === null;
}

/** Uploader or memory leader may delete a photo (matches delete_memory_photo RPC). */
export function canDeleteMemoryPhoto(
  media: Pick<MemoryMedia, 'uploaded_by_user_id'>,
  memory: Pick<Memory, 'am_leader'>,
  myUserId: string | null,
): boolean {
  if (!myUserId) return false;
  if (media.uploaded_by_user_id === myUserId) return true;
  return memory.am_leader;
}

export function memoryParticipantDisplayName(
  participant: Pick<MemoryParticipant, 'user_id' | 'display_name' | 'username'>,
  labels: { deletedUser: string; unknown: string },
): string {
  if (participant.user_id === null) {
    return labels.deletedUser;
  }
  return participant.display_name ?? participant.username ?? labels.unknown;
}

export function memoryMediaUploaderDisplayName(
  media: Pick<MemoryMedia, 'uploaded_by_user_id'>,
  participants: MemoryParticipant[],
  labels: { deletedUser: string; unknown: string },
): string {
  if (media.uploaded_by_user_id === null) {
    return labels.deletedUser;
  }
  const match = participants.find((p) => p.user_id === media.uploaded_by_user_id);
  if (!match) {
    return labels.deletedUser;
  }
  return memoryParticipantDisplayName(match, labels);
}
