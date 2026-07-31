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

## Storage lifecycle

| Event | DB | Storage cleanup |
|-------|-----|-----------------|
| Last participant leaves (solo memory) | `DELETE memories` | Folder via `cleanup-memory-storage` |
| Photo delete RPC | `DELETE memory_media` | Single file via `cleanup-memory-storage` |
| Account delete (no active participants) | Orphan purge → `DELETE memories` | Folder |
| Daily cron | `maintain_orphaned_memories()` | As above for purged rows |

Client must **not** call `storage.remove` for lifecycle deletes.

**Reconciliation:** both cleanup Edge Functions run async via `pg_net` after the DB row is already gone. If the Storage API call itself fails, the function records it in `public.storage_cleanup_failures` (service-role only, no client access); `retry-storage-cleanup-failures` re-fires the stored payload every 15 minutes with backoff, up to 5 attempts total, before giving up (`failed_permanently`). No alerting yet — query the table directly until this is wired into observability tooling.
