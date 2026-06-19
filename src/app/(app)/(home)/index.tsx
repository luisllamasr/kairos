import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useI18n } from '@/i18n';

export default function HomeScreen() {
  const { t } = useI18n();

  return (
    <Screen centered edges={['top', 'left', 'right']}>
      <Text variant="subtitle" style={{ textAlign: 'center' }}>
        {t('home.comingSoon')}
      </Text>
    </Screen>
  );
}
