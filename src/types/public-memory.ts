// Privacy v1 public read types (docs/PROJECT.md §6). These never carry
// participant identities — only a participant_count — and are distinct from
// the participant-side types in @/types/memory.

/** Full memory detail from get_public_memory, for a viewer who does not participate. */
export type PublicMemory = {
  id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  happened_starts_at: string;
  happened_ends_at: string;
  /** Active (non-left) participant count. Never exposes participant identities. */
  participant_count: number;
};

/** Media for a public memory read, from list_public_memory_media — no uploader identity. */
export type PublicMemoryMedia = {
  id: string;
  storage_path: string;
  mime_type: string;
  sort_order: number;
};
