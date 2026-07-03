import { router } from 'expo-router';

interface ResetOptions {
  /** Pop Profile nested routes (e.g. switch-account) before selecting Home. */
  resetProfileStack?: boolean;
}

/**
 * After account switch: land on Home via Expo Router.
 * When leaving switch-account, replace alone switches tabs but leaves switch-account
 * on the Profile stack until the next popToTopOnBlur cycle — dismissTo profile first.
 */
export function resetAppNavigationToHome(options?: ResetOptions) {
  if (options?.resetProfileStack) {
    router.dismissTo('/(app)/(profile)');
  }
  router.replace('/(app)/(home)');
}
