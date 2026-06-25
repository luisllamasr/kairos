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

Security model: `docs/SECURITY.md`.

## Storage lifecycle

| Event | DB | Storage cleanup |
|-------|-----|-----------------|
| Last participant leaves (solo memory) | `DELETE memories` | Folder via `cleanup-memory-storage` |
| Photo delete RPC | `DELETE memory_media` | Single file via `cleanup-memory-storage` |
| Account delete (no active participants) | Orphan purge → `DELETE memories` | Folder |
| Daily cron | `maintain_orphaned_memories()` | As above for purged rows |

Client must **not** call `storage.remove` for lifecycle deletes.
