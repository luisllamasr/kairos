# Experience lifecycle regression

Verifies migration `20260826100000` (transform at `ends_at`; freeze edit / cancel / leader-remove after `starts_at`) against the linked Kairos **dev** project.

Not part of `npm run ci`. ESLint ignores `scripts/**`.

```bash
node scripts/experience-lifecycle/run.mjs
```

Uses the same throwaway-user pattern as `scripts/realtime-auth-spike/`: SQL via `npx supabase db query --linked`, sign-in with the public anon key, teardown even on failure. Existing application rows are not modified except the planned-row backfill already applied by the migration.
