import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import { Text } from '@/components/Text';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatExperienceDateTime } from '@/lib/experience-dates';

type AndroidPickerStep = 'date' | 'time' | null;

interface Props {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  locale: string;
  minimumDate?: Date;
  doneLabel: string;
  cancelLabel: string;
}

function mergeDate(base: Date, picked: Date): Date {
  const merged = new Date(base);
  merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return merged;
}

function mergeTime(base: Date, picked: Date): Date {
  const merged = new Date(base);
  merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return merged;
}

export function ExperienceDateTimeField({
  label,
  value,
  onChange,
  locale,
  minimumDate,
  doneLabel,
  cancelLabel,
}: Props) {
  const colors = useTheme();
  const colorScheme = useColorScheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [androidStep, setAndroidStep] = useState<AndroidPickerStep>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const formatted = useMemo(
    () => formatExperienceDateTime(value.toISOString(), locale),
    [value, locale],
  );

  const pickerOpen = iosOpen || androidStep !== null;

  function openPicker() {
    setDraft(value);
    if (Platform.OS === 'ios') {
      setIosOpen(true);
    } else {
      setAndroidStep('date');
    }
  }

  function closePicker() {
    setIosOpen(false);
    setAndroidStep(null);
  }

  function confirmPicker() {
    onChange(draft);
    closePicker();
  }

  function handleIosChange(_event: DateTimePickerEvent, selected?: Date) {
    if (selected) setDraft(selected);
  }

  function handleAndroidDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      closePicker();
      return;
    }
    if (!selected) return;
    setDraft((current) => mergeDate(current, selected));
    setAndroidStep('time');
  }

  function handleAndroidTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      closePicker();
      return;
    }
    if (!selected) return;
    onChange(mergeTime(draft, selected));
    closePicker();
  }

  const androidTimeMinimum =
    minimumDate && draft.toDateString() === minimumDate.toDateString() ? minimumDate : undefined;

  return (
    <View style={styles.block}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={openPicker}
        disabled={pickerOpen}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: colors.border,
            backgroundColor: colors.background,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text variant="body" style={styles.valueText}>
          {formatted}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
      </Pressable>

      {Platform.OS === 'ios' && (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={closePicker}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.backdrop} onPress={closePicker} />
            <View style={[styles.sheet, { backgroundColor: colors.background }]}>
              <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
                <Pressable onPress={closePicker} hitSlop={8} style={styles.toolbarButton}>
                  <Text variant="body" style={{ color: colors.textSecondary }}>
                    {cancelLabel}
                  </Text>
                </Pressable>
                <Pressable onPress={confirmPicker} hitSlop={8} style={styles.toolbarButton}>
                  <Text variant="body" style={{ color: colors.brand, fontWeight: '600' }}>
                    {doneLabel}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draft}
                mode="datetime"
                display="spinner"
                minimumDate={minimumDate}
                onChange={handleIosChange}
                themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && androidStep === 'date' && (
        <DateTimePicker
          value={draft}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={handleAndroidDateChange}
        />
      )}

      {Platform.OS === 'android' && androidStep === 'time' && (
        <DateTimePicker
          value={draft}
          mode="time"
          display="default"
          minimumDate={androidTimeMinimum}
          onChange={handleAndroidTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  valueText: {
    flex: 1,
    marginRight: Spacing.sm,
    fontSize: FontSize.md,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: Spacing.lg,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
});
