# Production-readiness hardening audit — closing report

**Status:** Complete  
**Dates:** post-M15 hardening pass through 2026-08-02  
**Restore / start commit:** `e342328` — `chore: post-M15 production hardening pass …`  
**Closing commits:** `4032d04` (detail + invite lifecycle), `768151c` (CI + ESLint)  
**Source roadmap:** Claude’s classification & roadmap (process, auth vault, GDPR/deletion, DB security, frontend architecture, secrets)  
**Philosophy kept throughout:** architecture before cleverness; objective improvements over taste; preserve behaviour unless there is a clear product benefit; small verifiable slices with on-device validation.

This document is the closing record of the hardening phase. Use it later to see what was done, what was deferred on purpose, and why.

---

## 1. Why this phase existed

After M15 (experience chat), Kairos had a working product surface but several production risks: plaintext session storage, SQL security gaps, lifecycle edge cases, oversized screens that were hard to change safely, and no automated gate against regressions. The audit classified findings and sequenced fixes **before** the next major product feature (Settings & Privacy / layered profile visibility).

---

## 2. Major architectural & security improvements

### Auth & multi-account vault
- Session tokens moved from plaintext AsyncStorage to an **AES-256 encrypted vault**, with the key in **`expo-secure-store`** (Keychain/Keystore).
- Sign-out intent isolated via `withAuthRemoveMode` (adapter limitation acknowledged; process-global `removeMode` accepted as residual).
- **Reauth / resume** UX for dormant remembered accounts; **forget account on device** as a separate action from sign-out.
- Add-account interrupt recovery hardened on the sign-in path.

### Database & backend security
- Notifications: direct client `UPDATE` revoked; writes via RPC only.
- Memory storage uploads enforce **`add_media_policy`** (leader-only vs all-participants).
- Client-triggered transform/purge aligned with cron: **deterministic lock order + `SKIP LOCKED`**.
- `experiences.created_by` made **nullable** so account deletion no longer crashes on `ON DELETE SET NULL` (intentional alternative to a sentinel profile row; UI already treats null authorship like chat).

### Storage lifecycle
- **`storage_cleanup_failures`** ledger + retry cron with backoff for avatar/memory cleanup Edge Functions (no longer pure fire-and-forget).

### Client architecture
- **`useExperienceChat`** + `MessageBubble` / `ChatComposer` — chat screen decomposed.
- **`useExperienceDetail`** + presentational sections/footer/picker — experience detail decomposed.
- **Stale-response guards** on focus refresh, search, chat load, and experience detail load.
- **Auth / I18n context** values memoized.
- **`get_experience_message_reactions`** — reaction updates no longer re-fetch up to 100 messages.
- **`useGuardedPush`** — app-wide guard against stacked duplicate navigations from rapid taps.
- Hermes-safe **`tn()`** pluralization for user-facing counts.

### Process
- Minimal GitHub Actions **CI**: `tsc --noEmit` + ESLint **correctness-only** rules on `main` push/PR.
- Docs corrected/expanded: `SECURITY.md` (e.g. `ensure_experience_transformed`), `PROJECT.md` (“why three” transform mechanisms, leave/invite rules).

---

## 3. Biggest product & lifecycle improvements

These were not all in the original classification as “features,” but they closed real consistency gaps discovered while hardening the experience detail / social flows:

| Area | Outcome |
|------|---------|
| **Leave model** | No product “Remove plan”; leave-centric exit; last participant leave orphans/deletes; leader leave chooses successor in one flow |
| **Suggest ↔ invite** | Cannot suggest someone with a pending invite; creating an invite clears pending suggestions for that person; leadership transfer auto-resolves the new leader’s old suggestions |
| **Author exit** | Pending suggestions cleared when the author leaves or is removed (invitations unchanged) |
| **Batch invite/suggest** | Multi-select with best-effort partial success and polished singular/plural copy |
| **Withdrawal** | Leader can withdraw pending invitations; author can withdraw pending suggestions (same invalidation family as cancel / invites closed; withdraw ≠ decline for the 3-strike rule) |
| **Error clarity** | Specific copy for lifecycle errors (e.g. invite blocked after 3 declines), not only generic failures |
| **Visibility** | Pending invites/suggestions visible to participants; review actions remain leader-only |

---

## 4. Main refactors completed

1. **Chat decomposition** — data/realtime in `use-experience-chat.ts`; UI in chat components; screen as orchestrator.  
2. **Experience detail decomposition** — `use-experience-detail.ts` + `ExperienceParticipantsSection`, `ExperienceChatEntryCard`, pending invite/suggestion sections, `ExperienceInviteFriendPicker`, `ExperienceActionsFooter`.  
3. **Shared mutation pattern** — `runAction` / batch social helpers with re-entrancy guard and shared loading/error slot (deliberately kept shared to preserve pre-existing behaviour).  
4. **Navigation hardening** — `useGuardedPush` wired across primary `router.push` call sites.  
5. **Invite/suggest API surface** — batch RPCs + withdraw RPCs; client lib/hook/UI aligned.  
6. **CI gate** — `eslint.config.mjs` (unused vars, floating/misused promises, hooks rules) + `.github/workflows/ci.yml`.

---

## 5. Roadmap cross-off (Claude items)

### Done in this phase (or consciously resolved)
Secure vault (#8); created_by / deletion crash (#15 via nullable, not sentinel); storage reconciliation (#16); notification UPDATE gap (#17); memory storage policy (#18); transform/purge lock ordering (#20); reauth + forget-account (#10/#11/#13 as shipped); chat/detail decomposition (#24); stale guards (#26); context memo (#27); reaction refetch (#30); SECURITY.md / “why three” docs (#19/#21); Expo aligned to SDK 54 for Expo Go (#7 as practical outcome); raw user-facing errors largely i18n-mapped (#31 partial); minimal CI + ESLint correctness (#1 partial / #3).

### Accepted residual (not open bugs)
- **`removeMode` process-global** (#12) — constrained by Supabase storage adapter; mitigated with `withAuthRemoveMode` + `finally`.  
- **Deleted-User sentinel row** — not adopted; null authorship + existing “Deleted User” labels is the documented design.

### No action / product-parked (unchanged intent)
Global sign-out scope (#9); client `canX` helpers (#28); feature flags (#6); realtime redesign (#22); deep-link invite hardening (#32); full profile privacy model (#23) — parked until **Settings & Privacy**.

---

## 6. Intentionally postponed (release-preparation / later)

Do **not** treat these as unfinished audit debt of the same kind as the closed security/architecture items. They belong to launch ops or a later polish pass:

| Item | Why deferred |
|------|----------------|
| **Accessibility baseline** (+ EU Accessibility Act check) | Large UI still to build; revisit in release prep so work isn’t redone |
| **Dev vs prod Supabase split** (#2) | Ops/account work; required before real users, not blocking feature development |
| **Crash reporting / analytics** (#4, e.g. Sentry/PostHog) | Launch observability; integrate before strangers use the app |
| **EAS / store release pipeline** (#5) | Required before store submission |
| **DB password rotation** (#33) | Operational; still standing risk — do before public exposure, independently of feature work |
| **Comprehensive test suite** (#1 full) | Correctly sequenced after a stable base; CI typecheck/lint is the interim gate |
| **React Query / shared cache** (#25) | Less urgent after stale guards + hooks; revisit when adding many new screens |
| **Cross-screen list/mutation boilerplate** (#29) | Maintainability only; partial relief already from detail/chat hooks |
| **Background refresh of dormant vault sessions** | Reauth UX is the current product answer; seamless silent refresh optional later |

---

## 7. Recommendations before building new features again

1. **Resume product work** on the documented next major feature: **Settings & Privacy** (layered profile visibility) — or the next milestone you explicitly choose — without reopening closed hardening items mid-feature.  
2. **Keep the CI habit:** run `npm run ci` locally; don’t weaken the correctness ESLint set for convenience.  
3. **Touch invite/leave/transform logic carefully** — lifecycle rules are now load-bearing and documented in `PROJECT.md`; prefer migrations + docs updates when changing them.  
4. **Schedule release-prep as its own phase** before public launch: password rotation, env split, Sentry, EAS, accessibility.  
5. **Optional parked UX** (not blockers): reaction-picker hit targets / floating picker polish; memories leave still uses an older “transfer before leave” dialog vs experience leave-successor — align when touching memories.  
6. **Second from-scratch audit** only after a meaningful feature chunk or before launch — not immediately; the base is now coherent enough to build on.

---

## 8. How to verify this phase later

```bash
npm run ci
npx supabase db push   # if a fresh environment needs all hardening migrations
```

Key migration versions (see `supabase/MIGRATIONS.md`):  
`20260729100000`–`20260729120000` (lock ordering, security gaps, created_by, storage reconciliation, reaction RPC),  
`20260731100000` / `20260801100000` / `20260801110000` (invite/suggest lifecycle).

On-device: the phase was validated slice-by-slice (chat, detail decomposition, leave/successor, invite/suggest lifecycle, guarded navigation, batch/withdraw, CI locally).

---

## 9. Closing note

This audit started from Claude’s classification, continued through security/vault work and screen decomposition, and finished with a complete invitation/suggestion lifecycle and a minimal CI gate. The goal was not to invent a parallel roadmap, but to close production-readiness gaps so Kairos can return to **Create → Live → Remember** product work on a safer base.

**Hardening audit: complete.** Next: build features again; keep release-prep items on a separate checklist before public launch.
