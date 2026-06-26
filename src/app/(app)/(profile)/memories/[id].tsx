import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { MemoryParticipantActionsMenu } from '@/components/MemoryParticipantActionsMenu';
import { MemoryPhotoViewer } from '@/components/MemoryPhotoViewer';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { TEXT_LIMITS, isWithinTextLimit } from '@/constants/text-limits';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatExperienceRange } from '@/lib/experience-dates';
import { uploadMemoryPhoto } from '@/lib/memory-photos';
import {
  deleteMemoryPhoto,
  getMemory,
  getMemoryPhotoSignedUrl,
  leaveMemory,
  listMemoryMedia,
  listMemoryParticipants,
  transferMemoryLeadership,
  updateMyMemoryNote,
} from '@/lib/memories';
import { getAvatarPublicUrl } from '@/lib/profile';
import {
  Memory,
  MemoryMedia,
  MemoryParticipant,
  isMemoryParticipantActive,
  memoryParticipantDisplayName,
} from '@/types/memory';

export default function MemoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [memory, setMemory] = useState<Memory | null>(null);
  const [participants, setParticipants] = useState<MemoryParticipant[]>([]);
  const [media, setMedia] = useState<MemoryMedia[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [personalNote, setPersonalNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const myUserId = session?.user.id ?? null;

  const loadPhotoUrls = useCallback(async (items: MemoryMedia[]) => {
    const entries = await Promise.all(
      items.map(async (item) => {
        const url = await getMemoryPhotoSignedUrl(item.storage_path);
        return [item.id, url] as const;
      }),
    );
    const next: Record<string, string> = {};
    for (const [mediaId, url] of entries) {
      if (url) next[mediaId] = url;
    }
    setPhotoUrls(next);
  }, []);

  const loadMemory = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setMemory(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    const [memoryResult, participantsResult, mediaResult] = await Promise.all([
      getMemory(id),
      listMemoryParticipants(id),
      listMemoryMedia(id),
    ]);

    if (memoryResult.error || participantsResult.error || mediaResult.error || !memoryResult.data) {
      setMemory(null);
      setError(true);
      setLoading(false);
      return;
    }

    setMemory(memoryResult.data);
    setParticipants(participantsResult.data);
    setMedia(mediaResult.data);
    setPersonalNote(memoryResult.data.my_personal_note ?? '');
    setLoading(false);
    await loadPhotoUrls(mediaResult.data);
  }, [id, loadPhotoUrls]);

  useFocusEffect(
    useCallback(() => {
      void loadMemory();
    }, [loadMemory]),
  );

  function participantLabel(participant: MemoryParticipant): string {
    return memoryParticipantDisplayName(participant, {
      deletedUser: t('memories.participant.deletedUser'),
      unknown: t('memories.participant.unknown'),
    });
  }

  function activeParticipantsExcludingSelf(): MemoryParticipant[] {
    return participants.filter(
      (p) =>
        isMemoryParticipantActive(p) &&
        p.user_id !== null &&
        p.user_id !== myUserId,
    );
  }

  async function handleSaveNote() {
    if (!memory || actionLoading) return;

    const trimmed = personalNote.trim();
    const note = trimmed || null;
    if (!isWithinTextLimit(note, TEXT_LIMITS.personalNote)) {
      setActionError(t('memories.error.noteTooLong'));
      return;
    }

    setActionLoading(true);
    setActionError(null);
    const result = await updateMyMemoryNote(memory.id, note);
    setActionLoading(false);

    if (result.error) {
      setActionError(t('memories.error.saveNote'));
      return;
    }

    setMemory((current) => (current ? { ...current, my_personal_note: note } : current));
  }

  async function handlePickPhoto() {
    if (!memory || actionLoading) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setActionError(t('memories.error.photoPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.8,
      base64: true,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    const base64 = asset.base64;
    if (!base64) return;

    const mimeType = asset.mimeType ?? 'image/jpeg';

    setActionLoading(true);
    setActionError(null);

    const upload = await uploadMemoryPhoto(base64, memory.id, mimeType);
    setActionLoading(false);

    if (upload.error) {
      setActionError(t('memories.error.addPhoto'));
      return;
    }

    await loadMemory();
  }

  function handleDeletePhotoPress(item: MemoryMedia) {
    if (!memory || actionLoading) return;

    Alert.alert(t('memories.deleteConfirm.title'), t('memories.deleteConfirm.message'), [
      { text: t('memories.deleteConfirm.cancel'), style: 'cancel' },
      {
        text: t('memories.deleteConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void runDeletePhoto(item);
        },
      },
    ]);
  }

  async function runDeletePhoto(item: MemoryMedia) {
    if (!memory) return;

    setActionLoading(true);
    setActionError(null);

    const result = await deleteMemoryPhoto(item.id);
    setActionLoading(false);

    if (result.error) {
      setActionError(t('memories.error.deletePhoto'));
      return;
    }

    setPhotoViewerOpen(false);
    await loadMemory();
  }

  async function runLeave() {
    if (!memory) return;

    setActionLoading(true);
    setActionError(null);
    const result = await leaveMemory(memory.id);
    setActionLoading(false);

    if (result.error) {
      setActionError(t('memories.error.leave'));
      return;
    }

    router.replace('/(app)/(profile)/memories');
  }

  async function runTransfer(newLeaderId: string) {
    if (!memory) return;

    setActionLoading(true);
    setActionError(null);
    const result = await transferMemoryLeadership(memory.id, newLeaderId);
    setActionLoading(false);

    if (result.error) {
      setActionError(t('memories.error.transfer'));
      return;
    }

    await loadMemory();
  }

  function handleLeavePress() {
    if (!memory || actionLoading) return;

    const successorCandidates = activeParticipantsExcludingSelf();

    if (memory.am_leader && successorCandidates.length > 0) {
      Alert.alert(
        t('memories.leaveConfirm.leaderMustTransferTitle'),
        t('memories.leaveConfirm.leaderMustTransferMessage'),
        [{ text: t('memories.leaveConfirm.leaderMustTransferOk') }],
      );
      return;
    }

    Alert.alert(t('memories.leaveConfirm.title'), t('memories.leaveConfirm.message'), [
      { text: t('memories.leaveConfirm.cancel'), style: 'cancel' },
      {
        text: t('memories.leaveConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void runLeave();
        },
      },
    ]);
  }

  function handleTransferParticipantPress(participant: MemoryParticipant) {
    if (!memory || actionLoading || participant.user_id === null) return;

    Alert.alert(
      t('memories.transferConfirm.title'),
      t('memories.transferConfirm.messageTo', { name: participantLabel(participant) }),
      [
        { text: t('memories.transferConfirm.cancel'), style: 'cancel' },
        {
          text: t('memories.transferConfirm.confirm'),
          onPress: () => {
            void runTransfer(participant.user_id!);
          },
        },
      ],
    );
  }

  const activeParticipants = participants.filter(isMemoryParticipantActive);

  return (
    <Screen avoidKeyboard edges={['top', 'left', 'right']}>
      <Button
        label={t('memories.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}

      {!loading && (error || !memory) && (
        <View style={styles.stateBlock}>
          <Text variant="error" style={styles.centered}>
            {t('memories.detail.loadError')}
          </Text>
          <Button label={t('error.retry')} onPress={loadMemory} />
        </View>
      )}

      {!loading && memory && (
        <View style={styles.content}>
          <Text variant="hero" style={styles.title}>
            {memory.title}
          </Text>

          <Text variant="subtitle" style={styles.range}>
            {formatExperienceRange(
              memory.happened_starts_at,
              memory.happened_ends_at,
              localeTag,
            )}
          </Text>

          {memory.location_name ? (
            <Text variant="body" style={styles.body}>
              {memory.location_name}
            </Text>
          ) : null}

          {memory.description ? (
            <Text variant="body" style={styles.body}>
              {memory.description}
            </Text>
          ) : null}

          {activeParticipants.length > 0 ? (
            <View style={styles.section}>
              <Text variant="title" style={styles.sectionTitle}>
                {t('memories.detail.participants')}
              </Text>
              {activeParticipants.map((participant) => (
                <View key={participant.participant_id} style={styles.participantRow}>
                  <Avatar
                    uri={getAvatarPublicUrl(participant.avatar_url)}
                    displayName={participantLabel(participant)}
                    size={40}
                  />
                  <View style={styles.participantText}>
                    <Text variant="body">{participantLabel(participant)}</Text>
                    {participant.is_leader ? (
                      <Text variant="caption">{t('memories.detail.leader')}</Text>
                    ) : null}
                  </View>
                  {memory.am_leader &&
                  participant.user_id !== null &&
                  !participant.is_leader &&
                  participant.user_id !== myUserId ? (
                    <MemoryParticipantActionsMenu
                      participantName={participantLabel(participant)}
                      disabled={actionLoading}
                      onTransfer={() => handleTransferParticipantPress(participant)}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text variant="title" style={styles.sectionTitle}>
              {t('memories.detail.photos')}
            </Text>

            {media.length === 0 ? (
              <Text variant="caption" style={styles.emptyPhotos}>
                {t('memories.detail.noPhotos')}
              </Text>
            ) : (
              <View style={styles.photoGrid}>
                {media.map((item, index) => (
                  <Pressable
                    key={item.id}
                    style={styles.photoCell}
                    disabled={!photoUrls[item.id]}
                    onPress={() => {
                      setPhotoViewerIndex(index);
                      setPhotoViewerOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('memories.photoViewer.openPhoto')}
                  >
                    {photoUrls[item.id] ? (
                      <Image
                        source={{ uri: photoUrls[item.id] }}
                        style={styles.photo}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.border }]} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <Button
              label={t('memories.detail.addPhoto')}
              variant="secondary"
              onPress={() => void handlePickPhoto()}
              loading={actionLoading}
              style={styles.sectionButton}
            />
          </View>

          <View style={styles.section}>
            <Text variant="title" style={styles.sectionTitle}>
              {t('memories.detail.personalNote')}
            </Text>
            <Text variant="caption" style={styles.noteHint}>
              {t('memories.detail.personalNoteHint')}
            </Text>
            <Input
              value={personalNote}
              onChangeText={(text) => {
                setPersonalNote(text);
                setActionError(null);
              }}
              placeholder={t('memories.detail.personalNotePlaceholder')}
              multiline
              maxLength={TEXT_LIMITS.personalNote}
              style={styles.noteInput}
            />
            <Button
              label={t('memories.detail.saveNote')}
              onPress={() => void handleSaveNote()}
              loading={actionLoading}
              style={styles.sectionButton}
            />
          </View>

          {actionError ? (
            <Text variant="error" style={styles.actionError}>
              {actionError}
            </Text>
          ) : null}

          <Button
            label={t('memories.detail.leave')}
            variant="destructive"
            onPress={handleLeavePress}
            loading={actionLoading}
          />
        </View>
      )}

      <MemoryPhotoViewer
        visible={photoViewerOpen}
        memory={memory ?? { am_leader: false }}
        media={media}
        photoUrls={photoUrls}
        participants={participants}
        initialIndex={photoViewerIndex}
        localeTag={localeTag}
        myUserId={myUserId}
        deleteLoading={actionLoading}
        onClose={() => setPhotoViewerOpen(false)}
        onDeletePhoto={memory ? handleDeletePhotoPress : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.xl,
    alignSelf: 'center',
  },
  stateBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  centered: {
    textAlign: 'center',
  },
  content: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  range: {
    marginBottom: Spacing.md,
  },
  body: {
    marginBottom: Spacing.sm,
  },
  section: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionButton: {
    marginTop: Spacing.xs,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  participantText: {
    flex: 1,
    gap: 2,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoCell: {
    width: 96,
    height: 96,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  photoPlaceholder: {
    opacity: 0.5,
  },
  emptyPhotos: {
    fontStyle: 'italic',
  },
  noteHint: {
    marginBottom: Spacing.xs,
  },
  noteInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  actionError: {
    marginTop: Spacing.sm,
  },
});
