# Private-plan regression (M16 Phase 1)

Verifies existing private-plan behavior plus the Phase 1 `update_experience` changes (preserve visibility; `experience_updated` only on real field diffs) against the linked Kairos **dev** project.

Not part of `npm run ci`. ESLint ignores `scripts/**`.

```bash
node scripts/experience-regression/run.mjs
```

The script detects whether migration `20260826110000` is recorded:

- **baseline** (migration absent): private-plan checks must pass; field changes must **not** emit `experience_updated`; an SQL-forced `public` visibility is reset to `private` by `update_experience`.
- **post** (migration present): same private-plan checks; a no-op save emits nothing; each supported field change emits exactly one `experience_updated` to unmuted non-editor participants; SQL-forced `public` visibility is preserved. There is still no visibility-changing RPC.

Uses the same throwaway-user pattern as `scripts/experience-lifecycle/`. Teardown always runs. Existing application rows are not modified except the SQL visibility probe on the throwaway plan (reverted by teardown).
