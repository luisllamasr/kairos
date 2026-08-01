import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import {
  acceptExperienceInvitation,
  cancelExperience,
  declineExperienceInvitation,
  getExperience,
  leaveExperience,
  listExperienceInvitations,
  listExperienceInviteSuggestions,
  listExperienceParticipants,
  removeExperienceParticipant,
  reviewExperienceInviteSuggestion,
  reviveExperience,
  ExperienceBatchSocialResult,
  sendExperienceInvitations,
  setExperienceNotificationsMuted,
  suggestExperienceInvites,
  transferExperienceLeadership,
  withdrawExperienceInvitation,
  withdrawExperienceInviteSuggestion,
} from '@/lib/experiences';
import { ensureExperienceTransformed } from '@/lib/memories';
import {
  canAccessExperienceChat,
  canCancelExperience,
  canEditExperience,
  canLeaveExperience,
  canManageExperienceParticipants,
  canReviveExperience,
  Experience,
  ExperienceInvitation,
  ExperienceInviteSuggestion,
  ExperienceParticipant,
  hasActiveExperienceLeader,
  isExperienceEnded,
  isExperienceUpcoming,
  isLastExperienceParticipant,
  isPendingExperienceInvitee,
  needsLeaveSuccessor,
} from '@/types/experience';

/**
 * All data/mutation state for the experience detail screen. Confirmation
 * dialogs (Alert.alert) and anything needing translated strings stay in the
 * screen — this hook only performs the underlying mutation and reports
 * success/failure, mirroring `useExperienceChat`'s split.
 */
export function useExperienceDetail(experienceId: string | null) {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [participants, setParticipants] = useState<ExperienceParticipant[]>([]);
  const [invitations, setInvitations] = useState<ExperienceInvitation[]>([]);
  const [suggestions, setSuggestions] = useState<ExperienceInviteSuggestion[]>([]);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Synchronous re-entrancy guard for runAction (see below) — a ref rather
  // than the actionLoading state itself, since state updates aren't visible
  // to a second call that starts before the first re-render commits.
  const actionLoadingRef = useRef(false);

  // Stale-response guard for loadExperience: focus can re-trigger a refresh
  // before a previous one has resolved (fast back-and-forth navigation), and
  // without this an older, slower response could overwrite a newer one's
  // result. Same pattern as useExperienceChat's loadInitial.
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadExperience = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const isStale = () => !mountedRef.current || loadGenerationRef.current !== generation;

    if (!experienceId) {
      setExperience(null);
      return;
    }

    setError(false);

    const { data, error: loadError } = await getExperience(experienceId);
    if (isStale()) return;
    if (loadError || !data) {
      setExperience(null);
      setParticipants([]);
      setInvitations([]);
      setSuggestions([]);
      setError(loadError);
      return;
    }

    const ended = isExperienceEnded(data);
    const cancelled = data.status === 'cancelled';

    if (ended && !cancelled) {
      const { data: memoryId, error: transformError } =
        await ensureExperienceTransformed(experienceId);
      if (isStale()) return;
      if (memoryId) {
        router.replace({
          pathname: '/(app)/(profile)/memories/[id]',
          params: { id: memoryId },
        });
        return;
      }
      if (transformError) {
        setExperience(data);
        setError(true);
        return;
      }
    }

    // Invitations + suggestions are visible to every accepted participant
    // (not only the leader) so the picker can exclude already-invited /
    // already-suggested friends and so members share the same pending state.
    const loadSocial = data.am_participant && data.status === 'planned';

    const [participantsResult, invitationsResult, suggestionsResult] = await Promise.all([
      listExperienceParticipants(experienceId),
      loadSocial
        ? listExperienceInvitations(experienceId)
        : Promise.resolve({ data: [], error: false }),
      loadSocial
        ? listExperienceInviteSuggestions(experienceId)
        : Promise.resolve({ data: [], error: false }),
    ]);
    if (isStale()) return;

    setExperience(data);
    setParticipants(participantsResult.data);
    setInvitations(invitationsResult.data);
    setSuggestions(suggestionsResult.data);
    setError(participantsResult.error);
  }, [experienceId]);

  const { initialLoading, refresh, resetLoaded } = useFocusRefresh(loadExperience);

  useEffect(() => {
    resetLoaded();
  }, [experienceId, resetLoaded]);

  const contentExperience = experience?.id === experienceId ? experience : null;

  const upcoming = experience ? isExperienceUpcoming(experience) : false;
  const ended = experience ? isExperienceEnded(experience) : false;
  const cancelled = experience?.status === 'cancelled';
  const editable = experience ? canEditExperience(experience) : false;
  const cancellable = experience ? canCancelExperience(experience) : false;
  const manageable = experience ? canManageExperienceParticipants(experience) : false;
  const leavable = experience ? canLeaveExperience(experience) : false;
  const leaveNeedsSuccessor = experience
    ? needsLeaveSuccessor(experience, participants.length)
    : false;
  const leaveDeletesPlan = isLastExperienceParticipant(participants.length);
  const revivable = experience ? canReviveExperience(experience) : false;
  const invitesOpen = experience ? upcoming && hasActiveExperienceLeader(experience) : false;
  const pendingInvitee = experience ? isPendingExperienceInvitee(experience) : false;
  const isMember = experience?.am_participant ?? false;
  const chatAccessible = experience ? canAccessExperienceChat(experience) : false;

  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => inv.status === 'pending'),
    [invitations],
  );
  const pendingSuggestions = useMemo(
    () => suggestions.filter((s) => s.status === 'pending'),
    [suggestions],
  );
  const excludeFriendIds = useMemo(() => {
    const ids = new Set(participants.map((p) => p.user_id));
    invitations
      .filter((inv) => inv.status === 'pending')
      .forEach((inv) => ids.add(inv.invitee_id));
    suggestions
      .filter((s) => s.status === 'pending')
      .forEach((s) => ids.add(s.suggested_user_id));
    return Array.from(ids);
  }, [participants, invitations, suggestions]);

  /**
   * Shared wrapper for every mutation below: manages actionLoading/
   * actionError and reports success back to the caller so it can decide
   * whether to navigate, refresh, or reset local UI state (e.g. closing a
   * picker only on success, matching the previous per-action behavior).
   *
   * The actionLoadingRef guard closes a real gap: `cancel`/`remove`/`leave`/
   * `revive`/`removeParticipant`/`transferLeadership` were already guarded by
   * the screen's Alert.alert confirmation handlers before this refactor, but
   * `toggleMute`, `sendInvite`, `suggestInvite`, `reviewSuggestion`,
   * `acceptInvitation` and `declineInvitation` had no re-entrancy guard of
   * their own — they relied solely on a button's `disabled`/`loading` prop,
   * which has a brief window (between the state update and the native view
   * re-rendering) where a fast double-tap could fire the same mutation
   * twice. Centralizing the guard here closes that gap for all 12 actions
   * uniformly instead of relying on each call site remembering to check.
   */
  const runAction = useCallback(
    async (
      perform: () => Promise<{ error: boolean; errorCode?: string }>,
      errorLabel: string | ((errorCode?: string) => string),
    ): Promise<boolean> => {
      if (actionLoadingRef.current) return false;
      actionLoadingRef.current = true;
      setActionLoading(true);
      setActionError(null);

      const result = await perform();

      actionLoadingRef.current = false;
      setActionLoading(false);

      if (result.error) {
        setActionError(
          typeof errorLabel === 'function' ? errorLabel(result.errorCode) : errorLabel,
        );
        return false;
      }
      return true;
    },
    [],
  );

  const cancel = useCallback(
    async (errorLabel: string) => {
      if (!experience) return;
      if (await runAction(() => cancelExperience(experience.id), errorLabel)) await refresh();
    },
    [experience, refresh, runAction],
  );

  const leave = useCallback(
    async (errorLabel: string, newOrganizerId?: string) => {
      if (!experience) return;
      if (await runAction(() => leaveExperience(experience.id, newOrganizerId), errorLabel)) {
        router.replace('/(app)/(home)');
      }
    },
    [experience, runAction],
  );

  const revive = useCallback(
    async (errorLabel: string) => {
      if (!experience) return;
      if (await runAction(() => reviveExperience(experience.id), errorLabel)) await refresh();
    },
    [experience, refresh, runAction],
  );

  const removeParticipant = useCallback(
    async (userId: string, errorLabel: string) => {
      if (!experience) return;
      if (await runAction(() => removeExperienceParticipant(experience.id, userId), errorLabel)) {
        await refresh();
      }
    },
    [experience, refresh, runAction],
  );

  const transferLeadership = useCallback(
    async (userId: string, errorLabel: string) => {
      if (!experience) return;
      if (
        await runAction(() => transferExperienceLeadership(experience.id, userId), errorLabel)
      ) {
        await refresh();
      }
    },
    [experience, refresh, runAction],
  );

  /**
   * Best-effort batch invite/suggest. Refreshes when anything succeeded.
   * Sets actionError from `formatError` when there are failures (or a hard
   * RPC error). Returns true when the picker should close (any success).
   */
  const runBatchSocial = useCallback(
    async (
      perform: () => Promise<ExperienceBatchSocialResult>,
      formatError: (
        result: ExperienceBatchSocialResult,
      ) => string | null,
    ): Promise<boolean> => {
      if (actionLoadingRef.current) return false;
      actionLoadingRef.current = true;
      setActionLoading(true);
      setActionError(null);

      const result = await perform();

      actionLoadingRef.current = false;
      setActionLoading(false);

      if (result.sent.length > 0) {
        await refresh();
      }

      const message = formatError(result);
      if (message) setActionError(message);

      return result.sent.length > 0;
    },
    [refresh],
  );

  const sendInvites = useCallback(
    async (
      friendIds: string[],
      formatError: (result: ExperienceBatchSocialResult) => string | null,
    ): Promise<boolean> => {
      if (!experience || friendIds.length === 0) return false;
      return runBatchSocial(
        () => sendExperienceInvitations(experience.id, friendIds),
        formatError,
      );
    },
    [experience, runBatchSocial],
  );

  const suggestInvites = useCallback(
    async (
      friendIds: string[],
      formatError: (result: ExperienceBatchSocialResult) => string | null,
    ): Promise<boolean> => {
      if (!experience || friendIds.length === 0) return false;
      return runBatchSocial(
        () => suggestExperienceInvites(experience.id, friendIds),
        formatError,
      );
    },
    [experience, runBatchSocial],
  );

  const reviewSuggestion = useCallback(
    async (
      suggestionId: string,
      approve: boolean,
      errorLabel: string | ((errorCode?: string) => string),
    ) => {
      if (
        await runAction(
          () => reviewExperienceInviteSuggestion(suggestionId, approve),
          errorLabel,
        )
      ) {
        await refresh();
      }
    },
    [refresh, runAction],
  );

  const withdrawInvitation = useCallback(
    async (invitationId: string, errorLabel: string) => {
      if (await runAction(() => withdrawExperienceInvitation(invitationId), errorLabel)) {
        await refresh();
      }
    },
    [refresh, runAction],
  );

  const withdrawSuggestion = useCallback(
    async (suggestionId: string, errorLabel: string) => {
      if (
        await runAction(() => withdrawExperienceInviteSuggestion(suggestionId), errorLabel)
      ) {
        await refresh();
      }
    },
    [refresh, runAction],
  );

  const toggleMute = useCallback(
    async (errorLabel: string) => {
      if (!experience || !isMember) return;
      if (
        await runAction(
          () => setExperienceNotificationsMuted(experience.id, !experience.notifications_muted),
          errorLabel,
        )
      ) {
        await refresh();
      }
    },
    [experience, isMember, refresh, runAction],
  );

  const acceptInvitation = useCallback(
    async (errorLabel: string) => {
      const invitationId = experience?.pending_invitation_id;
      if (!invitationId) return;
      if (await runAction(() => acceptExperienceInvitation(invitationId), errorLabel)) {
        await refresh();
      }
    },
    [experience, refresh, runAction],
  );

  const declineInvitation = useCallback(
    async (errorLabel: string) => {
      const invitationId = experience?.pending_invitation_id;
      if (!invitationId) return;
      if (await runAction(() => declineExperienceInvitation(invitationId), errorLabel)) {
        router.replace('/(app)/(home)/invitations');
      }
    },
    [experience, runAction],
  );

  return {
    experience,
    participants,
    invitations,
    suggestions,
    error,
    contentExperience,
    initialLoading,
    refresh,
    actionLoading,
    actionError,

    upcoming,
    ended,
    cancelled,
    editable,
    cancellable,
    manageable,
    leavable,
    leaveNeedsSuccessor,
    leaveDeletesPlan,
    revivable,
    invitesOpen,
    pendingInvitee,
    isMember,
    chatAccessible,
    pendingInvitations,
    pendingSuggestions,
    excludeFriendIds,

    cancel,
    leave,
    revive,
    removeParticipant,
    transferLeadership,
    sendInvites,
    suggestInvites,
    reviewSuggestion,
    withdrawInvitation,
    withdrawSuggestion,
    toggleMute,
    acceptInvitation,
    declineInvitation,
  };
}

export type UseExperienceDetailResult = ReturnType<typeof useExperienceDetail>;
