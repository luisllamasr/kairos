import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { UserSearchResult } from '@/components/UserSearchResult';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { normalizeUsernameQuery, searchProfiles, USERNAME_SEARCH_MIN_LENGTH } from '@/lib/users';
import { PublicProfile } from '@/types/public-profile';

const SEARCH_DEBOUNCE_MS = 300;
const EDGES: Edge[] = ['top', 'left', 'right'];

export default function SearchScreen() {
  const { session } = useAuth();
  const { t } = useI18n();
  const colors = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setLoading(false);
    setError(false);
    setSearched(false);
  }, [session?.user.id]);

  useEffect(() => {
    const normalized = normalizeUsernameQuery(query);

    if (normalized.length < USERNAME_SEARCH_MIN_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(false);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError(false);

    const timer = setTimeout(async () => {
      const { data, error: searchError } = await searchProfiles(normalized);
      setResults(data);
      setError(searchError);
      setLoading(false);
      setSearched(true);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const normalized = normalizeUsernameQuery(query);
  const showMinLength = normalized.length > 0 && normalized.length < USERNAME_SEARCH_MIN_LENGTH;
  const showNoResults = searched && !loading && !error && results.length === 0;

  return (
    <SafeAreaView edges={EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={results}
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
            <Text variant="title" style={styles.title}>
              {t('search.title')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('search.subtitle')}
            </Text>

            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="search"
              style={styles.input}
            />

            {showMinLength && (
              <Text variant="caption" style={styles.hint}>
                {t('search.minLength')}
              </Text>
            )}

            {loading && (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}

            {error && (
              <Text variant="error" style={styles.message}>
                {t('search.error')}
              </Text>
            )}

            {showNoResults && (
              <Text variant="subtitle" style={styles.message}>
                {t('search.noResults')}
              </Text>
            )}
          </>
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
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  input: {
    marginBottom: Spacing.sm,
  },
  hint: {
    marginBottom: Spacing.md,
  },
  message: {
    marginBottom: Spacing.md,
  },
  centeredRow: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
});
