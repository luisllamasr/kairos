# Supabase migrations

See `supabase/migrations/` for SQL migrations.

## Fresh setup

```bash
npx supabase db push          # or db reset --linked on empty remote
npx supabase functions deploy cleanup-user-storage
npx supabase functions deploy cleanup-memory-storage
```

## M13 memory chain (squashed — 4 migrations)

| Version | File | Purpose |
|---------|------|---------|
| `251000` | `memories_foundation.sql` | Tables, RLS, helpers, transform, read/write RPCs, experience guards, transform cron |
| `251100` | `memories_storage.sql` | Private `memories` bucket + storage RLS |
| `251200` | `memories_lifecycle.sql` | CASCADE audit, orphan purge, account-delete handler, daily maintenance cron |
| `251300` | `memories_storage_cleanup.sql` | `DELETE memories` → folder cleanup; `DELETE memory_media` → file cleanup (pg_net → Edge Function) |
| `251400` | `rpc_execute_audit.sql` | Tighten EXECUTE grants; friendship count → INVOKER |

Pre-M13 chain is unchanged (`170000` profiles → `241100` experiences).

## M14 shared experiences chain

| Version | File | Purpose |
|---------|------|---------|
| `261000` | `shared_experiences_schema.sql` | Participants, invitations, suggestions, declines, edit policy, RLS, account-delete handler |
| `261100` | `shared_experiences_core_rpcs.sql` | Invites, leave/remove/transfer, list RPCs, create with optional invitees |
| `261200` | `shared_experiences_lifecycle.sql` | Edit policy, cancel/delete/revive, multi-participant transform |
| `261300` | `shared_experiences_suggestions.sql` | Suggest-invite + leader review RPCs |
| `261400` | `notifications_foundation.sql` | Notifications table, enqueue, mute, list/mark-read; wired into lifecycle RPCs |
| `261500` | `m14_client_read_helpers.sql` | `list_friends` returns `user_id`; `get_experience` returns `notifications_muted` |
| `261600` | `invitation_read_and_lifecycle.sql` | Pending-invitee RLS, DELETE-on-resolve social rows, notification purge helpers |
| `261601` | `transform_rpc_grant_fix.sql` | Revoke accidental client grant on internal transform RPC |
| `261602` | `experience_viewer_role.sql` | Viewer role flags on `get_experience`; pending invitee participant list access |
| `261603` | `experience_purge_eager.sql` | `purge_my_stale_experiences()` + bundle `purge_stale_experiences()` into 15 min cron |
| `261604` | `cancelled_experience_permissions.sql` | No leader permissions while cancelled; leave without transfer; delete planned only |
| `261605` | `transform_visibility.sql` | Fix `transform_my_due_experiences`; Home lists planned until transform DELETE |
| `261606` | `memory_transfer_leadership_client.sql` | Grant `transfer_memory_leadership` to clients with leader check |
| `261607` | `drop_participant_role.sql` | Drop participant `role` columns + enum; leadership SSOT is `organizer_id` / `leader_id` |
| `261608` | `purge_my_stale_experiences_fix.sql` | Fix `purge_my_stale_experiences` (`DISTINCT` + `FOR UPDATE` runtime error) |
| `261609` | `notification_retention.sql` | Inbox cap (50/user), 30-day read TTL, trim on enqueue; daily cron via `maintain_orphaned_memories` |
| `261610` | `membership_helper_hardening.sql` | Split helper overloads; revoke two-arg from clients (close probe) |
| `261620` | `read_rpc_invoker_alignment.sql` | Memory read RPCs + `mark_notification_read` → SECURITY INVOKER (pre-M15 security review) |

## M15 experience chat chain

| Version | File | Purpose |
|---------|------|---------|
| `271000` | `experience_chat_schema.sql` | `chat_policy`, messages + reactions tables, RLS, Realtime publication, `experience_user_can` helper |
| `271100` | `experience_chat_rpcs.sql` | Chat read/write RPCs, `get_experience` chat flags; edit RPCs refactored to `experience_user_can` |
| `271101` | `send_experience_message_lint_fix.sql` | Remove unused `v_exp_id` in `send_experience_message` (db lint) |

Security model: `docs/SECURITY.md`.

## Post-M15 security & reliability hardening (pre-launch production-readiness audit)

Not tied to a product milestone — findings from a full architecture/security audit, confirmed against actual project intent before implementing. Full timestamps used (not the milestone shorthand above) since this isn't a milestone chain.

| Version | File | Purpose |
|---------|------|---------|
| `20260729100000` | `lifecycle_lock_ordering_hardening.sql` | Deterministic lock order + `SKIP LOCKED` for `transform_my_due_experiences` / `purge_my_stale_experiences` — matches the existing cron pattern; closes a deadlock risk when concurrent participants of shared experiences trigger both eagerly |
| `20260729100100` | `close_security_gaps.sql` | Revoke direct client `UPDATE` on `notifications` (all writes now RPC-only, matching the rest of the domain model); enforce `add_media_policy` in memory storage upload RLS (previously only `register_memory_photo` enforced it, so direct storage uploads could bypass a `leader_only` policy) |
| `20260729100200` | `experiences_created_by_nullable.sql` | Drop `NOT NULL` on `experiences.created_by` — its `ON DELETE SET NULL` FK (added in `261000`) crashed account deletion for any user who created a shared experience that outlives them; mirrors the nullable treatment `organizer_id` already got in that same migration |
| `20260729110000` | `storage_cleanup_reconciliation.sql` | `storage_cleanup_failures` ledger + `retry-storage-cleanup-failures` cron (15 min). `cleanup-user-storage` / `cleanup-memory-storage` were fire-and-forget with no retry on failure; both Edge Functions now record failures with backoff (+15m/+1h/+6h/+24h, then `failed_permanently`) and resolve them on a later success. Cron only re-fires stored payloads — it never writes to the ledger, so there's exactly one writer of ledger state |
| `20260729120000` | `experience_chat_reaction_refresh_rpc.sql` | `get_experience_message_reactions(p_message_id)` — a reaction add/remove (or realtime reaction event) previously called `list_experience_messages(..., 100)` and discarded everything except one message's `reactions` array; this RPC reads exactly the one row needed. Same SECURITY INVOKER / RLS-gated pattern as `list_experience_messages` |
| `20260731100000` | `experience_suggest_invite_lifecycle.sql` | Block suggesting a friend who already has a pending invitation; clear pending suggestions when an invitation is created; on leadership transfer, auto-resolve suggestions authored by the new leader (convert to invite when possible, otherwise drop) |
| `20260801100000` | `clear_suggestions_on_participant_exit.sql` | On leave / leader-remove, delete pending suggestions authored by the exiting participant; one-shot cleanup of orphaned pending suggestions whose author is no longer a participant. Pending invitations untouched |
| `20260801110000` | `invite_suggest_batch_and_withdraw.sql` | Batch invite/suggest RPCs (best-effort per friend); leader `withdraw_experience_invitation`; author `withdraw_experience_invite_suggestion` |
| `20260802100000` | `privacy_v1_schema_and_rpcs.sql` | Privacy v1 schema + RPCs (design locked in `docs/PROJECT.md` §6): `profiles.memories_visibility` enum column, `memory_participants.profile_visible` opt-out column; canonical predicates `are_friends` / `can_view_owner_memories_on_profile` / `can_view_memory_publicly` (single source of truth, reused by every new RPC and by the `memories` storage SELECT policy); `get_public_profile` grows `friend_count` / `memory_count` / `mutual_friend_count`; new public read RPCs `list_profile_memories`, `get_public_memory`, `list_public_memory_media` (never return participant rows or `uploaded_by_user_id`); new write RPC `set_memory_profile_visibility`. Existing participant-only RLS/RPCs untouched. **Client/UI not yet wired — schema and RPC slice only.** |
| `20260802110000` | `enable_rls_experience_invite_declines.sql` | `experience_invite_declines` (created in `20260626100000`) never got RLS enabled, unlike its three sibling tables in that same migration — an oversight, not a design choice. Verified against the live DB before fixing: `anon`/`authenticated` have no `SELECT`/`INSERT`/`UPDATE`/`DELETE` grant on the table and no `EXECUTE` grant on either function that touches it directly (`is_experience_invite_blocked`, `record_experience_invite_decline`, both `SECURITY DEFINER`, both called only internally by other RPCs), so this was not exploitable. One-line fix: `ENABLE ROW LEVEL SECURITY`, no policies, no grant changes — makes "no direct client access" structural instead of incidental. Confirmed the full decline → block-at-3 lifecycle still works end-to-end afterward. |
| `20260803100000` | `list_profile_friends.sql` | Privacy v1 follow-up, additive only: `list_profile_friends(p_username)` — a given profile's friend list, gated to the owner themselves or confirmed friends of the owner (reuses `are_friends` from `20260802100000`), empty (not an error) for anyone else. `SECURITY DEFINER` because, unlike `list_friends()`, it reads the *owner's* friendships rather than the caller's own, which `friendships_select_own` RLS would otherwise block. Powers the public-profile friend list UI. |
| `20260803110000` | `fix_get_public_profile_security_context.sql` | **Correctness fix**, verified against real accounts on-device: `get_public_profile` was left `SECURITY INVOKER` when `20260802100000` extended it with `friend_count`/`memory_count`/`mutual_friend_count`. Under `INVOKER`, `friendships_select_own` and `memory_participants_select_fellow` RLS silently truncated each aggregate to only rows the *viewer* could see, not the profile owner's actual totals (friend_count degenerated to 0/1, mutual_friend_count was always 0, memory_count only counted memories shared with the viewer). Query logic was correct throughout — promoted to `SECURITY DEFINER` (matching every sibling Privacy v1 RPC) with no other change. `relationship_status` was unaffected (only ever reads the one caller↔owner friendship row, which RLS always permits). Verified as the `authenticated` role (not superuser) against a real friendship/memory graph. |
| `20260803120000` | `list_mutual_friends.sql` | Privacy v1 follow-up, additive only: `list_mutual_friends(p_username)` — the same intersection `mutual_friend_count` computes, projected as rows (`user_id`, `username`, `display_name`, `avatar_url`) instead of a count. Gated by `are_friends(owner, viewer)`; a non-friend (or the owner on their own profile) gets an empty result even if calling this RPC directly — the non-friend identity boundary is enforced server-side, not just hidden client-side. `SECURITY DEFINER`, same reasoning as `list_profile_friends`. |
| `20260803130000` | `get_public_profile_visible_memory_count.sql` | **Product revision** to `get_public_profile` (docs/PROJECT.md §6, "Public-profile memory count is viewer-scoped"): `memory_count` renamed to `visible_memory_count` and recomputed with the exact predicate `list_profile_memories` uses (`mp.left_at IS NULL AND mp.profile_visible = true`, gated by `can_view_owner_memories_on_profile(owner, viewer)`), instead of the owner's raw participation total. Guarantees the stat always equals the number of rendered memory rows and never leaks the existence of memories the viewer can't see. Rename (not just a formula fix) is deliberate — the old name reads as a true total, which this value now never is. `DROP FUNCTION` required (OUT column renamed); re-verified as `authenticated` (not superuser) against 8 self/friend/non-friend/only_me/friends/everyone combinations on real data, all matching `list_profile_memories`'s row count exactly. Owner (`postgres`), `SECURITY DEFINER`, `search_path=public`, and grants (`authenticated` EXECUTE only) re-confirmed unchanged from the prior fix. |

## Storage lifecycle

| Event | DB | Storage cleanup |
|-------|-----|-----------------|
| Last participant leaves (solo memory) | `DELETE memories` | Folder via `cleanup-memory-storage` |
| Photo delete RPC | `DELETE memory_media` | Single file via `cleanup-memory-storage` |
| Account delete (no active participants) | Orphan purge → `DELETE memories` | Folder |
| Daily cron | `maintain_orphaned_memories()` | As above for purged rows |

Client must **not** call `storage.remove` for lifecycle deletes.

**Reconciliation:** both cleanup Edge Functions run async via `pg_net` after the DB row is already gone. If the Storage API call itself fails, the function records it in `public.storage_cleanup_failures` (service-role only, no client access); `retry-storage-cleanup-failures` re-fires the stored payload every 15 minutes with backoff, up to 5 attempts total, before giving up (`failed_permanently`). No alerting yet — query the table directly until this is wired into observability tooling.
