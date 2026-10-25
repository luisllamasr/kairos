import { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  sendTypingSignal,
  subscribeExperienceTyping,
  TYPING_EXPIRY_MS,
  TYPING_HEARTBEAT_MS,
  TYPING_IDLE_STOP_MS,
  TypingSignal,
  unsubscribeExperienceTyping,
} from '@/lib/experience-typing';

/** Upper bound on tracked typers, so a misbehaving client can't grow state without limit. */
const MAX_TRACKED_TYPERS = 10;

export type Typer = { userId: string; name: string };

type Options = {
  experienceId: string | null;
  /** Join the channel only once the chat itself is loaded and accessible. */
  enabled: boolean;
  /**
   * Whether the current user may send chat messages. Gates *sending* signals only
   * (the database also enforces this); a read-only participant still receives them.
   */
  canSend: boolean;
  myUserId: string | null;
  /** Display name broadcast to others (client-asserted; receivers sanitize it). */
  myName: string;
};

/**
 * Typing indicator state for one experience chat.
 *
 * Receive side: tracks everyone currently typing (several at once), each with its
 * own expiry, driven by a single timer aimed at the nearest expiry. Signals are
 * advisory -- a lost `typing: false` simply times out.
 *
 * Send side: leading-edge broadcast, a heartbeat at most every
 * `TYPING_HEARTBEAT_MS` while the user keeps typing, and a stop after
 * `TYPING_IDLE_STOP_MS` of silence, on empty input, blur, send, unmount, and when
 * the app leaves the foreground. Nothing is sent unless the channel is joined.
 *
 * Every failure here is silent by design: typing must never affect messages or
 * reactions.
 */
export function useExperienceTyping({
  experienceId,
  enabled,
  canSend,
  myUserId,
  myName,
}: Options) {
  const [typers, setTypers] = useState<Typer[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const joinedRef = useRef(false);

  // Latest option values for the stable callbacks below.
  const canSendRef = useRef(canSend);
  const myUserIdRef = useRef(myUserId);
  const myNameRef = useRef(myName);
  canSendRef.current = canSend;
  myUserIdRef.current = myUserId;
  myNameRef.current = myName;

  // Receive side.
  const typersRef = useRef(new Map<string, { name: string; expiresAt: number }>());
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signatureRef = useRef('');

  // Send side.
  const isTypingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishTypers = useCallback(() => {
    const next: Typer[] = [];
    typersRef.current.forEach((value, userId) => next.push({ userId, name: value.name }));
    // Heartbeats from the same typers must not re-render the chat screen.
    const signature = next.map((typer) => `${typer.userId}:${typer.name}`).join('|');
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;
    setTypers(next);
  }, []);

  const scheduleExpiry = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    let nearest = Infinity;
    typersRef.current.forEach((value) => {
      if (value.expiresAt < nearest) nearest = value.expiresAt;
    });
    if (nearest === Infinity) return;

    expiryTimerRef.current = setTimeout(
      () => {
        expiryTimerRef.current = null;
        const now = Date.now();
        typersRef.current.forEach((value, userId) => {
          if (value.expiresAt <= now) typersRef.current.delete(userId);
        });
        publishTypers();
        scheduleExpiry();
      },
      Math.max(0, nearest - Date.now()) + 10,
    );
  }, [publishTypers]);

  const handleSignal = useCallback(
    (signal: TypingSignal) => {
      if (signal.userId === myUserIdRef.current) return;

      const tracked = typersRef.current;
      if (signal.typing) {
        if (!tracked.has(signal.userId) && tracked.size >= MAX_TRACKED_TYPERS) return;
        // Re-setting an existing key keeps its position, so the display order is
        // "who started typing first".
        tracked.set(signal.userId, {
          name: signal.name,
          expiresAt: Date.now() + TYPING_EXPIRY_MS,
        });
      } else {
        tracked.delete(signal.userId);
      }
      publishTypers();
      scheduleExpiry();
    },
    [publishTypers, scheduleExpiry],
  );

  /** Returns whether the signal was actually handed to a joined channel. */
  const emit = useCallback((typing: boolean): boolean => {
    const channel = channelRef.current;
    const userId = myUserIdRef.current;
    if (!channel || !joinedRef.current || !userId || !canSendRef.current) return false;
    sendTypingSignal(channel, userId, myNameRef.current, typing);
    return true;
  }, []);

  const stopTyping = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (isTypingRef.current) emit(false);
    isTypingRef.current = false;
    lastSentAtRef.current = 0;
  }, [emit]);

  /** Call on every composer text change. */
  const handleTextChange = useCallback(
    (text: string) => {
      if (text.trim().length === 0) {
        stopTyping();
        return;
      }

      const now = Date.now();
      if (!isTypingRef.current || now - lastSentAtRef.current >= TYPING_HEARTBEAT_MS) {
        // Only record the send if it really happened (channel joined); otherwise the
        // next keystroke retries instead of waiting out a heartbeat that never went out.
        if (emit(true)) {
          isTypingRef.current = true;
          lastSentAtRef.current = now;
        }
      }

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_STOP_MS);
    },
    [emit, stopTyping],
  );

  // Channel lifecycle.
  useEffect(() => {
    if (!enabled || !experienceId) return;

    // The Map instance never changes for the lifetime of the hook.
    const tracked = typersRef.current;
    const channel = subscribeExperienceTyping(experienceId, {
      onSignal: handleSignal,
      onJoinedChange: (joined) => {
        joinedRef.current = joined;
        // A fresh (re)join starts from a clean sender state: the next keystroke
        // announces immediately.
        lastSentAtRef.current = 0;
        isTypingRef.current = false;
      },
    });
    channelRef.current = channel;

    return () => {
      // Best-effort `typing: false` while the channel is still joined; receivers
      // fall back to the expiry if it never arrives.
      stopTyping();
      joinedRef.current = false;
      channelRef.current = null;
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      tracked.clear();
      signatureRef.current = '';
      setTypers([]);
      unsubscribeExperienceTyping(channel);
    };
  }, [enabled, experienceId, handleSignal, stopTyping]);

  // Leaving the foreground ends our typing state immediately.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopTyping();
    });
    return () => subscription.remove();
  }, [stopTyping]);

  return { typers, handleTextChange, stopTyping };
}

export type UseExperienceTypingResult = ReturnType<typeof useExperienceTyping>;
