# Kairos — Security model

This document records Kairos’ database security architecture, what is deliberate, what was tightened, and how we evaluate Supabase Security Advisor warnings.

**Goal:** best architecture first — not zero warnings at any cost — but we actively investigate whether warnings can be eliminated without weakening the model.

**Status:** Pre-M15 security review **complete** (migrations through `261620`). Remaining Advisor items are documented intentional outcomes below.

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

## Architecture pattern

| Layer | Mechanism |
|-------|-----------|
| Table writes (domain) | No direct `INSERT`/`UPDATE`/`DELETE` grants to `authenticated` on domain tables |
| Permissions | **SECURITY DEFINER RPCs** enforce business rules (`auth.uid()` checks, leadership columns) |
| Table reads | **SECURITY INVOKER** RPCs + RLS on underlying tables |
| Notifications (own rows) | `notifications` grants `SELECT`/`UPDATE` to `authenticated` with RLS; read/mark RPCs are **INVOKER** |
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
| `ensure_experience_transformed` | DEFINER | Lazy transform (organizer-only) |
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

| Bucket | Policy helper | Why EXECUTE on one-arg helper |
|--------|---------------|-------------------------------|
| `memories` | `is_active_memory_participant(uuid)` | PostgreSQL requires EXECUTE on functions referenced in policy expressions for the calling role. |

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
