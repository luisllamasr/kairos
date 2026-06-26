# Kairos — Security model

Supabase Security Advisor warnings are expected for intentional **SECURITY DEFINER** RPCs. This document records what is deliberate, what was tightened, and what is not applicable.

---

## Authentication

Kairos uses **passwordless auth only** (Email OTP / magic link via Supabase Auth). There are no user passwords in the product.

| Advisor warning | Status |
|-----------------|--------|
| Leaked password protection disabled | **Not applicable** today — no password sign-up or sign-in flow exists. |

**Future:** If email+password auth is added, enable [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) in the Supabase dashboard **before** releasing that flow.

---

## Architecture pattern

| Layer | Mechanism |
|-------|-----------|
| Table writes | No direct `INSERT`/`UPDATE`/`DELETE` grants to `authenticated` on domain tables |
| Permissions | **SECURITY DEFINER RPCs** enforce business rules (`auth.uid()` checks, leadership columns) |
| Table reads (most) | **SECURITY INVOKER** RPCs or RLS-protected direct `SELECT` |
| Memory reads | **SECURITY DEFINER** RPCs (see below — intentional) |
| Internal helpers | **SECURITY DEFINER**, `REVOKE ALL FROM PUBLIC`, **no** `GRANT EXECUTE TO authenticated` unless required for Storage RLS |
| Triggers / crons | **SECURITY DEFINER**, not callable by clients |

All project-owned DEFINER functions use `SET search_path = public`.

**Leadership SSOT (M14 cleanup):** Permission checks use `experiences.organizer_id` and `memories.leader_id` only. Participant rows are membership-only; list RPCs return derived `is_organizer` / `is_leader`. The former `memory_participants.role` / `experience_participants.role` columns were removed in migration `261607`.

---

## Helper functions

| Function | Callable by `authenticated`? | Why |
|----------|------------------------------|-----|
| `is_active_memory_participant(uuid, uuid)` | **Yes** | Required for `storage.objects` RLS on the `memories` bucket — policy expressions invoke this function during upload/list/delete checks. Returns only whether **the current user** is an active participant. |
| `is_experience_participant(uuid, uuid)` | **No** | Internal + RLS helper for experience SELECT policies. Not granted to clients directly. |
| `is_pending_experience_invitee(uuid)` | **No** | Internal + RLS helper for pending-invitee read access. |
| `memory_has_active_participants(uuid)` | **No** | Internal only (orphan purge, leave flow, crons). Revoked in `251400`. |
| `experience_min_starts_at()` | **No** | Internal only — called from `create_experience` / `update_experience` write RPCs. Revoked in `251400`. |
| `resolve_discoverable_profile_id(text)` | **No** | Internal only — friend write RPCs. Never granted to `authenticated`. |
| `elect_memory_leader`, `purge_memory_if_orphaned` | **No** | Internal only. |
| `transfer_memory_leadership` | **Yes** | Leader-only write RPC (⋮ menu on memory detail). |
| `purge_orphaned_*`, `maintain_orphaned_memories`, `transform_due_experiences`, `purge_stale_experiences` | **No** | Cron / internal only. |
| `transform_experience_to_memory`, `transform_my_due_experiences`, `purge_my_stale_experiences` | **`transform_my_due_experiences` + `purge_my_stale_experiences` yes**; transform single-row internal | Explicit client write RPCs before list/detail; batch transform cron internal. |
| Trigger functions (`handle_*`, `trigger_storage_cleanup_*`) | **No** | Trigger-only. |
| Notification enqueue helpers (`enqueue_notification`, `notify_experience_participants`, …) | **No** | Called from write RPCs only. |

---

## Intentional client RPCs (`GRANT EXECUTE TO authenticated`)

### Profile / discovery (INVOKER reads)

| RPC | Security | Notes |
|-----|----------|-------|
| `search_profiles` | INVOKER | RLS on `profiles` |
| `get_public_profile` | INVOKER | RLS + discoverability rules |

### Friendships

| RPC | Security | Notes |
|-----|----------|-------|
| `list_friends` | INVOKER | `friendships_select_own` RLS; returns `user_id` (`261500`) |
| `list_incoming_friend_requests` | INVOKER | Same RLS |
| `count_my_friends` | **INVOKER** | Same RLS; changed from DEFINER in `251400` |
| `send_friend_request` | DEFINER | Write — validates discoverability, pair ordering |
| `accept_friend_request` | DEFINER | Write |
| `decline_friend_request` | DEFINER | Write |
| `cancel_friend_request` | DEFINER | Write |
| `remove_friend` | DEFINER | Write |

### Experiences (M12 + M14)

| RPC | Security | Notes |
|-----|----------|-------|
| `list_my_home_experiences` | INVOKER | Participant join + RLS (`experiences_select_participant` + legacy `experiences_select_organizer`) |
| `get_experience` | INVOKER | Returns `am_organizer`, `am_participant`, `pending_invitation_id`, `can_revive`, `notifications_muted` |
| `list_experience_participants` | DEFINER | Returns `is_organizer` derived from `organizer_id` |
| `list_experience_invitations` | DEFINER | Leader + fellow participants |
| `list_incoming_experience_invitations` | INVOKER | Invitee-scoped |
| `list_experience_invite_suggestions` | DEFINER | Leader review queue |
| `create_experience` | DEFINER | Write + optional invite batch |
| `update_experience` | DEFINER | Write + date validation + edit policy |
| `cancel_experience` | DEFINER | Leader-only while `planned` |
| `delete_experience` | DEFINER | Leader-only while `planned` |
| `revive_experience` | DEFINER | Participant revive; reviver becomes `organizer_id` |
| `leave_experience` | DEFINER | Hard-delete participant row; leader must transfer when required |
| `remove_experience_participant` | DEFINER | Leader-only while `planned` |
| `transfer_experience_leadership` | DEFINER | Updates `organizer_id` only |
| `send_experience_invitation` | DEFINER | Leader-only |
| `accept_experience_invitation` | DEFINER | Invitee-only |
| `decline_experience_invitation` | DEFINER | Invitee-only |
| `suggest_experience_invite` | DEFINER | Participant suggest flow |
| `review_experience_invite_suggestion` | DEFINER | Leader approve/reject |
| `set_experience_notifications_muted` | DEFINER | Per-participant mute flag |
| `ensure_experience_transformed` | DEFINER | Lazy transform from ended plan detail |
| `purge_my_stale_experiences` | DEFINER | Eager purge of cancelled plans past `purge_at` before Home list |

### Notifications (M14 foundation — inbox UI in M19)

| RPC | Security | Notes |
|-----|----------|-------|
| `list_notifications` | DEFINER | Paginated inbox read; not wired in app UI yet |
| `count_unread_notifications` | DEFINER | Badge count; not wired in app UI yet |
| `mark_notification_read` | DEFINER | Single-row read marker |
| `set_memory_notifications_muted` | DEFINER | Per-participant mute on memories |

### Memories

| RPC | Security | Notes |
|-----|----------|-------|
| `transform_my_due_experiences` | DEFINER | Explicit write side-effect before list (not embedded in reads) |
| `list_my_memories` | **DEFINER** | See “Memory read RPCs” below |
| `get_memory` | **DEFINER** | Same |
| `list_memory_participants` | **DEFINER** | Same — returns `is_leader` derived from `leader_id` |
| `list_memory_media` | **DEFINER** | Same |
| `count_my_memories` | **Not granted** | Reserved for future Profile count UI; revoke until wired (`251400`) |
| `update_memory_info` | DEFINER | Write — not in app yet; grant kept for upcoming edit UI |
| `update_my_memory_note` | DEFINER | Write |
| `leave_memory` | DEFINER | Write |
| `transfer_memory_leadership` | DEFINER | Write — current leader only |
| `register_memory_photo` | DEFINER | Write + path validation |
| `delete_memory_photo` | DEFINER | Write + uploader/leader permission |

---

## Memory read RPCs — why SECURITY DEFINER?

After the M13 RLS fix, `memories` / `memory_participants` / `memory_media` SELECT policies use `is_active_memory_participant()` (DEFINER helper), so **INVOKER reads would likely work** — similar to experiences.

We **keep DEFINER** for memory reads because:

1. **Explicit permission boundary** — RPC body filters by `auth.uid()` and membership; not relying on RLS alone for cross-table reads (especially `list_memory_participants` exposing other users’ rows).
2. **Locked architecture** — read RPCs must stay pure `SELECT` (no transform/purge inside reads); DEFINER + explicit SQL is the approved pattern in `PROJECT.md`.
3. **Stability** — avoids reintroducing 42P17-style recursion if policies change.

These will continue to appear in Security Advisor as intentional DEFINER + authenticated EXECUTE.

---

## Experience RLS — overlapping SELECT policies

M12 created `experiences_select_organizer` (`organizer_id = auth.uid()`). M14 added `experiences_select_participant` and `experiences_select_pending_invitee`. PostgreSQL OR-combines permissive policies, so overlap is **harmless**.

**Advisor / cleanup note:** `experiences_select_organizer` is **redundant** now that every organizer is also a participant row, but we **keep it until measured** (no behaviour change mid-milestone). Do not drop without `EXPLAIN` on Home list queries.

---

## Storage RLS

| Bucket | Policy helper | Why EXECUTE on helper |
|--------|---------------|------------------------|
| `memories` | `is_active_memory_participant` | PostgreSQL requires EXECUTE on functions referenced in policy expressions for the calling role. |

Client must **not** call `storage.remove` for lifecycle deletes — DB triggers + Edge Functions handle cleanup.

---

## Migrations (security-relevant)

| Version | Purpose |
|---------|---------|
| `251400` | `rpc_execute_audit.sql` — revoke helper grants, `count_my_friends` → INVOKER, `count_my_memories` unexported |
| `261601` | Revoke accidental client grant on internal `transform_experience_to_memory` |
| `261602` | `get_experience` viewer flags; pending-invitee participant list RLS |
| `261604` | Cancelled experience permission alignment (no leader actions while cancelled) |
| `261606` | Grant `transfer_memory_leadership` to clients with leader check |
| `261607` | Drop participant `role` columns; leadership SSOT on authority columns |
| `261608` | Fix `purge_my_stale_experiences` (`DISTINCT` + `FOR UPDATE` runtime error) |

---

## Advisor checklist (post M14 cleanup)

| Warning type | Action |
|--------------|--------|
| DEFINER + authenticated on **write RPCs** | **Intentional** — document above |
| DEFINER + authenticated on **memory read RPCs** | **Intentional** — document above |
| DEFINER + authenticated on **notification read RPCs** | **Intentional** — foundation for M19 inbox |
| DEFINER + authenticated on **helpers** | **Fixed** where not required (`251400`) |
| DEFINER + authenticated on `is_active_memory_participant` | **Intentional** — Storage RLS requirement |
| `function_search_path_mutable` on project functions | **Fixed** — all use `SET search_path = public` |
| Leaked password protection | **N/A** — OTP-only auth |
| `rls_auto_enable` / Supabase internals | **Out of scope** — platform-managed |
| `db lint`: `FOR UPDATE` with `DISTINCT` | **Fixed** in `261605` (`transform_my_due_experiences`) and `261608` (`purge_my_stale_experiences`) |
| Redundant `experiences_select_organizer` RLS | **Intentional keep** — measure before drop |

Goal: correct model, not zero warnings at any cost.

Run `npx supabase db lint --linked` after each migration push to catch SQL errors Supabase Advisor may not surface in the dashboard.
