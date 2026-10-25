import { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { ExperienceMessage, ExperienceMessageReaction } from '@/types/experience-chat';

type RpcResult = { ok: boolean; error: boolean };

function mapReaction(raw: unknown): ExperienceMessageReaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.user_id !== 'string' || typeof row.emoji !== 'string') return null;
  return {
    user_id: row.user_id,
    emoji: row.emoji,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function mapMessage(row: Record<string, unknown>): ExperienceMessage {
  const reactionsRaw = row.reactions;
  const reactions = Array.isArray(reactionsRaw)
    ? reactionsRaw
        .map((item) => mapReaction(item))
        .filter((item): item is ExperienceMessageReaction => item !== null)
    : [];

  return {
    id: row.id as string,
    experience_id: row.experience_id as string,
    author_id: (row.author_id as string | null) ?? null,
    body: row.body as string,
    created_at: row.created_at as string,
    author_username: (row.author_username as string | null) ?? null,
    author_display_name: (row.author_display_name as string | null) ?? null,
    author_avatar_url: (row.author_avatar_url as string | null) ?? null,
    reactions,
  };
}

/** Newest-first order (matches RPC); reverse for inverted list display. */
export async function listExperienceMessages(
  experienceId: string,
  before?: string | null,
  limit = 50,
): Promise<{ data: ExperienceMessage[]; error: boolean }> {
  const { data, error } = await supabase.rpc('list_experience_messages', {
    p_experience_id: experienceId,
    p_before: before ?? null,
    p_limit: limit,
  });

  if (error) return { data: [], error: true };
  return {
    data: (data ?? []).map((row: Record<string, unknown>) => mapMessage(row)),
    error: false,
  };
}

export async function sendExperienceMessage(
  experienceId: string,
  body: string,
): Promise<{ data: string | null; error: boolean }> {
  const { data, error } = await supabase.rpc('send_experience_message', {
    p_experience_id: experienceId,
    p_body: body,
  });

  if (error) return { data: null, error: true };
  return { data: (data as string | null) ?? null, error: false };
}

export async function deleteExperienceMessage(messageId: string): Promise<RpcResult> {
  const { error } = await supabase.rpc('delete_experience_message', {
    p_message_id: messageId,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export async function setExperienceMessageReaction(
  messageId: string,
  emoji: string | null,
): Promise<RpcResult> {
  const { error } = await supabase.rpc('set_experience_message_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) return { ok: false, error: true };
  return { ok: true, error: false };
}

export type ExperienceChatRealtimeHandlers = {
  onMessagesChange: () => void;
  onReactionChange: (messageId: string) => void;
  /**
   * Fired every time the channel reaches SUBSCRIBED -- the first join AND every
   * automatic rejoin after a dropped socket. postgres_changes delivers nothing
   * that happened before the join (or while disconnected), and `SUBSCRIBED` can
   * even precede the server-side change subscription being fully ready, so the
   * caller should refetch recent state here to close that gap.
   */
  onSubscribed: () => void;
};

/**
 * Private channel: joining requires the `experience_chat_channel_read` policy on
 * `realtime.messages` (participant + `chat_read`). Table RLS on the underlying
 * rows still applies on top of that for the messages binding.
 *
 * Reactions deliberately have NO `postgres_changes` binding: Realtime does not
 * apply RLS to DELETE events, so that binding leaked every reaction removal to
 * any subscriber. A database trigger (migration 20260803150000) sends a private
 * Broadcast `reaction_changed` carrying only `message_id` to this topic instead;
 * the handler below refetches that message's reactions through the RLS-protected
 * RPC, so nothing but the id travels in the event.
 */
export function subscribeExperienceChat(
  experienceId: string,
  hasMessageId: (messageId: string) => boolean,
  handlers: ExperienceChatRealtimeHandlers,
): RealtimeChannel {
  return supabase
    .channel(`experience-chat:${experienceId}`, { config: { private: true } })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'experience_messages',
        filter: `experience_id=eq.${experienceId}`,
      },
      () => {
        handlers.onMessagesChange();
      },
    )
    .on('broadcast', { event: 'reaction_changed' }, ({ payload }) => {
      const messageId = (payload as { message_id?: unknown } | null)?.message_id;
      if (typeof messageId !== 'string' || !hasMessageId(messageId)) return;
      handlers.onReactionChange(messageId);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') handlers.onSubscribed();
    });
}

export function unsubscribeExperienceChat(channel: RealtimeChannel | null): void {
  if (!channel) return;
  void supabase.removeChannel(channel);
}

/** Oldest first — for inverted FlatList (newest at bottom). */
export function sortMessagesOldestFirst(messages: ExperienceMessage[]): ExperienceMessage[] {
  return [...messages].sort((a, b) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
}

export function messageAuthorLabel(
  message: Pick<
    ExperienceMessage,
    'author_id' | 'author_display_name' | 'author_username'
  >,
  deletedUserLabel: string,
): string {
  if (!message.author_id) return deletedUserLabel;
  return message.author_display_name ?? message.author_username ?? deletedUserLabel;
}

export function mergeMessagesById(
  current: ExperienceMessage[],
  incoming: ExperienceMessage[],
): ExperienceMessage[] {
  const map = new Map<string, ExperienceMessage>();
  for (const message of current) {
    map.set(message.id, message);
  }
  for (const message of incoming) {
    map.set(message.id, message);
  }
  return sortMessagesOldestFirst(Array.from(map.values()));
}

function aggregateReactions(
  reactions: ExperienceMessageReaction[],
): { emoji: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const reaction of reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
}

export function formatAggregatedReactions(
  reactions: ExperienceMessageReaction[],
): { emoji: string; count: number }[] {
  return aggregateReactions(reactions);
}

export async function refreshMessageReactions(
  messageId: string,
): Promise<{ reactions: ExperienceMessageReaction[]; error: boolean }> {
  const { data, error } = await supabase.rpc('get_experience_message_reactions', {
    p_message_id: messageId,
  });
  if (error) return { reactions: [], error: true };
  const reactions = Array.isArray(data)
    ? data
        .map((item) => mapReaction(item))
        .filter((item): item is ExperienceMessageReaction => item !== null)
    : [];
  return { reactions, error: false };
}
