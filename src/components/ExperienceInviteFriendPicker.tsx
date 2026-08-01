import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ExperienceFriendPicker } from '@/components/ExperienceFriendPicker';
import { Spacing } from '@/constants/theme';

interface Props {
  openLabel: string;
  hideLabel: string;
  /** Label for the submit button given the current selection count. */
  submitLabelForCount: (count: number) => string;
  excludeUserIds: string[];
  actionLoading: boolean;
  disabled?: boolean;
  /**
   * When this becomes true, collapse the picker (e.g. the leave-successor
   * chooser opened). Becoming false is a no-op so closing that other UI
   * does not force-close this one.
   */
  collapseWhen?: boolean;
  /** Fired when this picker opens so the parent can close other expanders. */
  onOpen?: () => void;
  /**
   * Return true when the picker should close (typically any success in a
   * best-effort batch). Selection is cleared only on close.
   */
  onSubmit: (friendIds: string[]) => Promise<boolean>;
}

/**
 * Toggle + multi-friend picker + submit used for both "Invite friends"
 * (leader) and "Suggest friends" (participant). The two modes are mutually
 * exclusive in the parent, so open/selection state lives here rather than
 * being shared across both flows.
 */
export function ExperienceInviteFriendPicker({
  openLabel,
  hideLabel,
  submitLabelForCount,
  excludeUserIds,
  actionLoading,
  disabled = false,
  collapseWhen = false,
  onOpen,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  useEffect(() => {
    if (!collapseWhen) return;
    setOpen(false);
    setSelectedFriendIds([]);
  }, [collapseWhen]);

  function handleToggle() {
    setOpen((currentlyOpen) => {
      const nextOpen = !currentlyOpen;
      if (nextOpen) {
        onOpen?.();
      } else {
        setSelectedFriendIds([]);
      }
      return nextOpen;
    });
  }

  async function handleSubmit() {
    if (selectedFriendIds.length === 0) return;
    const shouldClose = await onSubmit(selectedFriendIds);
    if (shouldClose) {
      setSelectedFriendIds([]);
      setOpen(false);
    }
  }

  // Hide immediately when `collapseWhen` flips true (same paint as the other
  // expander opening). The effect below then clears local state so the toggle
  // label and selection reset without waiting for a second interaction.
  const visiblyOpen = open && !collapseWhen;

  return (
    <>
      <Button
        label={visiblyOpen ? hideLabel : openLabel}
        variant="secondary"
        onPress={handleToggle}
        disabled={disabled || actionLoading}
      />
      {visiblyOpen ? (
        <View style={styles.pickerBlock}>
          <ExperienceFriendPicker
            selectedIds={selectedFriendIds}
            onChange={setSelectedFriendIds}
            multiple
            excludeUserIds={excludeUserIds}
          />
          <Button
            label={submitLabelForCount(selectedFriendIds.length)}
            onPress={() => void handleSubmit()}
            loading={actionLoading}
            disabled={selectedFriendIds.length === 0}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pickerBlock: {
    gap: Spacing.sm,
  },
});
