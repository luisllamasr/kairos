import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useExperienceChat } from '@/hooks/use-experience-chat';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

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
  const experienceId = typeof id === 'string' ? id : null;

  const chat = useExperienceChat(experienceId, myUserId);

  const listViewportRef = useRef<View>(null);
  const pickerRefs = useRef<Record<string, View | null>>({});
  const scrollOffsetRef = useRef(0);
  const anchorRevealScheduledRef = useRef(false);

  // Keeps the message list hidden (not unhidden yet) until the initial
  // scroll-to-bottom has actually landed. Without this, the list briefly
  // renders at its natural top-of-content position for a frame or two before
  // scrollToEnd() lands, which reads as a flicker/jump on open.
  const [isAnchored, setIsAnchored] = useState(false);

  useEffect(() => {
    if (chat.loading) {
      setIsAnchored(false);
      return;
    }
    // Nothing to scroll to — an empty conversation is trivially "anchored".
    if (chat.messages.length === 0) setIsAnchored(true);
  }, [chat.loading, chat.messages.length]);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const deletedUserLabel = t('memories.participant.deletedUser');

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(localeTag, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const setPickerRef = useCallback((messageId: string) => {
    return (node: View | null) => {
      pickerRefs.current[messageId] = node;
    };
  }, []);

  const scrollPickerIntoView = useCallback(
    (messageId: string) => {
      const pickerRef = pickerRefs.current[messageId];
      const viewportRef = listViewportRef.current;
      if (!pickerRef || !viewportRef || !chat.listRef.current) return;

      viewportRef.measureInWindow((_vx, viewportY, _vw, viewportHeight) => {
        pickerRef.measureInWindow((_px, pickerY, _pw, pickerHeight) => {
          const visibleBottom = viewportY + viewportHeight;
          const pickerBottom = pickerY + pickerHeight;
          const gap = visibleBottom - pickerBottom;

          if (gap >= PICKER_SCROLL_BUFFER) return;

          const delta = PICKER_SCROLL_BUFFER - gap;
          const nextOffset = chat.scrollOffsetAtPickerOpenRef.current + delta;
          scrollOffsetRef.current = nextOffset;
          chat.listRef.current?.scrollToOffset({
            offset: nextOffset,
            animated: false,
          });
        });
      });
    },
    [chat.listRef, chat.scrollOffsetAtPickerOpenRef],
  );

  const reactionTargetId = chat.reactionTargetId;

  useEffect(() => {
    if (!reactionTargetId) return;

    const frame = requestAnimationFrame(() => {
      scrollPickerIntoView(reactionTargetId);
    });

    return () => cancelAnimationFrame(frame);
  }, [reactionTargetId, scrollPickerIntoView]);

  function handleMessageLongPress(messageId: string) {
    if (!chat.canReact) return;
    Keyboard.dismiss();
    chat.scrollOffsetAtPickerOpenRef.current = scrollOffsetRef.current;
    chat.setReactionTargetId(messageId);
  }

  function handleMessagePress(messageId: string) {
    if (reactionTargetId !== null && reactionTargetId !== messageId) {
      chat.dismissReactionPicker();
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
                  void chat.deleteMessage(messageId, t('experiences.chat.deleteError'));
                },
              },
            ],
          );
        },
      },
      { text: t('experiences.form.cancel'), style: 'cancel' },
    ]);
  }

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    chat.stickToBottomRef.current = distanceFromBottom < 80;

    if (contentOffset.y <= LOAD_OLDER_THRESHOLD && chat.hasOlder && !chat.loadingOlder) {
      void chat.loadOlderMessages();
    }
  }

  function handleScrollBeginDrag() {
    Keyboard.dismiss();
  }

  function handleContentSizeChange() {
    // The initial "scroll to bottom on load" effect (in useExperienceChat)
    // fires a single requestAnimationFrame right after messages arrive, which
    // can land just short of the true end on a freshly mounted screen — the
    // last row and the trailing padding are still settling natively at that
    // point, so scrollToEnd() computes against a content size that hasn't
    // caught up yet. onContentSizeChange fires once the native content size
    // has actually changed, so re-asserting scrollToEnd here corrects for
    // that final bit whenever we're meant to be following the bottom.
    //
    // Guarded to reactionTargetId === null: while a picker is open/closing,
    // scrollPickerIntoView and the dismiss-restore effect own positioning —
    // this must stay a no-op then, or it would fight them and reintroduce
    // the "opening/closing a picker repositions surrounding messages" bug.
    if (reactionTargetId) return;
    if (chat.stickToBottomRef.current) {
      chat.listRef.current?.scrollToEnd({ animated: false });

      if (!isAnchored && !anchorRevealScheduledRef.current) {
        anchorRevealScheduledRef.current = true;
        // One more frame so the (non-animated but still native-async) scroll
        // above has actually committed before we reveal the list.
        requestAnimationFrame(() => {
          anchorRevealScheduledRef.current = false;
          setIsAnchored(true);
        });
      }
    }
  }

  const dismissPickerFooter = useMemo(
    () => (
      // Always rendered at the same size, whether or not a picker is open —
      // toggling this footer in and out of the list (rather than just its
      // behavior) used to change the list's total content height, which made
      // the bottom spacing visibly jump every time a picker opened. Only the
      // responder behavior below is conditional.
      //
      // A plain responder-claiming View instead of Pressable: dismissing here
      // needs to fire on touch-down, not on a full press-release. Opening the
      // picker can trigger a scroll adjustment (scrollPickerIntoView) that
      // shifts this exact area while the finger is still down, and Pressable
      // treats that movement as a cancelled press — silently swallowing the
      // dismiss.
      <View
        accessibilityRole={reactionTargetId ? 'button' : undefined}
        accessibilityLabel={reactionTargetId ? t('experiences.form.cancel') : undefined}
        onStartShouldSetResponder={() => reactionTargetId !== null}
        onResponderGrant={chat.dismissReactionPicker}
        style={styles.dismissPickerArea}
      />
    ),
    [reactionTargetId, t, chat.dismissReactionPicker],
  );

  function renderMessageRowSeparator() {
    if (reactionTargetId) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('experiences.form.cancel')}
          onPress={chat.dismissReactionPicker}
          style={styles.messageRowSeparator}
        />
      );
    }

    return <View style={styles.messageRowSeparator} />;
  }

  const listEmpty = useMemo(
    () =>
      !chat.loading && !chat.error ? (
        <View style={styles.emptyState}>
          <Text variant="caption" style={styles.centered}>
            {t('experiences.chat.empty')}
          </Text>
        </View>
      ) : null,
    [chat.error, chat.loading, t],
  );

  function renderMessage({ item }: { item: (typeof chat.messages)[number] }) {
    const isSelected = reactionTargetId === item.id;
    const showReactionPicker = isSelected && chat.canReact;

    return (
      <MessageBubble
        item={item}
        myUserId={myUserId}
        deletedUserLabel={deletedUserLabel}
        cancelLabel={t('experiences.form.cancel')}
        moreActionsLabel={t('experiences.chat.moreActions')}
        colors={colors}
        isSelected={isSelected}
        showReactionPicker={showReactionPicker}
        pickerOpenSomewhere={reactionTargetId !== null}
        formatTime={formatTime}
        onDismissPicker={chat.dismissReactionPicker}
        onLongPress={() => handleMessageLongPress(item.id)}
        onPress={() => handleMessagePress(item.id)}
        onMoreActionsPress={() => handleMoreActionsPress(item.id)}
        onReactionPress={(emoji) =>
          void chat.reactToMessage(item.id, emoji, t('experiences.chat.reactError'))
        }
        setPickerRef={setPickerRef(item.id)}
      />
    );
  }

  const showLoader = chat.loading && !chat.experience;
  const showError = !chat.loading && (chat.error || !chat.experience);
  const keyboardVerticalOffset = Platform.OS === 'ios' ? insets.top : 0;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <View style={styles.flex}>
        <Pressable
          onPress={() => {
            if (reactionTargetId) chat.dismissReactionPicker();
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
            {chat.experience?.title ?? t('experiences.chat.title')}
          </Text>
        </Pressable>

        <DetailLoadingSlot active={showLoader} />

        {showError ? (
          <View style={styles.stateBlock}>
            <Text variant="error" style={styles.centered}>
              {t('experiences.chat.loadError')}
            </Text>
            <Button label={t('error.retry')} onPress={() => void chat.loadInitial()} />
          </View>
        ) : null}

        {chat.experience && !showError ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={keyboardVerticalOffset}
          >
            {!chat.canSend && chat.canReact ? (
              <Text variant="caption" style={styles.leaderNotice}>
                {t('experiences.chat.leaderOnlyNotice')}
              </Text>
            ) : null}

            <View
              ref={listViewportRef}
              style={[styles.flex, { opacity: isAnchored ? 1 : 0 }]}
            >
              <FlatList
                ref={chat.listRef}
                data={chat.messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                extraData={reactionTargetId}
                contentContainerStyle={[
                  styles.listContent,
                  chat.messages.length === 0 && styles.listContentEmpty,
                ]}
                ListEmptyComponent={
                  reactionTargetId ? (
                    <Pressable
                      onPress={chat.dismissReactionPicker}
                      style={styles.dismissPickerAreaEmpty}
                    >
                      {listEmpty}
                    </Pressable>
                  ) : (
                    listEmpty
                  )
                }
                ListHeaderComponent={
                  chat.loadingOlder ? (
                    <Text variant="caption" style={styles.loadingOlder}>
                      {t('experiences.chat.loadingOlder')}
                    </Text>
                  ) : null
                }
                ItemSeparatorComponent={renderMessageRowSeparator}
                ListFooterComponent={dismissPickerFooter}
                maintainVisibleContentPosition={
                  chat.loadingOlder
                    ? { minIndexForVisible: 0, autoscrollToTopThreshold: 10 }
                    : undefined
                }
                onScroll={handleScroll}
                onContentSizeChange={handleContentSizeChange}
                scrollEventThrottle={16}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={handleScrollBeginDrag}
              />
            </View>

            {chat.actionError ? (
              <Text variant="error" style={styles.actionError}>
                {chat.actionError}
              </Text>
            ) : null}

            {chat.canSend ? (
              <ChatComposer
                colors={colors}
                value={chat.composerText}
                onChangeText={chat.setComposerText}
                onFocus={() => {
                  if (reactionTargetId) chat.dismissReactionPicker();
                }}
                onSend={() => void chat.sendMessage(t('experiences.chat.sendError'))}
                sending={chat.sending}
                canSendBody={chat.canSendBody}
                placeholder={t('experiences.chat.placeholder')}
                sendLabel={t('experiences.chat.send')}
              />
            ) : (
              <View style={styles.readOnlyFooterSpacer} />
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
    // Matches the back-button-to-title gap used on the experience detail
    // screen (`[id].tsx`'s `backButton: { marginBottom: Spacing.lg }`) —
    // chat's header used to be a tighter `Spacing.xs` here, which read as
    // compressed next to that established convention.
    gap: Spacing.lg,
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
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
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
  dismissPickerArea: {
    flexGrow: 1,
    // The dedicated "anchor gap" below the last message, present at all
    // times (see dismissPickerFooter above) so it never changes size when a
    // picker opens/closes. flexGrow fills any leftover space on short
    // conversations so there's always a tappable dismiss area to reach.
    minHeight: Spacing.md,
  },
  messageRowSeparator: {
    height: MESSAGE_ROW_GAP,
  },
  dismissPickerAreaEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  actionError: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  readOnlyFooterSpacer: {
    paddingBottom: Spacing.sm,
  },
});
