import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { RememberedAccountRow } from '@/components/RememberedAccountRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { RememberedAccount } from '@/lib/auth-storage';
import { otpPending } from '@/lib/otp-pending';
import { supabase } from '@/lib/supabase';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StoredEmailCheck = 'ok' | 'already_active' | 'already_signed_in' | 'signed_out_remembered';

function findRememberedByEmail(
  email: string,
  accounts: RememberedAccount[],
): RememberedAccount | undefined {
  const normalized = email.trim().toLowerCase();
  return accounts.find((account) => account.email.toLowerCase() === normalized);
}

function resolveStoredEmail(
  email: string,
  sessionEmail: string | undefined,
  accounts: RememberedAccount[],
  reauthTargetUserId?: string,
): StoredEmailCheck {
  const normalized = email.trim().toLowerCase();
  const match = findRememberedByEmail(normalized, accounts);

  if (reauthTargetUserId && match?.userId === reauthTargetUserId) {
    return 'ok';
  }

  if (sessionEmail?.toLowerCase() === normalized) {
    return 'already_active';
  }
  if (match?.hasSession) {
    return 'already_signed_in';
  }
  if (match) {
    return 'signed_out_remembered';
  }
  return 'ok';
}

export default function SignInScreen() {
  const { mode, returnUserId, targetUserId } = useLocalSearchParams<{
    mode?: string;
    returnUserId?: string;
    targetUserId?: string;
  }>();
  const isAddAccountMode = mode === 'add-account';
  const isReauthMode = mode === 'reauth-account';
  const { session, accounts, cancelAddAccount, reauthAccount } = useAuth();
  const { t } = useI18n();

  const reauthTarget = useMemo(
    () => (isReauthMode && targetUserId ? accounts.find((a) => a.userId === targetUserId) : undefined),
    [accounts, isReauthMode, targetUserId],
  );

  const signedOutAccounts = useMemo(
    () => accounts.filter((account) => !account.hasSession),
    [accounts],
  );

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [reauthLoadingUserId, setReauthLoadingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (reauthTarget?.email) {
      setEmail(reauthTarget.email);
    }
  }, [reauthTarget?.email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function mapSendError(message: string): string {
    if (
      /sending/i.test(message) ||
      /magic link/i.test(message) ||
      /smtp/i.test(message) ||
      /email.*error/i.test(message)
    ) {
      return t('auth.signIn.error.sendFailed');
    }
    return t('auth.signIn.error.generic');
  }

  async function handleCancelReturn() {
    if (!returnUserId || canceling) return;

    setCanceling(true);
    setError(null);
    try {
      const ok = await cancelAddAccount(returnUserId);
      if (!ok) {
        setError(t('auth.signIn.addAccount.cancelFailed'));
      }
    } finally {
      setCanceling(false);
    }
  }

  async function handleRememberedLogIn(userId: string) {
    if (reauthLoadingUserId) return;
    setReauthLoadingUserId(userId);
    setError(null);
    try {
      await reauthAccount(userId);
    } finally {
      setReauthLoadingUserId(null);
    }
  }

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || cooldown > 0) return;

    if (!EMAIL_FORMAT.test(trimmed)) {
      setError(t('auth.signIn.error.invalidEmail'));
      return;
    }

    const storedCheck = resolveStoredEmail(
      trimmed,
      session?.user.email,
      accounts,
      reauthTarget?.userId,
    );

    if (storedCheck === 'already_active') {
      setError(t('auth.signIn.error.alreadyActive'));
      return;
    }
    if (storedCheck === 'already_signed_in') {
      setError(t('auth.signIn.error.alreadySignedIn'));
      return;
    }
    if (storedCheck === 'signed_out_remembered') {
      const remembered = findRememberedByEmail(trimmed, accounts);
      if (remembered) {
        await handleRememberedLogIn(remembered.userId);
      }
      return;
    }

    setLoading(true);
    setError(null);

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (sendError) {
      const match = sendError.message.match(/(\d+) second/);
      if (match) {
        setCooldown(parseInt(match[1], 10));
      } else {
        setError(mapSendError(sendError.message));
      }
      return;
    }

    otpPending.set(trimmed);
    router.push({ pathname: '/(auth)/verify', params: { email: trimmed } });
  }

  const showRememberedList =
    !session && !isReauthMode && !isAddAccountMode && signedOutAccounts.length > 0;

  const subtitle = isReauthMode
    ? t('auth.signIn.reauth.subtitle', {
        name: reauthTarget?.display_name ?? reauthTarget?.username ?? reauthTarget?.email ?? '',
      })
    : isAddAccountMode
      ? t('auth.signIn.addAccount.subtitle')
      : t('auth.signIn.subtitle');

  return (
    <Screen centered avoidKeyboard>
      <Text variant="title" style={styles.title}>
        {t('auth.signIn.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {subtitle}
      </Text>

      {showRememberedList ? (
        <View style={styles.rememberedBlock}>
          <Text variant="body" style={styles.rememberedHeading}>
            {t('auth.signIn.remembered.title')}
          </Text>
          {signedOutAccounts.map((account) => (
            <RememberedAccountRow
              key={account.userId}
              account={account}
              isLoading={reauthLoadingUserId === account.userId}
              disabled={reauthLoadingUserId !== null && reauthLoadingUserId !== account.userId}
              onLogIn={() => handleRememberedLogIn(account.userId)}
            />
          ))}
          <Text variant="caption" style={styles.rememberedDivider}>
            {t('auth.signIn.remembered.orEmail')}
          </Text>
        </View>
      ) : null}

      <Input
        value={email}
        onChangeText={(text) => {
          if (!isReauthMode) {
            setEmail(text);
            setError(null);
          }
        }}
        placeholder={t('auth.signIn.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isReauthMode}
        style={styles.input}
      />
      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {cooldown > 0 ? (
        <Text variant="error" style={styles.error}>
          {t('auth.signIn.rateLimited', { seconds: String(cooldown) })}
        </Text>
      ) : null}
      <Button
        label={isReauthMode ? t('switchAccount.logIn') : t('auth.signIn.submit')}
        onPress={handleSendCode}
        loading={loading}
        disabled={cooldown > 0 || canceling || reauthLoadingUserId !== null}
        style={styles.submitButton}
      />
      {(isAddAccountMode || isReauthMode) && returnUserId ? (
        <Button
          label={t('auth.signIn.addAccount.cancel')}
          variant="secondary"
          onPress={handleCancelReturn}
          loading={canceling}
          disabled={loading || reauthLoadingUserId !== null}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  rememberedBlock: {
    width: '100%',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  rememberedHeading: {
    marginBottom: Spacing.xs,
  },
  rememberedDivider: {
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    marginBottom: Spacing.md,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  submitButton: {
    marginBottom: Spacing.sm,
  },
});
