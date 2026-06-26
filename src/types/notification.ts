export type NotificationRecord = {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};
