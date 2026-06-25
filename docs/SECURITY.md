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
| Permissions | **SECURITY DEFINER RPCs** enforce business rules (`auth.uid()` checks, role checks) |
| Table reads (most) | **SECURITY INVOKER** RPCs or RLS-protected direct `SELECT` |
| Memory reads | **SECURITY DEFINER** RPCs (see below — intentional) |
| Internal helpers | **SECURITY DEFINER**, `REVOKE ALL FROM PUBLIC`, **no** `GRANT EXECUTE TO authenticated` unless required for Storage RLS |
| Triggers / crons | **SECURITY DEFINER**, not callable by clients |

All project-owned DEFINER functions use `SET search_path = public`.

---

## Helper functions

| Function | Callable by `authenticated`? | Why |
|----------|------------------------------|-----|
| `is_active_memory_participant(uuid, uuid)` | **Yes** | Required for `storage.objects` RLS on the `memories` bucket — policy expressions invoke this function during upload/list/delete checks. Returns only whether **the current user** is an active participant. |
| `memory_has_active_participants(uuid)` | **No** | Internal only (orphan purge, leave flow, crons). Revoked in `251400`. |
| `experience_min_starts_at()` | **No** | Internal only — called from `create_experience` / `update_experience` write RPCs. Revoked in `251400`. |
| `resolve_discoverable_profile_id(text)` | **No** | Internal only — friend write RPCs. Never granted to `authenticated`. |
| `elect_memory_leader`, `purge_memory_if_orphaned`, `transfer_memory_leadership` | **No** | Internal only. |
| `purge_orphaned_*`, `maintain_orphaned_memories`, `transform_*` (batch) | **No** | Cron / internal only. |
| Trigger functions (`handle_*`, `trigger_storage_cleanup_*`) | **No** | Trigger-only. |

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
| `list_friends` | INVOKER | `friendships_select_own` RLS |
| `list_incoming_friend_requests` | INVOKER | Same RLS |
| `count_my_friends` | **INVOKER** | Same RLS; changed from DEFINER in `251400` |
| `send_friend_request` | DEFINER | Write — validates discoverability, pair ordering |
| `accept_friend_request` | DEFINER | Write |
| `decline_friend_request` | DEFINER | Write |
| `cancel_friend_request` | DEFINER | Write |
| `remove_friend` | DEFINER | Write |

### Experiences

| RPC | Security | Notes |
|-----|----------|-------|
| `list_my_home_experiences` | INVOKER | Organizer RLS |
| `get_experience` | INVOKER | Organizer RLS |
| `create_experience` | DEFINER | Write + date validation |
| `update_experience` | DEFINER | Write + date validation |
| `cancel_experience` | DEFINER | Write |
| `delete_experience` | DEFINER | Write |
| `ensure_experience_transformed` | DEFINER | Lazy transform from ended plan detail |

### Memories

| RPC | Security | Notes |
|-----|----------|-------|
| `transform_my_due_experiences` | DEFINER | Explicit write side-effect before list (not embedded in reads) |
| `list_my_memories` | **DEFINER** | See “Memory read RPCs” below |
| `get_memory` | **DEFINER** | Same |
| `list_memory_participants` | **DEFINER** | Same — exposes fellow participants when caller is member |
| `list_memory_media` | **DEFINER** | Same |
| `count_my_memories` | **Not granted** | Reserved for future Profile count UI; revoke until wired (`251400`) |
| `update_memory_info` | DEFINER | Write — not in app yet; grant kept for upcoming edit UI |
| `update_my_memory_note` | DEFINER | Write |
| `leave_memory` | DEFINER | Write |
| `register_memory_photo` | DEFINER | Write + path validation |
| `delete_memory_photo` | DEFINER | Write + uploader/leader permission |

---

## Memory read RPCs — why SECURITY DEFINER?

After the M13 RLS fix, `memories` / `memory_participants` / `memory_media` SELECT policies use `is_active_memory_participant()` (DEFINER helper), so **INVOKER reads would likely work** — similar to experiences.

We **keep DEFINER** for memory reads because:

1. **Explicit permission boundary** — RPC body filters by `auth.uid()` and membership; not relying on RLS alone for cross-table reads (especially `list_memory_participants` exposing other users’ rows).
2. **Locked architecture** — read RPCs must stay pure `SELECT` (no transform/purge inside reads); DEFINER + explicit SQL is the approved pattern in `PROJECT.md`.
3. **Stability** — avoids reintroducing 42P17-style recursion if policies change before M14 shared-memory work.

These will continue to appear in Security Advisor as intentional DEFINER + authenticated EXECUTE.

---

## Storage RLS

| Bucket | Policy helper | Why EXECUTE on helper |
|--------|---------------|------------------------|
| `memories` | `is_active_memory_participant` | PostgreSQL requires EXECUTE on functions referenced in policy expressions for the calling role. |

Client must **not** call `storage.remove` for lifecycle deletes — DB triggers + Edge Functions handle cleanup.

---

## Migrations

| Version | Purpose |
|---------|---------|
| `251400` | `rpc_execute_audit.sql` — revoke helper grants, `count_my_friends` → INVOKER, `count_my_memories` unexported |

---

## Advisor checklist (post M13.5 audit)

| Warning type | Action |
|--------------|--------|
| DEFINER + authenticated on **write RPCs** | **Intentional** — document above |
| DEFINER + authenticated on **memory read RPCs** | **Intentional** — document above |
| DEFINER + authenticated on **helpers** | **Fixed** where not required (`251400`) |
| DEFINER + authenticated on `is_active_memory_participant` | **Intentional** — Storage RLS requirement |
| Leaked password protection | **N/A** — OTP-only auth |
| `rls_auto_enable` / Supabase internals | **Out of scope** — platform-managed |

Goal: correct model, not zero warnings at any cost.
