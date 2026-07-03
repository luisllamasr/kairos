import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { InsetView } from '@/components/InsetView';
import { Input } from '@/components/Input';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { Text } from '@/components/Text';
import { UserSearchResult } from '@/components/UserSearchResult';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { normalizeUsernameQuery, searchProfiles, USERNAME_SEARCH_MIN_LENGTH } from '@/lib/users';
import { PublicProfile } from '@/types/public-profile';

const SEARCH_DEBOUNCE_MS = 300;
const EDGES = TAB_SAFE_AREA_EDGES;

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
    <InsetView edges={EDGES} style={{ backgroundColor: colors.background }}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.username}
        {...DISABLE_SCROLL_INSET_ADJUSTMENT}
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
          <View>
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

            <ListLoadingSlot active={loading && results.length === 0} />

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
          </View>
        }
      />
    </InsetView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.md,
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
});
