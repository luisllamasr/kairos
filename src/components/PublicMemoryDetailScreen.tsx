import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { MemoryPhotoViewer } from '@/components/MemoryPhotoViewer';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TAB_SCREEN_EDGES, DISABLE_SCROLL_INSET_ADJUSTMENT } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useI18n } from '@/i18n';
import { formatExperienceRange } from '@/lib/experience-dates';
import { getMemoryPhotoSignedUrl } from '@/lib/memories';
import { getPublicMemory, listPublicMemoryMedia } from '@/lib/public-memories';
import { useTheme } from '@/hooks/use-theme';
import { MemoryMedia } from '@/types/memory';
import { PublicMemory, PublicMemoryMedia } from '@/types/public-memory';

/**
 * Full public read of a memory the viewer does not participate in (Privacy
 * v1, docs/PROJECT.md §6 — "full detail, never a preview"). Reached only
 * from PublicProfileScreen's memory list, or a direct memory-id deep link —
 * both paths rely entirely on get_public_memory's own server-side predicate
 * (can_view_memory_publicly); this screen never assumes access just because
 * the viewer arrived through a profile.
 *
 * Deliberately a trimmed sibling of the owner-side memory detail screen
 * (src/app/(app)/(profile)/memories/[id].tsx), not a shared component: no
 * participants section, personal note, or leave/transfer actions exist in
 * the public read at all (get_public_memory/list_public_memory_media never
 * return participant rows or uploader identity), so there is nothing to
 * conditionally hide — the smaller RPC surface keeps this screen small on
 * its own.
 */
export function PublicMemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, tn, locale } = useI18n();
  const colors = useTheme();

  const [memory, setMemory] = useState<PublicMemory | null>(null);
  const [media, setMedia] = useState<PublicMemoryMedia[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';

  const loadPhotoUrls = useCallback(async (items: PublicMemoryMedia[]) => {
    const entries = await Promise.all(
      items.map(async (item) => {
        const url = await getMemoryPhotoSignedUrl(item.storage_path);
        return [item.id, url] as const;
      }),
    );
    const next: Record<string, string> = {};
    for (const [mediaId, url] of entries) {
      if (url) next[mediaId] = url;
    }
    setPhotoUrls(next);
  }, []);

  const loadMemory = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setMemory(null);
      setNotFound(true);
      return;
    }

    setError(false);
    setNotFound(false);

    const [{ data, error: loadError }, mediaResult] = await Promise.all([
      getPublicMemory(id),
      listPublicMemoryMedia(id),
    ]);

    if (loadError) {
      setMemory(null);
      setMedia([]);
      setError(true);
      return;
    }

    // No row back is a deliberately neutral outcome (see docs/PROJECT.md
    // §6): get_public_memory returns nothing both when the memory does not
    // exist at all and when it exists but this viewer's access predicate
    // fails — same "not found" state either way, never distinguishing why.
    if (!data) {
      setMemory(null);
      setMedia([]);
      setNotFound(true);
      return;
    }

    setMemory(data);
    // media can legitimately fail independently of the memory read itself
    // (e.g. a transient error) without invalidating an otherwise-successful
    // memory load — degrades to an empty photo section, matching the
    // owner-side screen's non-fatal-media convention.
    const items = mediaResult.error ? [] : mediaResult.data;
    setMedia(items);
    await loadPhotoUrls(items);
  }, [id, loadPhotoUrls]);

  const { initialLoading, refresh, resetLoaded } = useFocusRefresh(loadMemory);

  useEffect(() => {
    resetLoaded();
  }, [id, resetLoaded]);

  const contentMemory = memory && memory.id === id ? memory : null;
  const showDetailLoader = initialLoading && !contentMemory;
  const showLoadError = !initialLoading && error;
  const showNotFound = !initialLoading && notFound && !error;

  // Adapts the public media shape into MemoryPhotoViewer's full MemoryMedia
  // prop type. The extra fields are placeholders that are never read: the
  // viewer only renders its uploader/date/delete footer when it also
  // receives `memory`/`participants`, and this screen passes neither (see
  // MemoryPhotoViewer's "public mode" — no uploader identity here at all).
  const viewerMedia: MemoryMedia[] = media.map((item) => ({
    id: item.id,
    storage_path: item.storage_path,
    mime_type: item.mime_type,
    byte_size: null,
    sort_order: item.sort_order,
    created_at: '',
    uploaded_by_user_id: null,
  }));

  return (
    <Screen scroll={false} edges={TAB_SCREEN_EDGES}>
      <Button
        label={t('publicMemory.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      <DetailLoadingSlot active={showDetailLoader} />

      {showLoadError && (
        <View style={styles.stateBlock}>
          <Text variant="error" style={styles.centered}>
            {t('publicMemory.loadError')}
          </Text>
          <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
        </View>
      )}

      {showNotFound && (
        <View style={styles.stateBlock}>
          <Text variant="title" style={styles.centered}>
            {t('publicMemory.notFound')}
          </Text>
          <Text variant="subtitle" style={styles.centered}>
            {t('publicMemory.notFoundHint')}
          </Text>
        </View>
      )}

      {contentMemory && (
        <ScrollView
          contentContainerStyle={styles.content}
          {...DISABLE_SCROLL_INSET_ADJUSTMENT}
        >
          <Text variant="hero" style={styles.title}>
            {contentMemory.title}
          </Text>

          <Text variant="subtitle" style={styles.range}>
            {formatExperienceRange(
              contentMemory.happened_starts_at,
              contentMemory.happened_ends_at,
              localeTag,
            )}
          </Text>

          {contentMemory.location_name ? (
            <Text variant="body" style={styles.body}>
              {contentMemory.location_name}
            </Text>
          ) : null}

          {contentMemory.description ? (
            <Text variant="body" style={styles.body}>
              {contentMemory.description}
            </Text>
          ) : null}

          <Text variant="caption" style={styles.participantCount}>
            {tn('publicMemory.participantCount.other', contentMemory.participant_count)}
          </Text>

          <View style={styles.section}>
            <Text variant="title" style={styles.sectionTitle}>
              {t('publicMemory.photos')}
            </Text>

            {media.length === 0 ? (
              <Text variant="caption" style={styles.emptyPhotos}>
                {t('publicMemory.noPhotos')}
              </Text>
            ) : (
              <View style={styles.photoGrid}>
                {media.map((item, index) => (
                  <Pressable
                    key={item.id}
                    style={styles.photoCell}
                    disabled={!photoUrls[item.id]}
                    onPress={() => {
                      setPhotoViewerIndex(index);
                      setPhotoViewerOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('memories.photoViewer.openPhoto')}
                  >
                    {photoUrls[item.id] ? (
                      <Image
                        source={{ uri: photoUrls[item.id] }}
                        style={styles.photo}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.border }]} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <MemoryPhotoViewer
        visible={photoViewerOpen}
        media={viewerMedia}
        photoUrls={photoUrls}
        initialIndex={photoViewerIndex}
        localeTag={localeTag}
        onClose={() => setPhotoViewerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
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
  content: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  range: {
    marginBottom: Spacing.md,
  },
  body: {
    marginBottom: Spacing.sm,
  },
  participantCount: {
    marginBottom: Spacing.sm,
  },
  section: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoCell: {
    width: 96,
    height: 96,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  photoPlaceholder: {
    opacity: 0.5,
  },
  emptyPhotos: {
    fontStyle: 'italic',
  },
});
