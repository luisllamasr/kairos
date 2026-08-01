import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  lead: string;
  hint: string;
  onPress: () => void;
}

export function ExperienceChatEntryCard({ title, lead, hint, onPress }: Props) {
  const colors = useTheme();

  return (
    <View style={styles.section}>
      <Text variant="title" style={styles.sectionTitle}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.text}>
          <Text variant="body">{lead}</Text>
          <Text variant="caption">{hint}</Text>
        </View>
        <Text variant="subtitle" style={styles.chevron}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  text: {
    flex: 1,
    gap: Spacing.xs,
  },
  chevron: {
    fontSize: FontSize.xl,
    lineHeight: FontSize.xl,
  },
});
