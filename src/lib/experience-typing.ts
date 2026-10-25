import { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * Ephemeral typing signals for the experience chat, carried by Supabase Realtime
 * Broadcast on a PRIVATE channel. Nothing here is persisted.
 *
 * Authorization lives in the database (`realtime.messages` policies, migration
 * 20260803140000): receiving needs `chat_read`, sending needs `chat_write`, so a
 * `leader_only` chat only lets the organizer broadcast. This module only wires the
 * channel; it never decides who may type.
 */

/** Sender: minimum gap between two `typing: true` broadcasts while keys keep arriving. */
export const TYPING_HEARTBEAT_MS = 3000;
/** Sender: stop (send `typing: false`) after this long without a keystroke. */
export const TYPING_IDLE_STOP_MS = 4000;
/**
 * Receiver: a typer expires this long after their last signal. Deliberately more
 * than one heartbeat so a single dropped packet doesn't flicker, but short enough
 * that a lost `typing: false` (crash, airplane mode) clears itself.
 */
export const TYPING_EXPIRY_MS = 6000;

const TYPING_EVENT = 'typing';
const MAX_NAME_LENGTH = 40;

export type TypingSignal = {
  userId: string;
  /** Display name as asserted by the sender; already sanitized. */
  name: string;
  typing: boolean;
};

export type ExperienceTypingHandlers = {
  onSignal: (signal: TypingSignal) => void;
  /** `true` once the channel is joined and it is safe to send. */
  onJoinedChange: (joined: boolean) => void;
};

export function experienceSignalsTopic(experienceId: string): string {
  return `experience-chat-signals:${experienceId}`;
}

/**
 * Validates and sanitizes an incoming broadcast payload. The sender identity is
 * client-asserted (Broadcast carries no verified sender), so treat every field as
 * untrusted: wrong shapes are dropped, names are stripped of control characters
 * and truncated.
 */
export function parseTypingSignal(payload: unknown): TypingSignal | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.userId !== 'string' || raw.userId.length === 0 || raw.userId.length > 64) {
    return null;
  }
  if (typeof raw.typing !== 'boolean') return null;

  const name =
    typeof raw.name === 'string'
      ? // eslint-disable-next-line no-control-regex
        raw.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH)
      : '';

  return { userId: raw.userId, name, typing: raw.typing };
}

export function subscribeExperienceTyping(
  experienceId: string,
  handlers: ExperienceTypingHandlers,
): RealtimeChannel {
  return supabase
    .channel(experienceSignalsTopic(experienceId), {
      // `self: false`: we never need our own signal echoed back.
      config: { private: true, broadcast: { self: false } },
    })
    .on('broadcast', { event: TYPING_EVENT }, ({ payload }) => {
      const signal = parseTypingSignal(payload);
      if (signal) handlers.onSignal(signal);
    })
    .subscribe((status) => {
      handlers.onJoinedChange(status === 'SUBSCRIBED');
    });
}

/**
 * Fire-and-forget broadcast. Callers must only invoke this while the channel is
 * joined: `RealtimeChannel.send()` silently falls back to the REST endpoint when
 * the channel is not joined, which is not the behavior we want for an ephemeral
 * signal. Failures are swallowed on purpose -- typing is never allowed to break
 * chat.
 */
export function sendTypingSignal(
  channel: RealtimeChannel,
  userId: string,
  name: string,
  typing: boolean,
): void {
  void channel
    .send({ type: 'broadcast', event: TYPING_EVENT, payload: { userId, name, typing } })
    .catch(() => undefined);
}

export function unsubscribeExperienceTyping(channel: RealtimeChannel | null): void {
  if (!channel) return;
  void supabase.removeChannel(channel);
}
