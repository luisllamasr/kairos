import { RealtimeChannel } from '@supabase/supabase-js';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import {
  deleteExperienceMessage,
  formatAggregatedReactions,
  listExperienceMessages,
  mergeMessagesById,
  messageAuthorLabel,
  refreshMessageReactions,
  sendExperienceMessage,
  setExperienceMessageReaction,
  sortMessagesOldestFirst,
  subscribeExperienceChat,
  unsubscribeExperienceChat,
} from '@/lib/experience-chat';
import { getExperience } from '@/lib/experiences';
import { ensureExperienceTransformed } from '@/lib/memories';
import { getAvatarPublicUrl } from '@/lib/profile';
import { EXPERIENCE_CHAT_EMOJIS } from '@/types/experience-chat';
import {
  canAccessExperienceChat,
  canReactExperienceChat,
  canSendExperienceChat,
  Experience,
  isExperienceEnded,
} from '@/types/experience';

const PAGE_SIZE = 50;
const MESSAGE_MAX_LENGTH = 2000;
const LOAD_OLDER_THRESHOLD = 48;
const PICKER_SCROLL_BUFFER = 14;
const MESSAGE_ROW_GAP = Spacing.xs;

export default function ExperienceChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const myUserId = session?.user.id ?? null;

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
  const listViewportRef = useRef<View>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const pickerRefs = useRef<Record<string, View | null>>({});
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollOffsetRef = useRef(0);
  const scrollOffsetAtPickerOpenRef = useRef(0);
  const scrollOffsetOnDismissRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  const experienceId = typeof id === 'string' ? id : null;

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const deletedUserLabel = t('memories.participant.deletedUser');
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

  const setPickerRef = useCallback((messageId: string) => {
    return (node: View | null) => {
      pickerRefs.current[messageId] = node;
    };
  }, []);

  const scrollPickerIntoView = useCallback((messageId: string) => {
    const pickerRef = pickerRefs.current[messageId];
    const viewportRef = listViewportRef.current;
    if (!pickerRef || !viewportRef || !listRef.current) return;

    viewportRef.measureInWindow((_vx, viewportY, _vw, viewportHeight) => {
      pickerRef.measureInWindow((_px, pickerY, _pw, pickerHeight) => {
        const visibleBottom = viewportY + viewportHeight;
        const pickerBottom = pickerY + pickerHeight;
        const gap = visibleBottom - pickerBottom;

        if (gap >= PICKER_SCROLL_BUFFER) return;

        const delta = PICKER_SCROLL_BUFFER - gap;
        const nextOffset = scrollOffsetAtPickerOpenRef.current + delta;
        scrollOffsetRef.current = nextOffset;
        listRef.current?.scrollToOffset({
          offset: nextOffset,
          animated: false,
        });
      });
    });
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

  useEffect(() => {
    if (!reactionTargetId) return;

    const frame = requestAnimationFrame(() => {
      scrollPickerIntoView(reactionTargetId);
    });

    return () => cancelAnimationFrame(frame);
  }, [reactionTargetId, scrollPickerIntoView]);

  const reloadRecentMessages = useCallback(async () => {
    if (!experienceId) return;

    const { data, error: loadError } = await listExperienceMessages(experienceId, null, PAGE_SIZE);
    if (loadError) return;

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
    if (!experienceId) {
      setExperience(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    setActionError(null);

    const { data: exp, error: expError } = await getExperience(experienceId);
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
      if (memoryId) {
        router.replace({
          pathname: '/(app)/(profile)/memories/[id]',
          params: { id: memoryId },
        });
        return;
      }
    }

    const { data, error: messagesError } = await listExperienceMessages(experienceId, null, PAGE_SIZE);
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
          void refreshMessageReactions(experienceId, messageId).then(({ reactions, error: reactError }) => {
            if (reactError) return;
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
  }, [experience, experienceId, error, loading, scheduleReloadRecentMessages]);

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

  async function handleSend() {
    if (!experienceId || !canSend || sending || !canSendBody) return;

    setSending(true);
    setActionError(null);
    const result = await sendExperienceMessage(experienceId, trimmedComposer);
    setSending(false);

    if (result.error) {
      setActionError(t('experiences.chat.sendError'));
      return;
    }

    setComposerText('');
    stickToBottomRef.current = true;
    await reloadRecentMessages();
    scrollToBottom(true);
  }

  function dismissReactionPicker() {
    scrollOffsetOnDismissRef.current = scrollOffsetAtPickerOpenRef.current;
    setReactionTargetId(null);
  }

  function handleMessageLongPress(messageId: string) {
    if (!canReact) return;
    Keyboard.dismiss();
    scrollOffsetAtPickerOpenRef.current = scrollOffsetRef.current;
    setReactionTargetId(messageId);
  }

  function handleMessagePress(messageId: string) {
    if (reactionTargetId !== null && reactionTargetId !== messageId) {
      dismissReactionPicker();
    }
    Keyboard.dismiss();
  }

  function handleMoreActionsPress(messageId: string) {
    Keyboard.dismiss();
    Alert.alert(t('experiences.chat.moreActions'), undefined, [
      {
        text: t('experiences.chat.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            t('experiences.chat.deleteConfirm.title'),
            t('experiences.chat.deleteConfirm.message'),
            [
              { text: t('experiences.chat.deleteConfirm.cancel'), style: 'cancel' },
              {
                text: t('experiences.chat.deleteConfirm.confirm'),
                style: 'destructive',
                onPress: () => {
                  void runDeleteMessage(messageId);
                },
              },
            ],
          );
        },
      },
      { text: t('experiences.form.cancel'), style: 'cancel' },
    ]);
  }

  async function runDeleteMessage(messageId: string) {
    setActionError(null);
    const result = await deleteExperienceMessage(messageId);
    if (result.error) {
      setActionError(t('experiences.chat.deleteError'));
      return;
    }
    setMessages((current) => current.filter((message) => message.id !== messageId));
    if (reactionTargetId === messageId) dismissReactionPicker();
  }

  async function handleReactionPress(messageId: string, emoji: string) {
    if (!canReact) return;

    setActionError(null);
    const message = messages.find((item) => item.id === messageId);
    const existing = message?.reactions.find((reaction) => reaction.user_id === myUserId);
    const nextEmoji = existing?.emoji === emoji ? null : emoji;

    const result = await setExperienceMessageReaction(messageId, nextEmoji);
    if (result.error) {
      setActionError(t('experiences.chat.reactError'));
      return;
    }

    dismissReactionPicker();
    const { reactions, error: reactError } = await refreshMessageReactions(experienceId!, messageId);
    if (reactError) return;
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, reactions } : item)),
    );
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(localeTag, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    stickToBottomRef.current = distanceFromBottom < 80;

    if (contentOffset.y <= LOAD_OLDER_THRESHOLD && hasOlder && !loadingOlder) {
      void loadOlderMessages();
    }
  }

  function handleScrollBeginDrag() {
    Keyboard.dismiss();
  }

  const dismissPickerFooter = useMemo(
    () =>
      reactionTargetId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('experiences.form.cancel')}
          onPress={dismissReactionPicker}
          style={styles.dismissPickerArea}
        />
      ) : null,
    [reactionTargetId, t],
  );

  function renderMessageRowSeparator() {
    if (reactionTargetId) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('experiences.form.cancel')}
          onPress={dismissReactionPicker}
          style={styles.messageRowSeparator}
        />
      );
    }

    return <View style={styles.messageRowSeparator} />;
  }

  const listEmpty = useMemo(
    () =>
      !loading && !error ? (
        <View style={styles.emptyState}>
          <Text variant="caption" style={styles.centered}>
            {t('experiences.chat.empty')}
          </Text>
        </View>
      ) : null,
    [error, loading, t],
  );

  function renderMessage({ item }: { item: (typeof messages)[number] }) {
    const isOwn = item.author_id !== null && item.author_id === myUserId;
    const authorName = messageAuthorLabel(item, deletedUserLabel);
    const isSelected = reactionTargetId === item.id;
    const showReactionPicker = isSelected && canReact;
    const aggregatedReactions = formatAggregatedReactions(item.reactions);
    const footerMutedColor = isOwn ? colors.textInverse : colors.textSecondary;
    const reactionLabelColor = isOwn ? colors.textInverse : colors.textPrimary;

    return (
      <View style={styles.messageRowOuter}>
        {isSelected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('experiences.form.cancel')}
            onPress={dismissReactionPicker}
            style={styles.rowDismissOverlay}
          />
        ) : null}
        {reactionTargetId !== null && !isSelected ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('experiences.form.cancel')}
            onPress={dismissReactionPicker}
            style={styles.rowDismissOverlayFront}
          />
        ) : null}
        <View
          pointerEvents="box-none"
          style={[
            styles.messageRow,
            isOwn ? styles.messageRowOwn : styles.messageRowOther,
            styles.messageRowFill,
            styles.messageRowInteractive,
          ]}
        >
        {!isOwn ? (
          <Avatar
            uri={item.author_id ? getAvatarPublicUrl(item.author_avatar_url) : null}
            displayName={authorName}
            size={28}
          />
        ) : null}

        <Pressable
          onLongPress={() => handleMessageLongPress(item.id)}
          onPress={() => handleMessagePress(item.id)}
          pointerEvents="auto"
          style={[
            styles.messageContent,
            isOwn ? styles.messageContentOwn : styles.messageContentOther,
          ]}
        >
          <View
            style={[
              styles.bubble,
              isOwn
                ? { backgroundColor: colors.brand }
                : { backgroundColor: colors.border },
            ]}
          >
            {!isOwn ? (
              <Text
                variant="caption"
                style={[styles.authorName, { color: colors.textSecondary }]}
              >
                {authorName}
              </Text>
            ) : null}
            {isOwn ? (
              <>
                <Text
                  style={[
                    styles.messageText,
                    { color: colors.textInverse },
                  ]}
                >
                  {item.body}
                  <Text style={[styles.messageTimeInline, { color: footerMutedColor }]}>
                    {'  '}
                    {formatTime(item.created_at)}
                  </Text>
                </Text>
                {!(isSelected && showReactionPicker) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('experiences.chat.moreActions')}
                    disabled={!isSelected}
                    pointerEvents={isSelected ? 'auto' : 'none'}
                    onPress={() => handleMoreActionsPress(item.id)}
                    style={[
                      styles.footerMoreOverlay,
                      !isSelected && styles.footerMoreHidden,
                    ]}
                    hitSlop={6}
                  >
                    <Text style={[styles.footerMoreIcon, { color: footerMutedColor }]}>⋯</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Text
                  style={[
                    styles.messageText,
                    { color: colors.textPrimary },
                  ]}
                >
                  {item.body}
                  <Text style={[styles.messageTimeInline, { color: footerMutedColor }]}>
                    {'  '}
                    {formatTime(item.created_at)}
                  </Text>
                </Text>
              </>
            )}

            {aggregatedReactions.length > 0 ? (
              <View style={styles.reactionSummary}>
                {aggregatedReactions.map(({ emoji, count }) => (
                  <Text
                    key={emoji}
                    style={[styles.reactionChip, { color: reactionLabelColor }]}
                  >
                    {emoji}
                    {count > 1 ? ` ${count}` : ''}
                  </Text>
                ))}
              </View>
            ) : null}

            {isOwn && isSelected && showReactionPicker ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('experiences.chat.moreActions')}
                onPress={() => handleMoreActionsPress(item.id)}
                style={styles.footerMoreSelected}
                hitSlop={6}
              >
                <Text style={[styles.footerMoreIcon, { color: footerMutedColor }]}>⋯</Text>
              </Pressable>
            ) : null}

            {showReactionPicker ? (
              <View
                ref={setPickerRef(item.id)}
                style={[
                  styles.emojiGrid,
                  {
                    borderTopColor: isOwn
                      ? 'rgba(255,255,255,0.2)'
                      : colors.border,
                  },
                ]}
              >
                {EXPERIENCE_CHAT_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => void handleReactionPress(item.id, emoji)}
                    style={styles.emojiGridItem}
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                  >
                    <Text style={styles.emojiGridEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
        </View>
      </View>
    );
  }

  const showLoader = loading && !experience;
  const showError = !loading && (error || !experience);
  const keyboardVerticalOffset = Platform.OS === 'ios' ? insets.top : 0;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <View style={styles.flex}>
        <Pressable
          onPress={() => {
            if (reactionTargetId) dismissReactionPicker();
          }}
          style={styles.header}
        >
          <Button
            label={t('experiences.chat.back')}
            variant="secondary"
            onPress={() => router.back()}
            style={styles.backButton}
          />
          <Text variant="title" numberOfLines={1} style={styles.headerTitle}>
            {experience?.title ?? t('experiences.chat.title')}
          </Text>
        </Pressable>

        <DetailLoadingSlot active={showLoader} />

        {showError ? (
          <View style={styles.stateBlock}>
            <Text variant="error" style={styles.centered}>
              {t('experiences.chat.loadError')}
            </Text>
            <Button label={t('error.retry')} onPress={() => void loadInitial()} />
          </View>
        ) : null}

        {experience && !showError ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={keyboardVerticalOffset}
          >
            {!canSend && canReact ? (
              <Text variant="caption" style={styles.leaderNotice}>
                {t('experiences.chat.leaderOnlyNotice')}
              </Text>
            ) : null}

            <View ref={listViewportRef} style={styles.flex}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={[
                styles.listContent,
                messages.length === 0 && styles.listContentEmpty,
              ]}
              ListEmptyComponent={
                reactionTargetId ? (
                  <Pressable
                    onPress={dismissReactionPicker}
                    style={styles.dismissPickerAreaEmpty}
                  >
                    {listEmpty}
                  </Pressable>
                ) : (
                  listEmpty
                )
              }
              ListHeaderComponent={
                loadingOlder ? (
                  <Text variant="caption" style={styles.loadingOlder}>
                    {t('experiences.chat.loadingOlder')}
                  </Text>
                ) : null
              }
              ItemSeparatorComponent={renderMessageRowSeparator}
              ListFooterComponent={dismissPickerFooter}
              maintainVisibleContentPosition={
                loadingOlder
                  ? { minIndexForVisible: 0, autoscrollToTopThreshold: 10 }
                  : undefined
              }
              onScroll={handleScroll}
              scrollEventThrottle={16}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={handleScrollBeginDrag}
            />
            </View>

            {actionError ? (
              <Text variant="error" style={styles.actionError}>
                {actionError}
              </Text>
            ) : null}

            {canSend ? (
              <View
                style={[
                  styles.composerRow,
                  {
                    borderTopColor: colors.border,
                    paddingBottom: Math.max(insets.bottom, Spacing.sm),
                  },
                ]}
                onStartShouldSetResponder={() => true}
              >
                <View style={[styles.composerShell, { borderColor: colors.border }]}>
                  <TextInput
                    value={composerText}
                    onFocus={() => {
                      if (reactionTargetId) dismissReactionPicker();
                    }}
                    onChangeText={setComposerText}
                    placeholder={t('experiences.chat.placeholder')}
                    placeholderTextColor={colors.textDisabled}
                    multiline
                    maxLength={MESSAGE_MAX_LENGTH}
                    style={[styles.composerInput, { color: colors.textPrimary }]}
                    editable={!sending}
                    returnKeyType="default"
                    blurOnSubmit={false}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('experiences.chat.send')}
                    onPress={() => void handleSend()}
                    disabled={!canSendBody || sending}
                    style={[
                      styles.sendButton,
                      {
                        backgroundColor: canSendBody ? colors.brand : colors.border,
                        opacity: !canSendBody || sending ? 0.5 : 1,
                      },
                    ]}
                  >
                    {sending ? (
                      <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                      <Text style={[styles.sendIcon, { color: colors.textInverse }]}>↑</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ paddingBottom: Math.max(insets.bottom, Spacing.sm) }} />
            )}
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  headerTitle: {
    marginBottom: Spacing.xs,
  },
  stateBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  centered: {
    textAlign: 'center',
  },
  leaderNotice: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    fontStyle: 'italic',
  },
  listContent: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    flexGrow: 1,
  },
  listContentEmpty: {
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loadingOlder: {
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  messageRowOuter: {
    position: 'relative',
    width: '100%',
  },
  rowDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  rowDismissOverlayFront: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  messageRowFill: {
    flex: 1,
  },
  messageRowInteractive: {
    zIndex: 2,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageContent: {
    maxWidth: '82%',
    flexGrow: 0,
    flexShrink: 1,
  },
  messageContentOwn: {
    alignSelf: 'flex-end',
  },
  messageContentOther: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 5,
    paddingBottom: 4,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTimeInline: {
    fontSize: 11,
    lineHeight: 20,
    opacity: 0.72,
  },
  footerMoreOverlay: {
    position: 'absolute',
    left: 6,
    bottom: 3,
    width: 18,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerMoreSelected: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 2,
    width: 18,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerMoreHidden: {
    opacity: 0,
  },
  footerMoreIcon: {
    fontSize: 14,
    lineHeight: 14,
  },
  authorName: {
    fontSize: 11,
    lineHeight: 13,
    marginBottom: 1,
  },
  dismissPickerArea: {
    flexGrow: 1,
    minHeight: Spacing.xxl,
  },
  messageRowSeparator: {
    height: MESSAGE_ROW_GAP,
  },
  dismissPickerAreaEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  reactionSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 2,
  },
  reactionChip: {
    fontSize: 12,
    lineHeight: 16,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 132,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emojiGridItem: {
    width: '33.333%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGridEmoji: {
    fontSize: 22,
    lineHeight: 24,
  },
  actionError: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  composerRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingTop: 6,
  },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingLeft: Spacing.sm,
    paddingRight: 3,
    paddingVertical: 3,
    gap: 4,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 7 : 5,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendIcon: {
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: FontSize.md,
  },
});
