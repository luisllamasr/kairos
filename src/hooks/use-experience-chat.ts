import { RealtimeChannel } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList } from 'react-native';

import {
  deleteExperienceMessage,
  listExperienceMessages,
  mergeMessagesById,
  refreshMessageReactions,
  sendExperienceMessage,
  setExperienceMessageReaction,
  sortMessagesOldestFirst,
  subscribeExperienceChat,
  unsubscribeExperienceChat,
} from '@/lib/experience-chat';
import { getExperience } from '@/lib/experiences';
import { ensureExperienceTransformed } from '@/lib/memories';
import {
  canAccessExperienceChat,
  canReactExperienceChat,
  canSendExperienceChat,
  Experience,
  isExperienceEnded,
} from '@/types/experience';

const PAGE_SIZE = 50;

/**
 * All data/realtime/mutation state for the experience chat screen. Owns the
 * FlatList ref (needed to scroll after data arrives) and the picker-dismiss
 * scroll-offset refs (needed because dismissing the picker after a reaction
 * or delete must restore the same scroll position as an explicit tap-to-dismiss —
 * see `dismissReactionPicker`). Everything about measuring/positioning the
 * *rendered* picker within the viewport (which requires live layout refs to
 * the actual JSX tree) stays in the screen component instead.
 */
export function useExperienceChat(experienceId: string | null, myUserId: string | null) {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [messages, setMessages] = useState<ReturnType<typeof sortMessagesOldestFirst>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);

  const listRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottomRef = useRef(true);
  const scrollOffsetAtPickerOpenRef = useRef(0);
  const scrollOffsetOnDismissRef = useRef<number | null>(null);

  // Stale-response guards: async loads below can resolve out of order (slow
  // retry resolving after a fresh one, a realtime reaction event racing a
  // locally-triggered reaction refresh for the same message, etc.). Each
  // guarded section captures a generation number before starting and checks
  // it's still current before touching state, so only the *last-started*
  // call for a given target is allowed to win — never just the last to finish.
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const reloadGenerationRef = useRef(0);
  const reactionGenerationRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const bumpReactionGeneration = useCallback((messageId: string): number => {
    const next = (reactionGenerationRef.current.get(messageId) ?? 0) + 1;
    reactionGenerationRef.current.set(messageId, next);
    return next;
  }, []);

  const trimmedComposer = composerText.trim();
  const canSendBody = trimmedComposer.length > 0;

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  /**
   * Dismissing after a reaction/delete must look identical to an explicit
   * tap-to-dismiss: it restores the scroll offset captured when the picker
   * was opened (`scrollOffsetAtPickerOpenRef`, written by the screen's
   * long-press handler) via the effect below, rather than letting the list
   * jump when the picker's row shrinks back down.
   */
  const dismissReactionPicker = useCallback(() => {
    scrollOffsetOnDismissRef.current = scrollOffsetAtPickerOpenRef.current;
    setReactionTargetId(null);
  }, []);

  useEffect(() => {
    if (reactionTargetId !== null) return;

    const lockedOffset = scrollOffsetOnDismissRef.current;
    if (lockedOffset === null) return;

    scrollOffsetOnDismissRef.current = null;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: lockedOffset, animated: false });
    });
  }, [reactionTargetId]);

  const reloadRecentMessages = useCallback(async () => {
    if (!experienceId) return;
    const generation = ++reloadGenerationRef.current;

    const { data, error: loadError } = await listExperienceMessages(experienceId, null, PAGE_SIZE);
    if (loadError) return;
    if (!mountedRef.current || reloadGenerationRef.current !== generation) return;

    setMessages((current) => mergeMessagesById(current, sortMessagesOldestFirst(data)));
    setHasOlder(data.length >= PAGE_SIZE);
    if (stickToBottomRef.current) scrollToBottom(false);
  }, [experienceId, scrollToBottom]);

  const scheduleReloadRecentMessages = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void reloadRecentMessages();
    }, 150);
  }, [reloadRecentMessages]);

  const loadInitial = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const isStale = () => !mountedRef.current || loadGenerationRef.current !== generation;

    if (!experienceId) {
      setExperience(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    setActionError(null);

    const { data: exp, error: expError } = await getExperience(experienceId);
    if (isStale()) return;
    if (expError || !exp) {
      setExperience(null);
      setMessages([]);
      setError(true);
      setLoading(false);
      return;
    }

    if (!canAccessExperienceChat(exp)) {
      setExperience(null);
      setMessages([]);
      setError(true);
      setLoading(false);
      return;
    }

    const ended = isExperienceEnded(exp);
    if (ended && exp.status !== 'cancelled') {
      const { data: memoryId } = await ensureExperienceTransformed(experienceId);
      if (isStale()) return;
      if (memoryId) {
        router.replace({
          pathname: '/(app)/(profile)/memories/[id]',
          params: { id: memoryId },
        });
        return;
      }
    }

    const { data, error: messagesError } = await listExperienceMessages(experienceId, null, PAGE_SIZE);
    if (isStale()) return;
    if (messagesError) {
      setExperience(exp);
      setMessages([]);
      setError(true);
      setLoading(false);
      return;
    }

    setExperience(exp);
    setMessages(sortMessagesOldestFirst(data));
    setHasOlder(data.length >= PAGE_SIZE);
    setLoading(false);
    stickToBottomRef.current = true;
  }, [experienceId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom(false);
    }
  }, [loading, messages.length, scrollToBottom]);

  useEffect(() => {
    if (!experienceId || loading || error || !experience) return;

    const channel = subscribeExperienceChat(
      experienceId,
      (messageId) => messageIdsRef.current.has(messageId),
      {
        onMessagesChange: scheduleReloadRecentMessages,
        onReactionChange: (messageId) => {
          const generation = bumpReactionGeneration(messageId);
          void refreshMessageReactions(messageId).then(({ reactions, error: reactError }) => {
            if (reactError) return;
            if (!mountedRef.current || reactionGenerationRef.current.get(messageId) !== generation) return;
            setMessages((current) =>
              current.map((message) =>
                message.id === messageId ? { ...message, reactions } : message,
              ),
            );
          });
        },
      },
    );

    channelRef.current = channel;
    return () => {
      unsubscribeExperienceChat(channelRef.current);
      channelRef.current = null;
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [experience, experienceId, error, loading, scheduleReloadRecentMessages, bumpReactionGeneration]);

  const canSend = experience ? canSendExperienceChat(experience) : false;
  const canReact = experience ? canReactExperienceChat(experience) : false;

  async function loadOlderMessages() {
    if (!experienceId || loadingOlder || !hasOlder || messages.length === 0) return;

    setLoadingOlder(true);
    stickToBottomRef.current = false;
    const oldest = messages[0];
    const { data, error: loadError } = await listExperienceMessages(
      experienceId,
      oldest.created_at,
      PAGE_SIZE,
    );
    setLoadingOlder(false);

    if (loadError) return;
    if (data.length === 0) {
      setHasOlder(false);
      return;
    }

    setMessages((current) => mergeMessagesById(current, sortMessagesOldestFirst(data)));
    if (data.length < PAGE_SIZE) setHasOlder(false);
  }

  async function sendMessage(sendErrorLabel: string) {
    if (!experienceId || !canSend || sending || !canSendBody) return;

    setSending(true);
    setActionError(null);
    const result = await sendExperienceMessage(experienceId, trimmedComposer);
    setSending(false);

    if (result.error) {
      setActionError(sendErrorLabel);
      return;
    }

    setComposerText('');
    stickToBottomRef.current = true;
    await reloadRecentMessages();
    scrollToBottom(true);
  }

  async function deleteMessage(messageId: string, deleteErrorLabel: string) {
    setActionError(null);
    const result = await deleteExperienceMessage(messageId);
    if (result.error) {
      setActionError(deleteErrorLabel);
      return;
    }
    setMessages((current) => current.filter((message) => message.id !== messageId));
    if (reactionTargetId === messageId) dismissReactionPicker();
  }

  async function reactToMessage(messageId: string, emoji: string, reactErrorLabel: string) {
    if (!canReact) return;

    setActionError(null);
    const message = messages.find((item) => item.id === messageId);
    const existing = message?.reactions.find((reaction) => reaction.user_id === myUserId);
    const nextEmoji = existing?.emoji === emoji ? null : emoji;

    const result = await setExperienceMessageReaction(messageId, nextEmoji);
    if (result.error) {
      setActionError(reactErrorLabel);
      return;
    }

    dismissReactionPicker();
    const generation = bumpReactionGeneration(messageId);
    const { reactions, error: reactError } = await refreshMessageReactions(messageId);
    if (reactError) return;
    if (!mountedRef.current || reactionGenerationRef.current.get(messageId) !== generation) return;
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, reactions } : item)),
    );
  }

  return {
    experience,
    messages,
    loading,
    loadingOlder,
    hasOlder,
    error,
    actionError,
    canSend,
    canReact,
    composerText,
    setComposerText,
    sending,
    canSendBody,
    reactionTargetId,
    setReactionTargetId,
    dismissReactionPicker,
    listRef,
    stickToBottomRef,
    scrollOffsetAtPickerOpenRef,
    loadInitial,
    loadOlderMessages,
    sendMessage,
    deleteMessage,
    reactToMessage,
  };
}

export type UseExperienceChatResult = ReturnType<typeof useExperienceChat>;
