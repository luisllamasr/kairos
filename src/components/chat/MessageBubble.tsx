import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { ThemeColors } from '@/constants/theme';
import {
  formatAggregatedReactions,
  messageAuthorLabel,
} from '@/lib/experience-chat';
import { getAvatarPublicUrl } from '@/lib/profile';
import { EXPERIENCE_CHAT_EMOJIS, ExperienceMessage } from '@/types/experience-chat';

interface Props {
  item: ExperienceMessage;
  myUserId: string | null;
  deletedUserLabel: string;
  cancelLabel: string;
  moreActionsLabel: string;
  colors: ThemeColors;
  isSelected: boolean;
  showReactionPicker: boolean;
  pickerOpenSomewhere: boolean;
  formatTime: (iso: string) => string;
  onDismissPicker: () => void;
  onLongPress: () => void;
  onPress: () => void;
  onMoreActionsPress: () => void;
  onReactionPress: (emoji: string) => void;
  setPickerRef: (node: View | null) => void;
}

export function MessageBubble({
  item,
  myUserId,
  deletedUserLabel,
  cancelLabel,
  moreActionsLabel,
  colors,
  isSelected,
  showReactionPicker,
  pickerOpenSomewhere,
  formatTime,
  onDismissPicker,
  onLongPress,
  onPress,
  onMoreActionsPress,
  onReactionPress,
  setPickerRef,
}: Props) {
  const isOwn = item.author_id !== null && item.author_id === myUserId;
  const authorName = messageAuthorLabel(item, deletedUserLabel);
  const aggregatedReactions = formatAggregatedReactions(item.reactions);
  const footerMutedColor = isOwn ? colors.textInverse : colors.textSecondary;
  const reactionLabelColor = isOwn ? colors.textInverse : colors.textPrimary;

  return (
    <View style={styles.messageRowOuter}>
      {isSelected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onDismissPicker}
          style={styles.rowDismissOverlay}
        />
      ) : null}
      {pickerOpenSomewhere && !isSelected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onDismissPicker}
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
          onLongPress={onLongPress}
          onPress={onPress}
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
                    accessibilityLabel={moreActionsLabel}
                    disabled={!isSelected}
                    pointerEvents={isSelected ? 'auto' : 'none'}
                    onPress={onMoreActionsPress}
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
                accessibilityLabel={moreActionsLabel}
                onPress={onMoreActionsPress}
                style={styles.footerMoreSelected}
                hitSlop={6}
              >
                <Text style={[styles.footerMoreIcon, { color: footerMutedColor }]}>⋯</Text>
              </Pressable>
            ) : null}

            {showReactionPicker ? (
              <View
                ref={setPickerRef}
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
                    onPress={() => onReactionPress(emoji)}
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

const styles = StyleSheet.create({
  messageRowOuter: {
    position: 'relative',
    width: '100%',
  },
  rowDismissOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  rowDismissOverlayFront: {
    ...StyleSheet.absoluteFill,
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
});
