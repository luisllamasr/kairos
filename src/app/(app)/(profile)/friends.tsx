import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { UserSearchResult } from '@/components/UserSearchResult';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listFriends } from '@/lib/friendships';
import { PublicProfile } from '@/types/public-profile';

const EDGES: Edge[] = ['top', 'left', 'right'];

export default function FriendsScreen() {
  const { t } = useI18n();
  const colors = useTheme();

  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    setError(false);

    const { data, error: loadError } = await listFriends();
    setFriends(data);
    setError(loadError);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFriends();
    }, [loadFriends]),
  );

  const showEmpty = !loading && !error && friends.length === 0;

  return (
    <SafeAreaView edges={EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.username}
        renderItem={({ item }) => (
          <UserSearchResult
            profile={item}
            onPress={() =>
              router.push({
                pathname: '/(app)/(search)/user/[username]',
                params: { username: item.username },
              })
            }
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button
              label={t('friends.back')}
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />

            <Text variant="title" style={styles.title}>
              {t('friends.title')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('friends.subtitle')}
            </Text>

            {loading && (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error" style={styles.message}>
                  {t('friends.error')}
                </Text>
                <Button label={t('error.retry')} onPress={loadFriends} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <Text variant="subtitle" style={styles.message}>
              {t('friends.empty')}
            </Text>
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
  centeredRow: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  stateBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  message: {
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
});
