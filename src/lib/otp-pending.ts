// In-memory tracker for the currently active OTP flow.
//
// Not persisted — the variable is cleared on every app restart since module
// state does not survive process termination. This is intentional: it lets
// the verify screen detect whether it was navigated to legitimately (from
// sign-in's handleSendCode) or restored from Expo Router's saved navigation
// state after a restart, and redirect back to sign-in in the latter case.

let _pendingEmail: string | null = null;

export const otpPending = {
  set: (email: string) => {
    _pendingEmail = email;
  },
  get: (): string | null => _pendingEmail,
  clear: () => {
    _pendingEmail = null;
  },
};
