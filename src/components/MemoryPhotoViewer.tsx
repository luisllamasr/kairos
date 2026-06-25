import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { MemoryMedia, MemoryParticipant } from '@/types/memory';

const CLOSE_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

type Props = {
  visible: boolean;
  media: MemoryMedia[];
  photoUrls: Record<string, string>;
  participants: MemoryParticipant[];
  initialIndex: number;
  localeTag: string;
  onClose: () => void;
};

function uploaderLabel(
  item: MemoryMedia,
  participants: MemoryParticipant[],
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (item.uploaded_by_user_id === null) {
    return t('memories.participant.deletedUser');
  }

  const match = participants.find((p) => p.user_id === item.uploaded_by_user_id);
  if (!match || match.user_id === null) {
    return t('memories.participant.deletedUser');
  }

  return match.display_name ?? match.username ?? t('memories.participant.unknown');
}

function formatUploadDate(iso: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function MemoryPhotoViewer({
  visible,
  media,
  photoUrls,
  participants,
  initialIndex,
  localeTag,
  onClose,
}: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<MemoryMedia>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (!visible || media.length === 0) return;

    const index = Math.min(Math.max(0, initialIndex), media.length - 1);
    setCurrentIndex(index);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false });
    });
  }, [visible, initialIndex, media.length]);

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / width);
      if (index >= 0 && index < media.length) {
        setCurrentIndex(index);
      }
    },
    [width, media.length],
  );

  if (media.length === 0) {
    return null;
  }

  const safeIndex = Math.min(Math.max(0, currentIndex), media.length - 1);
  const activeItem = media[safeIndex];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {visible ? <StatusBar style="light" /> : null}

      <View style={styles.backdrop}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Spacing.xs,
              paddingLeft: Math.max(insets.left, Spacing.md),
              paddingRight: Math.max(insets.right, Spacing.md),
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={CLOSE_HIT_SLOP}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('memories.photoViewer.close')}
          >
            <Text variant="body" style={styles.closeLabel}>
              {t('memories.photoViewer.close')}
            </Text>
          </Pressable>

          {media.length > 1 ? (
            <Text variant="caption" style={styles.counter}>
              {t('memories.photoViewer.index', {
                current: String(safeIndex + 1),
                total: String(media.length),
              })}
            </Text>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          data={media}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          onMomentumScrollEnd={onScrollEnd}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
          }}
          renderItem={({ item }) => {
            const uri = photoUrls[item.id];
            return (
              <View style={[styles.slide, { width }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.fullPhoto} resizeMode="contain" />
                ) : null}
              </View>
            );
          }}
        />

        {activeItem ? (
          <View
            style={[
              styles.metadata,
              {
                paddingBottom: insets.bottom + Spacing.sm,
                paddingLeft: Math.max(insets.left, Spacing.md),
                paddingRight: Math.max(insets.right, Spacing.md),
              },
            ]}
          >
            <Text variant="body" style={styles.metadataPrimary}>
              {uploaderLabel(activeItem, participants, t)}
            </Text>
            <Text variant="caption" style={styles.metadataSecondary}>
              {formatUploadDate(activeItem.created_at, localeTag)}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.sm,
    zIndex: 2,
    elevation: 2,
  },
  closeButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  closeLabel: {
    color: '#FFFFFF',
  },
  counter: {
    color: '#CCCCCC',
    minHeight: 44,
    lineHeight: 44,
    textAlign: 'right',
  },
  headerSpacer: {
    minWidth: 44,
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPhoto: {
    width: '100%',
    height: '100%',
  },
  metadata: {
    paddingTop: Spacing.md,
    gap: Spacing.xs,
    zIndex: 2,
    elevation: 2,
  },
  metadataPrimary: {
    color: '#FFFFFF',
  },
  metadataSecondary: {
    color: '#AAAAAA',
  },
});
