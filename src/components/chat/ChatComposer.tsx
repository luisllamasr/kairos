import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { FontSize, Radius, Spacing, ThemeColors } from '@/constants/theme';

const MESSAGE_MAX_LENGTH = 2000;

interface Props {
  colors: ThemeColors;
  value: string;
  onChangeText: (text: string) => void;
  /**
   * Fired on both an actual focus event AND on touch-down (see `onTouchStart`
   * below) — if the input was already focused when the reaction picker opened
   * (e.g. `Keyboard.dismiss()` hid the keyboard without fully blurring the
   * input), tapping it again produces no new focus event at all, so dismissal
   * can't rely on `onFocus` alone.
   */
  onFocus: () => void;
  onSend: () => void;
  sending: boolean;
  canSendBody: boolean;
  placeholder: string;
  sendLabel: string;
}

export function ChatComposer({
  colors,
  value,
  onChangeText,
  onFocus,
  onSend,
  sending,
  canSendBody,
  placeholder,
  sendLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    // iOS: will* tracks the keyboard animation so padding grows with the lift.
    // Android: only did* is reliable.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Keyboard closed: the tab bar already owns the home-indicator inset — only
  // Spacing.sm, or the composer sits too high. Keyboard open: the keyboard
  // covers the tab bar, so we must re-apply the safe-area inset or the
  // composer lands short and overlaps the keyboard (the pre-decomposition
  // always-on insets.bottom padding was masking this).
  const paddingBottom = keyboardVisible
    ? Math.max(insets.bottom, Spacing.sm)
    : Spacing.sm;

  return (
    <View
      style={[styles.composerRow, { borderTopColor: colors.border, paddingBottom }]}
      onStartShouldSetResponder={() => true}
    >
      <View style={[styles.composerShell, { borderColor: colors.border }]}>
        <TextInput
          value={value}
          onFocus={onFocus}
          onTouchStart={onFocus}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          style={[styles.composerInput, { color: colors.textPrimary }]}
          editable={!sending}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          onPress={onSend}
          disabled={!canSendBody || sending}
          style={[
            styles.sendButton,
            {
              backgroundColor: canSendBody ? colors.brand : colors.border,
              opacity: !canSendBody || sending ? 0.5 : 1,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={[styles.sendIcon, { color: colors.textInverse }]}>↑</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composerRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingTop: 6,
  },
  composerShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingLeft: Spacing.sm,
    paddingRight: 3,
    paddingVertical: 3,
    gap: 4,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? 7 : 5,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendIcon: {
    fontSize: FontSize.md,
    fontWeight: '700',
    lineHeight: FontSize.md,
  },
});
