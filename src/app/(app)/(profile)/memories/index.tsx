import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { MemoryListRow } from '@/components/MemoryListRow';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listMyMemories, transformMyDueExperiences } from '@/lib/memories';

const EDGES: Edge[] = ['top', 'left', 'right'];

export default function MemoriesScreen() {
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [memories, setMemories] = useState<Awaited<ReturnType<typeof listMyMemories>>['data']>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(false);
    await transformMyDueExperiences();
    const { data, error: loadError } = await listMyMemories(search);
    setMemories(data);
    setError(loadError);
    setLoading(false);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      void loadMemories();
    }, [loadMemories]),
  );

  const showEmpty = useMemo(
    () => !loading && !error && memories.length === 0,
    [loading, error, memories.length],
  );

  return (
    <SafeAreaView edges={EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={memories}
        keyExtractor={(item) => item.id}
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
              onSubmitEditing={() => void loadMemories()}
              returnKeyType="search"
              style={styles.search}
            />
            <Button
              label={t('memories.search')}
              variant="secondary"
              onPress={() => void loadMemories()}
              style={styles.searchButton}
            />

            {loading && (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('memories.loadError')}</Text>
                <Button label={t('error.retry')} onPress={loadMemories} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  search: {
    marginBottom: Spacing.sm,
  },
  searchButton: {
    marginBottom: Spacing.lg,
  },
  centeredRow: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  stateBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  emptyBlock: {
    marginTop: Spacing.xl,
  },
  empty: {
    textAlign: 'center',
  },
});
