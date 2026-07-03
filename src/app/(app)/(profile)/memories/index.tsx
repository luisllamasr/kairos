import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { InsetView } from '@/components/InsetView';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { MemoryListRow } from '@/components/MemoryListRow';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listMyMemories, transformMyDueExperiences } from '@/lib/memories';

const EDGES = TAB_SAFE_AREA_EDGES;

export default function MemoriesScreen() {
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [memories, setMemories] = useState<Awaited<ReturnType<typeof listMyMemories>>['data']>(
    [],
  );
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const loadMemories = useCallback(async () => {
    setError(false);
    await transformMyDueExperiences();
    const { data, error: loadError } = await listMyMemories(search);
    setMemories(data);
    setError(loadError);
  }, [search]);

  const { initialLoading, refresh } = useFocusRefresh(loadMemories);

  const showEmpty = useMemo(
    () => !initialLoading && !error && memories.length === 0,
    [initialLoading, error, memories.length],
  );

  return (
    <InsetView edges={EDGES} style={{ backgroundColor: colors.background }}>
      <FlatList
        data={memories}
        keyExtractor={(item) => item.id}
        {...DISABLE_SCROLL_INSET_ADJUSTMENT}
        renderItem={({ item }) => (
          <MemoryListRow
            item={item}
            locale={locale}
            onPress={() =>
              router.push({
                pathname: '/(app)/(profile)/memories/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button
              label={t('memories.back')}
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />

            <Text variant="title" style={styles.title}>
              {t('memories.title')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('memories.subtitle')}
            </Text>

            <Input
              value={search}
              onChangeText={setSearch}
              placeholder={t('memories.searchPlaceholder')}
              onSubmitEditing={() => void refresh()}
              returnKeyType="search"
              style={styles.search}
            />

            <ListLoadingSlot active={initialLoading && memories.length === 0} />

            {!initialLoading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('memories.loadError')}</Text>
                <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <View style={styles.emptyBlock}>
              <Text variant="subtitle" style={styles.empty}>
                {t('memories.empty')}
              </Text>
            </View>
          ) : null
        }
      />
    </InsetView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.md,
  },
  search: {
    marginBottom: Spacing.md,
  },
  stateBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  emptyBlock: {
    marginTop: Spacing.lg,
  },
  empty: {
    textAlign: 'center',
  },
});
