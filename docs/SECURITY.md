# Kairos — Security model

This document records Kairos’ database security architecture, what is deliberate, what was tightened, and how we evaluate Supabase Security Advisor warnings.

**Goal:** best architecture first — not zero warnings at any cost — but we actively investigate whether warnings can be eliminated without weakening the model.

**Status:** Pre-M15 security review **complete** (migrations through `261620`). Remaining Advisor items are documented intentional outcomes below.

**Post-M15 hardening (pre-launch production-readiness audit, `20260729100000`–`20260729100100`):** closed two real gaps found by re-deriving documented behavior from the actual SQL rather than trusting prior docs — see the Notifications and Storage RLS sections below, and the migrations table.

**Auth vault hardening (client-side, no migration version — see `src/lib/auth-storage.ts`):** session tokens moved from plaintext `AsyncStorage` to AES-256-encrypted `AsyncStorage` with the key held in `expo-secure-store` (Keychain/Keystore); see Client-side session storage below.

---

## Authentication

Kairos uses **passwordless auth only** (Email OTP via Supabase Auth). There are no user passwords in the product.

**Verified in codebase (pre-M15):**

| Flow | Implementation |
|------|----------------|
| Sign-in | `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` — `src/app/(auth)/sign-in.tsx` |
| Verify | `supabase.auth.verifyOtp({ email, token, type: 'email' })` — `src/app/(auth)/verify.tsx` |
| Session / account switch | `setSession`, `signOut`, `getSession` — no password APIs |

There is **no** `signInWithPassword`, `signUp` with password, `resetPasswordForEmail`, or password UI anywhere in the app.

| Advisor warning | Status |
|-----------------|--------|
| Leaked password protection disabled | **Not applicable** — no password sign-up or sign-in flow exists. Users authenticate with a one-time email code only. |

### Leaked password protection — Free plan limitation

Supabase’s [Password security docs](https://supabase.com/docs/guides/auth/password-security) state: *“Leaked password protection is available on the Pro Plan and above.”* The [pricing page](https://supabase.com/pricing) lists it under Pro/Team/Enterprise only (`password_hibp` entitlement).

| Question | Answer |
|----------|--------|
| Can we enable it on Free? | **No** — dashboard toggle is disabled (“Only available on Pro plan and above”). |
| Is there a config or code workaround? | **No** — feature is plan-gated; Security Advisor will report it on Free regardless of auth model. |
| Does it affect Kairos today? | **No** — nothing in our auth flow sets or checks user passwords. |
| When to revisit | Upgrade to **Pro+** and enable before shipping **any** email+password auth; until then, treat as **accepted platform noise**. |

**Future:** If email+password auth is added, upgrade to Pro (or above) and enable [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) **before** releasing that flow.

---

## Client-side session storage (auth vault, `src/lib/auth-storage.ts`)

Kairos remembers multiple signed-in accounts on one device (multi-account switching). Each remembered account's Supabase session (access + refresh token pair) is a bearer credential — equivalent in sensitivity to a password even though Kairos has none — and is treated accordingly.

| Data | Where | Why |
|------|-------|-----|
| Active/dormant account **session tokens** (per user) | `AsyncStorage`, **AES-256-CTR encrypted** | Full session JSON (JWT + refresh token + user object) routinely exceeds Expo SecureStore's ~2048-byte per-value limit, so it cannot live in SecureStore directly. |
| **AES-256 key** for the vault (one key, shared by all accounts) | `expo-secure-store` (iOS Keychain / Android Keystore) | The only artifact that needs hardware-backed protection is this ~32-byte key — small enough for SecureStore's limit, and it's the single thing that makes every encrypted session blob unreadable without device-level Keychain/Keystore access. |
| `activeUserId` + per-account snapshot (email, username, display name, avatar) | `AsyncStorage`, plaintext | Not sensitive at the storage layer; needed for fast switcher-UI rendering. |

**Key reuse (deliberate correction to the pattern in Supabase's own Expo/SecureStore docs):** the AES key is generated once and persisted, then reused for every encrypt operation, with a fresh random IV per value. Supabase's published example regenerates a new key on every write, which is invisible in a single-session tutorial but would silently corrupt every *other* account's already-encrypted vault entry in a multi-account app like Kairos.

**Display-layer redaction (`RememberedAccountRow`):** even though the snapshot's email isn't sensitive at the storage layer, a device can be shared or glanced at by someone other than the account owner. Any row that isn't the currently-authenticated account (dormant *and* signed-out rows alike) falls back to a generic label/avatar-initial instead of the stored email when `display_name`/`username` are unset — the email is used internally to drive re-authentication (pre-filling the OTP screen), but is only ever rendered on screen once that re-authentication flow is actually entered.

**Migration:** upgrading from the pre-encryption plaintext vault (or the older pre-vault single-session format) happens automatically and lazily on first use after the update — no re-authentication required. Entirely internal to `auth-storage.ts`; no other file is aware sessions are encrypted, or that they were ever stored any other way.

**Sign-out side channel (`withAuthRemoveMode`):** Supabase's storage adapter contract gives `removeItem(key)` no way to receive caller intent, but Kairos' vault needs to know *why* a `signOut()` call is happening (full purge vs. session-only vs. pointer-only — e.g. switching accounts must not touch other accounts' vaulted sessions). `withAuthRemoveMode(mode, fn)` sets that intent for the duration of `fn` and restores the default in a `finally`, so a thrown/rejected `signOut()` can never leak a non-default mode into an unrelated later call.

**Not yet covered (tracked, not forgotten):** dormant (inactive) accounts' refresh tokens are not proactively refreshed in the background. They stay valid until superseded elsewhere (Supabase rotates on use, not on a timer), so switching either succeeds instantly or falls back to OTP re-auth — never a crash. Making this fully seamless (no OTP fallback ever) is scoped as an independent follow-up.

**Crash/interruption recovery (fixed):** `addAccount()`/`reauthAccount()` deactivate the active session pointer (`deactivateActiveSessionInVault`) before navigating to sign-in, without deleting that account's stored tokens. If the app was killed in that window, the account became invisible on the sign-in screen's "signed out" list (which only lists accounts with **no** stored session) and typing its email returned a hard "already signed in" error — a real dead end, since the only place that error's suggested fix ("switch from Profile") was reachable required an active session. Fixed by treating any account with a stored session as **dormant and resumable** whenever there's no active session at all (sign-in screen "Continue on this device" list + the email-entry path), distinct from **signed out** accounts, which still require OTP. Both paths ultimately call `reauthAccount()`, which already branched correctly internally — the gap was in what the UI surfaced, not in the resume logic itself.

---

## Architecture pattern

| Layer | Mechanism |
|-------|-----------|
| Table writes (domain) | No direct `INSERT`/`UPDATE`/`DELETE` grants to `authenticated` on domain tables |
| Permissions | **SECURITY DEFINER RPCs** enforce business rules (`auth.uid()` checks, leadership columns) |
| Table reads | **SECURITY INVOKER** RPCs + RLS on underlying tables |
| Notifications (own rows) | `notifications` grants `SELECT` only to `authenticated` (RLS: `recipient_id = auth.uid()`); reads also via `list_notifications`/`count_unread_notifications` (**INVOKER**); all writes go through `mark_notification_read` (**DEFINER**) — no direct client `UPDATE` (`20260729100100`) |
| Membership helpers | **Split overloads** — one-arg public (caller-only), two-arg internal (write RPCs) |
| Other internal helpers | **SECURITY DEFINER**, `REVOKE ALL FROM PUBLIC`, no client `EXECUTE` |
| Triggers / crons | **SECURITY DEFINER**, not callable by clients |

All project-owned DEFINER functions use `SET search_path = public`.

**Leadership SSOT (M14):** Permission checks use `experiences.organizer_id` and `memories.leader_id` only. Participant rows are membership-only; list RPCs return derived `is_organizer` / `is_leader`.

---

## Membership helper functions (`261610`)

Three helpers gate RLS and Storage. They use **PostgreSQL overloads**:

| Signature | Callable by `authenticated`? | Purpose |
|-----------|------------------------------|---------|
| `is_experience_participant(uuid)` | **Yes** | RLS — checks **caller only** (`auth.uid()`) |
| `is_experience_participant(uuid, uuid)` | **No** | Internal — write RPCs test arbitrary users |
| `is_pending_experience_invitee(uuid)` | **Yes** | RLS — caller’s pending invite only |
| `is_pending_experience_invitee(uuid, uuid)` | **No** | Internal |
| `is_active_memory_participant(uuid)` | **Yes** | RLS + Storage — caller’s active membership only |
| `is_active_memory_participant(uuid, uuid)` | **No** | Internal — write RPCs pass explicit `v_me` |

**Why split?** The two-arg forms were previously granted to `authenticated`, allowing membership probing via `/rest/v1/rpc`. RLS and Storage only need the one-arg form. Write RPCs call the two-arg form as function owner — no client grant required.

**Why one-arg stays DEFINER:** These helpers are referenced **inside RLS policies on the same tables they query**. `SECURITY DEFINER` breaks RLS recursion. They remain callable by clients but are caller-only (safe).

---

## Other internal helpers

| Function | Callable by `authenticated`? | Why |
|----------|------------------------------|-----|
| `memory_has_active_participants(uuid)` | **No** | Internal only (orphan purge, leave flow, crons) |
| `experience_min_starts_at()` | **No** | Internal only — called from write RPCs |
| `resolve_discoverable_profile_id(text)` | **No** | Internal only — friend write RPCs |
| `elect_memory_leader`, `purge_memory_if_orphaned`, … | **No** | Internal / cron only |
| `enqueue_notification`, `notify_experience_participants`, … | **No** | Called from write RPCs only |
| Trigger functions (`handle_*`, `trigger_storage_cleanup_*`) | **No** | Trigger-only |

---

## Client RPC inventory (`GRANT EXECUTE TO authenticated`)

### Profile / discovery (INVOKER reads)

| RPC | Security | Notes |
|-----|----------|-------|
| `search_profiles` | INVOKER | RLS on `profiles` |
| `get_public_profile` | INVOKER | RLS + discoverability rules |

### Friendships

| RPC | Security | Notes |
|-----|----------|-------|
| `list_friends` | INVOKER | `friendships_select_own` RLS |
| `list_incoming_friend_requests` | INVOKER | Same RLS |
| `count_my_friends` | INVOKER | Changed from DEFINER in `251400` |
| `send_friend_request` | DEFINER | Write |
| `accept_friend_request` | DEFINER | Write |
| `decline_friend_request` | DEFINER | Write |
| `cancel_friend_request` | DEFINER | Write |
| `remove_friend` | DEFINER | Write |

### Experiences (M12 + M14)

| RPC | Security | Notes |
|-----|----------|-------|
| `list_my_home_experiences` | INVOKER | Participant join + RLS |
| `get_experience` | INVOKER | Viewer flags, mute, pending invite |
| `list_incoming_experience_invitations` | INVOKER | Invitee-scoped |
| `list_experience_participants` | DEFINER | Cross-role profile gating; deferred INVOKER |
| `list_experience_invitations` | DEFINER | Leader + participant views |
| `list_experience_invite_suggestions` | DEFINER | Leader review queue |
| `create_experience` … `set_experience_notifications_muted` | DEFINER | Writes — see migrations |
| `ensure_experience_transformed` | DEFINER | Lazy transform — callable by **any participant** (not organizer-only); idempotent and time-gated (`status = 'planned' AND transform_at <= NOW()`), so no caller-identity restriction is needed |
| `purge_my_stale_experiences` | DEFINER | Eager purge before Home list |
| `transform_my_due_experiences` | DEFINER | Batch transform before lists |

### Notifications (M14 foundation — inbox UI in M19)

| RPC | Security | Notes |
|-----|----------|-------|
| `list_notifications` | INVOKER | Paginated inbox; RLS `recipient_id = auth.uid()` |
| `count_unread_notifications` | INVOKER | Badge count |
| `mark_notification_read` | INVOKER | Own-row UPDATE; RLS mirrors RPC guard (`261620`) |
| `set_experience_notifications_muted` | DEFINER | Participant row UPDATE — no table grant |
| `set_memory_notifications_muted` | DEFINER | Participant row UPDATE — no table grant |

### Memories

| RPC | Security | Notes |
|-----|----------|-------|
| `transform_my_due_experiences` | DEFINER | Explicit write side-effect before list |
| `list_my_memories` | INVOKER | RLS + participant join (`261620`) |
| `get_memory` | INVOKER | Same |
| `list_memory_participants` | INVOKER | RLS + `is_active_memory_participant` gate |
| `list_memory_media` | INVOKER | RLS on `memory_media` |
| `count_my_memories` | **Not granted** | Reserved for future Profile UI |
| `update_memory_info` … `delete_memory_photo` | DEFINER | Writes |

---

## Intentional remaining Security Advisor warnings

After `261620`, **36** `authenticated_security_definer_function_executable` warnings are expected and correct, plus **1** `auth_leaked_password_protection` on the **Free plan** (N/A for OTP-only auth — see Authentication).

| Category | Count | Why keep DEFINER |
|----------|------:|------------------|
| Membership helpers (one-arg) | 3 | RLS/Storage recursion break; caller-only |
| Experience list reads | 3 | Cross-role profile gating; higher INVOKER risk |
| Domain write + side-effect RPCs | 30 | RPC-only write model — no table write grants |
| **Total intentional DEFINER** | **36** | |

**Domain write + side-effect RPCs (30):** friendship writes (5), experience writes/lifecycle/side-effects (17), memory writes (6), notification mute on participant rows (2).

Migrating these to INVOKER would require reopening table write grants and duplicating state machines in RLS — **architecturally worse**.

**Experience list DEFINER reads (3):** Could be migrated later with careful RLS work; deferred — not worth pre-M15 churn.

**Performance warnings** (RLS initplan, overlapping permissive policies): tracked separately; not part of this security review.

---

## Storage RLS

| Bucket | Policy | Notes |
|--------|--------|-------|
| `memories` (SELECT/DELETE) | `is_active_memory_participant(uuid)` | PostgreSQL requires EXECUTE on functions referenced in policy expressions for the calling role. |
| `memories` (INSERT) | `is_active_memory_participant(uuid)` **and** `memories.add_media_policy = 'all_participants' OR memories.leader_id = auth.uid()` | Mirrors `register_memory_photo()`'s policy check exactly (`20260729100100`) — previously the storage layer only checked membership, so a participant could upload directly to storage even when the memory was `leader_only`. |

Client must **not** call `storage.remove` for lifecycle deletes — DB triggers + Edge Functions handle cleanup.

---

## Experience RLS — overlapping SELECT policies

M12 created `experiences_select_organizer`. M14 added participant and pending-invitee policies. PostgreSQL OR-combines permissive policies — overlap is harmless. `experiences_select_organizer` is redundant but kept until measured.

---

## Migrations (security-relevant)

| Version | Purpose |
|---------|---------|
| `251400` | RPC EXECUTE audit — revoke internal helper grants; `count_my_friends` → INVOKER |
| `261601` | Revoke accidental client grant on `transform_experience_to_memory` |
| `261610` | Membership helper hardening — split one-arg / two-arg; revoke two-arg from clients |
| `261620` | Memory read RPCs + `mark_notification_read` → INVOKER |
| `20260729100000` | Deterministic lock order + `SKIP LOCKED` for `transform_my_due_experiences` / `purge_my_stale_experiences` (deadlock risk under concurrent shared-experience access) |
| `20260729100100` | Revoke direct client `UPDATE` on `notifications` (RPC-only writes); enforce `add_media_policy` in memory storage upload RLS |

---

## Evaluating Security Advisor warnings

| Warning | Kairos response |
|---------|-----------------|
| DEFINER + authenticated on **write RPCs** | **Expected** — RPC-only write model |
| DEFINER + authenticated on **one-arg membership helpers** | **Expected** — RLS recursion break; caller-only |
| DEFINER + authenticated on **experience list read RPCs** | **Expected for now** — deferred INVOKER migration |
| Leaked password protection | **Accepted on Free plan** — Pro+ only; N/A for OTP-only auth |
| RLS initplan / multiple permissive policies | Performance — out of scope for security review |
| Platform internals (`rls_auto_enable`, etc.) | Out of scope |

Run `npx supabase db lint --linked` and `npx supabase db advisors --linked` after each migration push.
