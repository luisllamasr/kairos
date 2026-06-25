import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExperienceDateTimeField } from '@/components/ExperienceDateTimeField';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { TEXT_LIMITS, isWithinTextLimit } from '@/constants/text-limits';
import { useI18n } from '@/i18n';
import {
  datesAreValid,
  experienceStartIsValid,
  minimumExperienceStartDate,
  suggestEndDate,
  toIsoString,
} from '@/lib/experience-dates';
import { CreateExperienceInput } from '@/lib/experiences';

function defaultStartDate(): Date {
  const minStart = minimumExperienceStartDate();
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return nextHour.getTime() >= minStart.getTime() ? nextHour : minStart;
}

export type ExperienceFormValues = CreateExperienceInput;

interface Props {
  initialValues?: Partial<ExperienceFormValues>;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (values: ExperienceFormValues) => Promise<void>;
  onCancel: () => void;
}

export function ExperienceForm({
  initialValues,
  submitLabel,
  loading = false,
  onSubmit,
  onCancel,
}: Props) {
  const { t, locale } = useI18n();

  const initialStart = useMemo(() => {
    if (initialValues?.startsAt) return new Date(initialValues.startsAt);
    return defaultStartDate();
  }, [initialValues?.startsAt]);

  const initialEnd = useMemo(() => {
    if (initialValues?.endsAt) return new Date(initialValues.endsAt);
    if (initialValues?.startsAt) return suggestEndDate(new Date(initialValues.startsAt));
    return suggestEndDate(initialStart);
  }, [initialValues?.endsAt, initialValues?.startsAt, initialStart]);

  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [location, setLocation] = useState(initialValues?.locationName ?? '');
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [error, setError] = useState<string | null>(null);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';

  function handleStartChange(date: Date) {
    setStartsAt(date);
    if (endsAt.getTime() <= date.getTime()) {
      setEndsAt(suggestEndDate(date));
    }
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('experiences.error.titleRequired'));
      return;
    }
    if (trimmedTitle.length > TEXT_LIMITS.title) {
      setError(t('experiences.error.titleTooLong'));
      return;
    }
    const trimmedDescription = description.trim();
    const trimmedLocation = location.trim();
    if (!isWithinTextLimit(trimmedDescription, TEXT_LIMITS.description)) {
      setError(t('experiences.error.descriptionTooLong'));
      return;
    }
    if (!isWithinTextLimit(trimmedLocation, TEXT_LIMITS.locationName)) {
      setError(t('experiences.error.locationTooLong'));
      return;
    }
    if (!experienceStartIsValid(startsAt)) {
      setError(t('experiences.error.startsInPast'));
      return;
    }
    if (!datesAreValid(startsAt, endsAt)) {
      setError(t('experiences.error.invalidDates'));
      return;
    }

    setError(null);
    await onSubmit({
      title: trimmedTitle,
      description: trimmedDescription || null,
      locationName: trimmedLocation || null,
      startsAt: toIsoString(startsAt),
      endsAt: toIsoString(endsAt),
    });
  }

  return (
    <View style={styles.form}>
      <Input
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setError(null);
        }}
        placeholder={t('experiences.title.placeholder')}
        maxLength={TEXT_LIMITS.title}
      />

      <Input
        value={description}
        onChangeText={setDescription}
        placeholder={t('experiences.description.placeholder')}
        multiline
        maxLength={TEXT_LIMITS.description}
        style={styles.multiline}
      />

      <Input
        value={location}
        onChangeText={setLocation}
        placeholder={t('experiences.location.placeholder')}
        maxLength={TEXT_LIMITS.locationName}
      />

      <ExperienceDateTimeField
        label={t('experiences.startsAt.label')}
        value={startsAt}
        onChange={handleStartChange}
        locale={localeTag}
        minimumDate={minimumExperienceStartDate()}
        doneLabel={t('experiences.dateTime.done')}
        cancelLabel={t('experiences.dateTime.cancel')}
      />

      <ExperienceDateTimeField
        label={t('experiences.endsAt.label')}
        value={endsAt}
        onChange={setEndsAt}
        locale={localeTag}
        minimumDate={startsAt}
        doneLabel={t('experiences.dateTime.done')}
        cancelLabel={t('experiences.dateTime.cancel')}
      />

      <Text variant="caption" style={styles.endsHint}>
        {t('experiences.endsAt.hint')}
      </Text>

      {error && (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      )}

      <Button label={submitLabel} onPress={() => void handleSubmit()} loading={loading} />
      <Button
        label={t('experiences.form.cancel')}
        variant="secondary"
        onPress={onCancel}
        disabled={loading}
        style={styles.cancelButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
    gap: Spacing.sm,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  endsHint: {
    marginBottom: Spacing.sm,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  cancelButton: {
    marginTop: Spacing.xs,
  },
});
