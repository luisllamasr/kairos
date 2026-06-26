import { supabase } from '@/lib/supabase';
import { NotificationRecord } from '@/types/notification';

type RpcResult = { ok: boolean; error: boolean };

function mapNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: row.id as string,
    type: row.type as string,
    entity_type: row.entity_type as string,
    entity_id: (row.entity_id as string | null) ?? null,
    actor_id: (row.actor_id as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    read_at: (row.read_at as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export async function listNotifications(limit = 50): Promise<{
  data: NotificationRecord[];
  error: boolean;
}> {
  const { data, error } = await supabase.rpc('list_notifications', { p_limit: limit });

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapNotification(row)),
    error: false,
  };
}

export async function countUnreadNotifications(): Promise<{ count: number; error: boolean }> {
  const { data, error } = await supabase.rpc('count_unread_notifications');
  if (error) return { count: 0, error: true };
  return { count: (data as number) ?? 0, error: false };
}

export async function markNotificationRead(notificationId: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function setMemoryNotificationsMuted(
  memoryId: string,
  muted: boolean,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('set_memory_notifications_muted', {
    p_memory_id: memoryId,
    p_muted: muted,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}
