# Kairos

## Product vision

Kairos is a mobile application focused on creating, discovering, and preserving experiences.

Kairos is not a simple planning app.

The goal is to help people transform moments with friends, partners, family, or themselves into meaningful memories.

The focus is not showing off.
The focus is living experiences, remembering them, and discovering new ones.

---

# Core principles

## 1. Experiences first

The main unit of Kairos is an experience.

An experience represents a **scheduled** real moment that someone intends to live — it has a start and an end (best estimate). Undated wishes belong to a future **Ideas** feature, not to experiences.

Examples:
- a date night
- a weekend adventure
- a plan with friends
- a solo activity
- a special trip

The app should always prioritize real-world experiences over digital interaction.

---

## 2. Inspiration and discovery (future)

Kairos will help people answer “What should we do?” through **Opportunities** (M18) — a curated catalog of things worth doing in a city or area — and future **Ideas** (undated wishes that become experiences once scheduled).

This is not the same as user-created **Experiences** (dated plans you intend to live). Opportunities inspire; experiences are real plans on your calendar.

Do not build AI adventure generators, recommendation feeds, or discovery UIs before the core **Create → Live → Remember** chain is solid.

## 3. Memories

After an experience is lived, it **automatically becomes** a memory. Users do not manually “complete” plans like a task manager.

A memory can contain:

- photos
- participants
- date
- location
- description
- personal notes

Memories work like a personal timeline of meaningful moments.

They are not designed around likes or popularity.

**Shared moments:** one memory represents what a group lived together; each person controls their personal layer (timeline visibility, notes, contributed photos). See **Create → Live → Remember** below.

---

## 4. Community

Kairos has a social layer — but it is not the product center.

Users can connect with friends, discover public experiences, and get inspiration from others.

The social graph exists to support real life: finding people, planning together, remembering shared moments.

Kairos does not try to replace Instagram or traditional social networks.

**Anti-drift rule:** Do not build feeds, recommendations, suggested users, DMs, or profile bloat unless they directly serve experiences and memories. When user discovery, public profiles, and friend relationships exist, treat the **social foundation as complete** and return focus to the core domain.

---

## 5. Public content vs user plans

**User-created experiences** (M12+) are dated plans with `starts_at` and `ends_at`. They are private by default; public discoverability comes later (M16).

**Opportunities** (M18) are Kairos-suggested or catalog content — separate from user plans. A user may create an experience *inspired by* an opportunity (`inspired_by_opportunity_id`), but opportunities are not experiences.

There is no separate “propose and validate before public” pipeline for user plans in the current roadmap. Quality over quantity applies to the Opportunities catalog, not to blocking every user plan.

---

# Technical stack

## Frontend

- React Native
- Expo
- TypeScript

## Backend

- Supabase

## Database

- PostgreSQL

## Version control

- Git
- GitHub

---

# Development philosophy

## General rules

- Build step by step.
- Do not create unnecessary complexity.
- Do not generate the whole application at once.
- Prefer simple solutions that can scale later.
- Clean code is more important than fast code.

---

## Code standards

- Use TypeScript.
- Use meaningful names.
- Keep files focused.
- Keep components small.
- Avoid duplicated logic.
- Separate business logic from UI.

---

# Architecture principles

The project should be organized thinking about future growth.

Priorities:

1. Maintainability
2. Scalability
3. Readability
4. Performance

Do not add dependencies without a clear reason.

Security model and Supabase Advisor rationale: **`docs/SECURITY.md`**.

---

# Current status

Phase:
Identity and social foundation complete. **M12 Experiences**, **M13 Memories**, and **M13.5 cleanup** complete (photo delete UI, server-side storage lifecycle, squashed M13 migrations). **M14** next (shared experiences).

Created by:
Luis Llamas Ramón

Completed milestones:

1. Configure project structure. ✓
2. Create the mobile application base. ✓
3. Connect Supabase. ✓
4. Implement authentication (Email OTP, session management, AuthProvider). ✓
5. User profile (onboarding, edit profile, avatar upload, tab navigation). ✓
6. Storage cleanup (pg_net trigger → Edge Function on account deletion). ✓
7. Self-service account deletion (delete-account Edge Function, confirmation UX). ✓
8. Multi-account switching (auth vault, switcher UI, add/cancel flows). ✓
9. Incomplete signup cleanup (3-day rule, scheduled Edge Function). ✓
10. Social user discovery (Search tab, global user search, public profiles, RLS/RPC). ✓
11. Friend relationships (mutual friendships, requests, Profile friends list). ✓
12. Experience plans (dated private plans, cancel/remove, Home UI, structured location). ✓
13. Memories (transform lifecycle, Profile feed/detail, photos, storage cleanup, leave memory). ✓

---

# Roadmap

Build order is intentional. Do not skip ahead into full social-network features or shared experiences before the foundations below exist.

## Phase A — Identity (complete)

Authentication, onboarding, profiles, avatars, account deletion, multi-account switching, incomplete signup cleanup.

## Phase B — Social foundation (complete)

Minimal graph-building before shared experiences. Purpose: **search → view profile → friend request → mutual friendship** — not a feed, not content discovery.

| Milestone | Scope | In | Out |
|-----------|--------|-----|-----|
| **10. Social user discovery** ✓ | Search tab, global `@username` search, public profile screen, RLS/RPC foundation | Prefix search, public profile (avatar, display name, username), incomplete profiles hidden from discovery | Feed, recommendations, suggested users, Discover content, participant picker, bio/stats, DMs |
| **11. Friend relationships** ✓ | Mutual friendships on public profile; friends list; incoming requests | Friend request / accept / decline / cancel; remove friend with confirm; 60-day pending expiry; simultaneous auto-accept | Asymmetric follows, home feed, follower counts, mutual-friends ranking, DMs |

**Navigation (milestone 10):** Third tab **Search** — global people discovery. Not buried in Profile (Profile = identity, friends, and account).

**Relationship model (milestone 11):**

- One `friendships` row per user pair (canonical UUID ordering).
- `pending` = unresolved request (temporary); `accepted` = mutual friends.
- Declining deletes the row — no `declined` status.
- Pending requests expire after **60 days** (scheduled job).
- Simultaneous requests auto-accept.
- Writes via SECURITY DEFINER RPCs; reads via INVOKER RPCs + RLS SELECT on own rows.

**Two search concepts — do not merge:**

- **Global user search** (Search tab): find anyone on Kairos; start a friend request.
- **Participant picker** (later, inside experience creation): choose from **friends** — not open search.

**Incomplete profiles:** Users who have not finished onboarding cannot enter the app. Their profiles are never discoverable by others (RLS + RPC). Only the owner reads their own incomplete row for routing.

When milestones 10 and 11 are done, **stop expanding the social layer** unless a core-domain feature requires it.

## Phase C — Core domain (in progress)

Build **Create → Live → Remember** in order. Full milestone breakdown and product rules live in **Create → Live → Remember** below.

| Milestone | Scope |
|-----------|--------|
| **12. Experiences** ✓ | Dated private plans; auto `transform_at`; cancel/remove; Home = planned + cancelled-until-purge |
| **13. Memories** | Shared memory core + personal layer; automatic transform; timeline |
| **14. Shared experiences** | Friend invites; `organizer_id` transfer; group transform |
| **15. Experience chat** | Purpose-bound coordination; not DMs |
| **16. Public experiences** | Discoverable plans; open join |
| **17. Join approval** | Request → approve/decline |
| **18. Opportunities** | Catalog → “Plan this” → experience |
| **19. Notifications** | Invites, cancels, joins — not growth loops |

## Phase D — Community inspiration (later)

Public discovery at scale, validated catalog content, optional inspiration feeds. Friendships and visibility enums plug in here — not before core domain exists.

```text
Identity ✓ → Friends ✓ → Experiences ✓ → Memories → Shared experiences → Chat → Public → Opportunities
```

---

# Create → Live → Remember

Core domain architecture for Kairos. **Do not implement outside this model** without updating this section first.

## Philosophy

Kairos is not an event app, not a task manager, and not a social feed.

```text
Create  — plan a real moment (Experience)
Live    — the moment happens (live window)
Remember — the past persists (Memory)
```

Experiences are **ephemeral** (future/present). Memories are **persistent** (past). There must never be two product surfaces representing the same moment — no “Past experiences” archive alongside Memories.

---

## Lifecycle chain

### Future: Ideas (not M12)

Undated aspirations (“Visit Japan someday”) are **not** experiences. They are a future **Idea** concept:

```text
Idea (no schedule)
  → user sets dates
  → Experience
```

Do not accept undated rows in `experiences`. Ideas get their own feature later.

### Experience (M12+)

A **dated plan** to live a real moment — solo or with others (others in M14).

- Requires **`starts_at` and `ends_at`** (best estimate; see Time rules).
- **`visibility`:** `private` (invited participants only) or `public` (discoverable later). No `friends` visibility tier — private plans use explicit invites.
- **Cancelled** plans remain visible (on Home and detail) until **`purge_at = ends_at + 24 hours`**, then auto-delete. They never become memories.
- **Planned** plans drop off Home when **`transform_at`** passes (awaiting M13 memory transform).

### Live window

Between `starts_at` and automatic transform, the plan is **being lived**.

Future (M13+): in-window capture (“Save a photo for this memory”) attaches assets that transfer into the generated memory. Architecture must keep `transform_at` after `ends_at` with a grace period so post-moment capture is possible.

### Memory (M13+)

When `transform_at` passes, the experience **transforms** into memory in one transaction:

```text
INSERT memories (shared core + leader + policies)
INSERT memory_participants (one row per participant; M13 solo = organizer)
DELETE experience
```

Memory is the **only** long-term source of truth for that moment.

---

## Experience vs Memory — responsibilities

| Concern | Experience | Memory |
|---------|------------|--------|
| Time role | Future / present | Past |
| User job | Plan, coordinate | Remember, reflect |
| Lifetime | Ephemeral | Persistent |
| Home tab | Upcoming + cancelled-until-purge plans | **Profile** — memories list (M13+) |
| Content | Title, description, location, schedule | Shared title, description, location, when + photos + **personal notes** |
| Social | Invites, chat (later) | Shared memory + participation (leave preserves history for others) |
| End state | Transform or purge | Leave memory; orphan purge when no active participants remain |

---

## Automatic transformation

Kairos is **not** a task manager. Users do not tap “Complete plan.”

**Rule:**

```text
transform_at = ends_at + grace_period
```

- **`grace_period`:** ~3 hours after `ends_at` (exact value set in migration; allows the moment to run long and supports future in-window capture).
- A scheduled job runs transform when `now() >= transform_at` and status is still active/planned.
- **M13** implements `transform_experience_to_memory()` (atomic insert memory + delete experience).
- **M12** stores `transform_at` and purges **cancelled** rows only; transform RPC ships in M13.

**No manual complete** as the primary lifecycle path.

**If dates change:** recompute `transform_at` on edit while the plan is still upcoming.

### Cancel vs remove

| Action | Meaning | When |
|--------|---------|------|
| **Cancel** | This real plan is **no longer happening** | Legitimate plan that won't occur; stays visible until `purge_at` |
| **Remove** | User **does not want this in their Kairos** | M12 solo: hard-delete row (planned or cancelled before purge). M14: remove participation only; hard-delete experience when **no participants remain** |

Cancel is not “hide immediately.” Remove is not “plan cancelled.” A cancelled plan can still be **removed** early from the user's view.

**M14 participant model (not blocking M12):** `experience_participants` will drive visibility. One participant removing themselves must not destroy the plan for others. The experience row is hard-deleted only when the last participant leaves. M12's `delete_experience` RPC is the solo-organizer version of that rule.

### Location (M12 foundation)

Store structured location for future maps and public discovery — M12 UI uses **name only**:

```text
location_name      — display label (free text today; Places name later)
location_latitude  — optional; both null or both set
location_longitude — optional
```

Do not rely on a single opaque text field long term.

### Cancelled plan retention

```text
purge_at = ends_at + 24 hours
```

Purpose: anyone involved can still understand what happened **around the scheduled time** — not “X hours after you tapped cancel.”

Examples:

- Cancel one week early → stays visible as cancelled until shortly after the planned end
- Check the next day → enough context; then Kairos removes it

---

## Time and date rules

Both **`starts_at`** and **`ends_at`** are **required** on create.

**Why both are required:**

- Automatic memory timing needs a known end — not a hidden default duration.
- Trips, dinners, and events all have a natural end estimate.
- Undated items belong to **Ideas**, not experiences.

**Constraints:**

- `ends_at > starts_at`
- User copy: *“When does this end? Give your best estimate — this helps Kairos create your memory.”*

**UX friction reduction (not schema exceptions):**

- Smart defaults **in the form** (e.g. dinner start + 3h end; trip Fri–Sun; “Same day, +4 hours”) — user confirms or edits before save.
- Both timestamps always stored explicitly.

**Timezone:** store `timestamptz` (UTC); display in device local time.

---

## Creator vs organizer

Two roles on experiences:

| Field | Purpose | Mutable? | Visible to users? |
|-------|---------|----------|-------------------|
| **`created_by`** | Who originally created the row | **Never** | **No** — technical/audit metadata only |
| **`organizer_id`** | Who can edit, cancel, invite, transfer leadership | **Yes** (M14+) | **Yes** — “who is running this plan” |

On create (M12): `organizer_id := created_by`.

**Memories:** do not treat `created_by` or `leader_id` as displayed ownership. The shared memory represents the group moment. **`leader_id`** is operational admin (WhatsApp-style), not owner. Personal data lives only in **`personal_note`** (private) and participation rows.

RLS and RPCs should check **`organizer_id`** on experiences and **`leader_id` + policies** on memories for management actions — not `created_by`.

---

## Visibility and opportunities

**Visibility (experiences only):**

- **`private`:** only organizer + invited participants know it exists.
- **`public`:** discoverable (M16+); join open or approval-required (M17).

**Opportunities** (external catalog, M18) are **not** experiences. Example: an airshow at the beach is an **Opportunity**; each group creates its own **Experience** via “Plan this.” One opportunity → many experiences → many memories.

---

## Shared memory model (M13 — locked)

Memories feel like a **WhatsApp group memory**, not individual duplicated albums.

```text
Luis + María + Pedro → ONE memory
  • Trip to Granada        (shared title — one for everyone)
  • shared description, location, when
  • shared photo gallery
  • participants: Luis, María, Pedro
```

**Avoid:** Luis’s version / María’s version / Pedro’s version of the same moment.

There is **one shared** title, description, location, and date. Everyone remembers the same moment. No personal titles or personal descriptions that fork the shared surface.

**Personal layer (private only):**

- **`personal_note`** on `memory_participants` — “my thoughts about that moment” (e.g. *“Great night, we stayed up until 3 AM”*). Never shown to other participants.
- No `hidden_from_timeline`, no archive, no invisible copy of the memory.

### Where memories live in the app

| Tab | Role |
|-----|------|
| **Home** | What is **going to happen** — upcoming and cancelled-until-purge **experiences** only |
| **Profile** | Who I am and what I have **lived** — friends, stats, **memories** |

Profile shows memory count (e.g. “7 memories”) and a full **Memories** area: list, search/filter (M13: title search; date filters later), tap through to detail. Memories are core identity — give them real space, not a tiny preview only.

### Data model (conceptual)

```text
memories
  — shared core: title, description, location_*, happened_starts_at, happened_ends_at
  — leader_id (operational admin — not “owner”)
  — edit_info_policy, add_media_policy
  — visibility, inspired_by_opportunity_id, transformed_at
  — created_by, organizer_id_at_transform (audit only, never shown as identity)
  — updated_at, updated_by (shared edit audit)

memory_participants
  — memory_id, user_id (nullable after account delete)
  — role (organizer | participant)
  — personal_note (private; max 1000 chars)
  — joined_at, left_at (NULL = active participation)
  — memory_id → memories(id) ON DELETE CASCADE (leave uses left_at; memory delete removes row)

memory_media
  — shared gallery; uploaded_by_user_id (nullable → “Deleted user”)
  — memory_id → memories(id) ON DELETE CASCADE
```

A 100-person public event → **one** memory row + 100 participant rows — not 100 copied memories.

### Memory leader (admin, not owner)

The leader **manages** the memory (settings, moderation, edit policy) — like a WhatsApp group admin. The memory does **not belong** to them.

```text
Experience organizer  →  Memory leader (at transform)
```

**Leader transfer:**

| Case | Rule |
|------|------|
| **Voluntary leader leave** | Leader **must choose** the next leader before leaving (human handoff). |
| **Account deletion / forced removal** | Automatic fallback: **oldest remaining active participant** by `joined_at` (deterministic tie-break if needed). |

`leader_id` must always reference an **active** participant (`left_at IS NULL`). Transfer runs **before** the outgoing leader’s row is marked left or tombstoned.

### Edit permissions (WhatsApp-style)

Policies on each memory (set at transform; leader can change later — UI in M14+):

| Policy | Values |
|--------|--------|
| **`edit_info_policy`** | `all_participants` \| `leader_only` |
| **`add_media_policy`** | `all_participants` \| `leader_only` |

Examples:

- Romantic dinner (2 people): defaults often `all_participants` for both.
- Public football event (100 people): defaults often `leader_only` for shared info edits; media policy per product default.

**M13:** Store policies + enforce in RPCs. Solo memory defaults to `all_participants`. Settings UI can wait.

**Concurrent edits (shared title/description):**

- **Last-write-wins** at the database — no merge UI.
- Track **`updated_at`** and **`updated_by`** on `memories` for audit.
- **Optimistic concurrency (recommended):** `update_memory_info` accepts optional `expected_updated_at`; if stale, return a clear conflict error (*“Someone else updated this memory. Refresh and try again.”*). Simple, not over-engineered — no cooldowns or CRDTs in M13.

Shared fields are **editable** under policy — not frozen at transform.

### Leaving a memory vs deleting an account

These are **different**. Kairos has **no hidden archive**.

**Voluntary leave** — “I don’t want this in my Kairos anymore.”

```text
SET left_at = now()   -- row stays; user_id stays
```

- User **loses access** immediately (`list_my_memories` excludes `left_at IS NOT NULL`).
- User **cannot restore** from a hidden place — leave is intentional.
- **Others still see** that person was part of the moment (participant history preserved).
- Luis leaving does **not** make María forget Luis was there.

**Account deletion** — erase personal data, preserve shared moment for others:

```text
user_id → NULL; clear personal_note; show “Deleted user”
```

- No name, avatar, username, or PII.
- Shared photos remain; attribution becomes **“Deleted user”**.

**Active participant** (memory stays alive):

```text
user_id IS NOT NULL  AND  left_at IS NULL
```

**Orphan purge:** when **no** active participants remain → `DELETE` memory, media, and storage. Tombstone rows (`user_id NULL`) and `left_at` rows alone do **not** keep a memory alive.

### Personal notes

Included in **M13**. Private thoughts only — never a second version of title/description.

### Media philosophy

- Media belongs to the **shared memory**, attributed to uploader.
- Uploader can delete **their** uploads; **leader** can remove any media (moderation — full UI M14+).
- Account deletion: `uploaded_by_user_id → NULL`, photo stays, UI: **“Deleted user”**.
- Future: reports, leader moderation, purpose-bound DMs — schema must not block these (e.g. future `memory_media_reports`).

### Character limits

Validate in **UI and database** (CHECK + RPC). Align shared fields with experiences where applicable:

| Field | Limit |
|-------|-------|
| Title (experience + memory) | **120** characters |
| Description (experience + memory) | **2000** characters |
| Location name | **200** characters |
| Personal note | **1000** characters |

---

## Deletion lifecycle (database rules — locked)

Kairos has two distinct deletion modes. Do not conflate them.

| Mode | Meaning | Example |
|------|---------|---------|
| **User leaves** | User opts out; shared entity may survive for others | `leave_memory` → `left_at` |
| **User account deleted** | Personal identity erased; tombstone where history needs a slot | `auth.admin.deleteUser` |
| **Parent entity deleted** | Dependent rows removed automatically | `DELETE memories` → CASCADE children |
| **Orphan purge** | No active participants remain | RPC/cron deletes memory row |

**Active participant** (memories): `user_id IS NOT NULL AND left_at IS NULL`. Tombstones and voluntary leave rows do **not** keep a memory alive.

### Account deletion chain

The **only** supported account deletion entry point is `DELETE auth.users` (via `delete-account` Edge Function). Never `DELETE FROM profiles` directly — that orphans `auth.users`.

```text
DELETE auth.users
  → CASCADE DELETE public.profiles
  → BEFORE DELETE: handle_profile_delete_memories()
       • transfer leader_id where deleted user was leader
       • tombstone their memory_participants (user_id → NULL, clear personal_note)
       • purge memories with no remaining active participants
  → CASCADE DELETE public.friendships (any row referencing profile)
  → CASCADE DELETE public.experiences (created_by / organizer_id — M12/M13 solo)
  → SET NULL on memories audit columns (created_by, leader_id, …)
  → SET NULL on memory_media.uploaded_by_user_id
  → AFTER DELETE: pg_net → cleanup-user-storage (avatars)
```

| Removed on account delete | Preserved for others |
|---------------------------|----------------------|
| Profile, username, avatar, auth session | Shared memory when other **active** participants remain |
| All friendship rows involving user | Shared photos (uploader → “Deleted user”) |
| User’s upcoming/cancelled experiences (M12 solo) | Other users’ personal notes |
| Solo memories (no active participants left) | Participant history rows (`left_at`, tombstones) until memory purged |

**Deleted participant display:** UI label **“Deleted user”** — no profile link, username, or avatar. Do not snapshot display names that re-identify the person.

### Foreign key inventory (current schema)

Audit every relationship. **Do not blindly CASCADE profile references on shared entities** — M14 will introduce experience participants.

#### `profiles`

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `profiles.id` | `auth.users(id)` | **CASCADE** | Profile is auth extension; delete together |

#### `friendships`

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `user_low_id` | `profiles(id)` | **CASCADE** | Friendship is personal; gone when either user gone |
| `user_high_id` | `profiles(id)` | **CASCADE** | Same |
| `initiated_by` | `profiles(id)` | **CASCADE** | Same |

#### `experiences` (M12/M13 — solo organizer)

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `created_by` | `profiles(id)` | **CASCADE** | ⚠️ **M14 must change to SET NULL** when shared experiences exist |
| `organizer_id` | `profiles(id)` | **CASCADE** | ⚠️ **M14 must change** — transfer organizer or remove participation, not delete shared plan for everyone |

No child tables yet. `inspired_by_opportunity_id` has no FK (M18). Entity delete = `DELETE experiences` row (transform, purge crons, or user remove RPC).

#### `memories`

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `created_by` | `profiles(id)` | **SET NULL** | Audit only; never shown as identity |
| `organizer_id_at_transform` | `profiles(id)` | **SET NULL** | Audit only |
| `leader_id` | `profiles(id)` | **SET NULL** | Transfer via trigger/RPC before leave/delete; SET NULL is fallback |
| `updated_by` | `profiles(id)` | **SET NULL** | Audit only |
| `source_experience_id` | *(none)* | — | Intentional: experience row deleted on transform |

#### `memory_participants`

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `memory_id` | `memories(id)` | **CASCADE** | Parent memory deleted → all participant rows gone |
| `user_id` | `profiles(id)` | **SET NULL** | Account delete → tombstone; leave → `left_at` via RPC, not FK |

#### `memory_media`

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `memory_id` | `memories(id)` | **CASCADE** | Parent memory deleted → metadata rows gone |
| `uploaded_by_user_id` | `profiles(id)` | **SET NULL** | Account delete → “Deleted user” attribution; photo stays for others |

### Entity deletion (parent row removed)

When a **parent entity** is truly deleted, dependent rows must disappear via CASCADE (not manual cleanup in app code).

| Parent deleted | Auto-removed (CASCADE) | Intentionally kept |
|----------------|------------------------|--------------------|
| `memories` | `memory_participants`, `memory_media` (DB) + `memories/{memory_id}/` Storage (pg_net → `cleanup-memory-storage`) | — |
| `memories` (manual admin delete) | Same — CASCADE + Storage cleanup trigger | — |
| `experiences` | *(none yet)* | — |
| `profiles` | `friendships`, `experiences` (M12) | Memory rows (tombstone + purge rules) |

**Leave memory (not delete):** `leave_memory` RPC sets `left_at`; participant row **kept** for shared history. Leader must transfer when required. `purge_memory_if_orphaned` runs when no active participants remain.

**Orphan safety net:** `purge_orphaned_memory_rows()` removes child rows whose `memory_id` was deleted outside CASCADE (manual DB edits only). Runs in **daily maintenance cron** — not in read RPCs. Normal deletes use CASCADE.

**Memory read RPCs:** `list_my_memories`, `count_my_memories`, `get_memory`, `list_memory_participants`, and `list_memory_media` are **LANGUAGE sql, STABLE, SECURITY DEFINER, SELECT only**. No purge, no transform inside reads (Postgres read-only transaction error 25006).

**Memory RLS (SELECT):** Policies on `memories`, `memory_participants`, and `memory_media` must **not** subquery `memory_participants` directly — that causes **42P17 infinite recursion** when INVOKER code reads those tables. Use `is_active_memory_participant(memory_id)` (SECURITY DEFINER helper) in all three SELECT policies.

**Transform before list (client):** Profile and memories search call `transform_my_due_experiences()` as an explicit **write RPC** before listing — not embedded in read RPCs. Also: ended experience detail (`ensure_experience_transformed`), global cron every 15 min.

**RPC implementation note:** Do not use plpgsql `RETURNS TABLE (id, …)` with `RETURN QUERY SELECT m.id, …` — PostgreSQL error **42702**. Use **LANGUAGE sql** (like experiences).

### Storage lifecycle

| Bucket | Path convention | Deleted when |
|--------|-----------------|--------------|
| `avatars` | `{user_id}/…` | Account delete → `cleanup-user-storage` Edge Function (pg_net trigger on `profiles` DELETE) |
| `memories` | `{memory_id}/{media_id}.ext` | Single photo → `delete_memory_photo` RPC → `DELETE memory_media` → pg_net → `cleanup-memory-storage` (single path); **whole memory** → `DELETE memories` → pg_net → folder cleanup |

**Memory storage cleanup:** Both use the same Edge Function (`cleanup-memory-storage`) via pg_net after commit — never client `storage.remove` for lifecycle deletes.

| Trigger | Payload | Storage action |
|---------|---------|----------------|
| `AFTER DELETE ON memory_media` | `old.storage_path` | Remove one file |
| `AFTER DELETE ON memories` | `old.id` | Remove `{memory_id}/` folder |

**Photo delete permissions (`delete_memory_photo` RPC):** uploader always; memory leader on any photo. UI in photo viewer (M13.5).

**Shared memories:** Memory row and folder stay while active participants remain. Entity delete only when last participant leaves, orphan purge, etc.

**Rule:** Never store `{user_id}/…` paths in `memories` bucket — media belongs to the shared memory, not the uploader folder.

### Cron / RPC purge responsibilities

| Job | Purpose |
|-----|---------|
| `purge_stale_experiences()` | Cancelled plans past `purge_at` |
| `transform_due_experiences()` | Planned → memory at `transform_at` |
| `purge_orphaned_memories()` | Memories with zero active participants |
| `purge_orphaned_memory_rows()` | Child rows whose memory row was removed outside CASCADE (cron only) |
| `maintain_orphaned_memories()` | Daily cron: child-row purge + memory orphan purge |
| `transform_my_due_experiences()` | Explicit write RPC (Profile/memories screen) + not inside reads |
| `expire_stale_friend_requests()` | Pending requests > 60 days |
| `handle_profile_delete_memories()` | Leader transfer + tombstone + **immediate** orphan memory purge (+ Storage cleanup via memory DELETE trigger) |

### M14+ migration requirements (do not ship without)

1. **`experience_participants`** table — leave/tombstone pattern like memories; do not CASCADE-delete shared experiences when one user deletes account.
2. **`experiences.created_by`** → change to **SET NULL** (audit tombstone).
3. **`experiences.organizer_id`** → transfer or participation RPC, not CASCADE for shared plans.
4. ~~**Memory storage cleanup** on `DELETE memories`~~ — **done in M13** (`cleanup-memory-storage` + pg_net trigger). M14 must not reintroduce client-only purge paths.

---

## Account deletion and shared memories

Deleting an account removes **personal footprint**, not **shared history** for everyone else.

When a user deletes their Kairos account:

| Removed | Preserved |
|---------|-----------|
| Profile, username, avatar | The shared memory others still share |
| Auth session, friendships | Other participants’ personal layers |
| Their upcoming experiences (M12 solo) | Memory record of the moment (for others) |
| Solo memories (no active participants after tombstone) | Shared photos with “Deleted user” attribution |

**Implementation (M13):**

- `memory_participants.user_id` → `ON DELETE SET NULL`; trigger clears `personal_note`.
- Voluntary leave → `left_at`, row kept.
- Photos uploaded by deleted user remain; UI: **“Deleted user”**.
- **`created_by` / `organizer_id_at_transform` / `updated_by`:** SET NULL; never shown as identity.
- **`leader_id`:** transfer before leader leaves or deletes account; immediate orphan purge when no active participants remain.

**Orphaned memories:** purge when **no active participants**. Tombstones and `left_at` rows alone do not keep a memory alive.

This matches: *leave your copy of the past without erasing it for others; delete your account without destroying the shared moment — but don’t keep ghosts nobody active still holds.*

---

## Experience chat and messaging (future)

**Experience chat (M15):** scoped to one experience, participants only — not DMs. Purged with the experience; not copied to memory.

**DMs (later, purpose-bound):** Kairos is not an open inbox. Possible gates: mutual friends, co-participants on a memory or experience, public join context. Not Instagram-style “message anyone.” Architecture should not block this; do not build in M13.

---

## Anti-drift (core domain)

Do **not** add during Experiences/Memories milestones:

- Home feed of friends’ activity
- Recommendations or trending
- Undated experiences (use future Ideas)
- Manual “complete” as primary UX
- Permanent archive of completed experiences
- General open DM inbox (purpose-bound messaging may come later)

---

Current goal:

**Milestone 13.5 — Cleanup** — photo delete UI, server-side single-file storage cleanup, M13 migration squash, docs sync. Awaiting final smoke test before commit.

**Milestone 14 — Shared experiences** — next product milestone.

### M13 migrations (squashed — 4 files)

See `supabase/MIGRATIONS.md`. Fresh install runs four intentional migrations after M12:

| Version | File | Purpose |
|---------|------|---------|
| `251000` | `memories_foundation.sql` | Tables, RLS, helpers, transform, read/write RPCs, experience guards, transform cron |
| `251100` | `memories_storage.sql` | Private `memories` bucket + storage RLS |
| `251200` | `memories_lifecycle.sql` | CASCADE audit, orphan purge, account-delete handler, daily maintenance cron |
| `251300` | `memories_storage_cleanup.sql` | `DELETE memories` → folder cleanup; `DELETE memory_media` → file cleanup |

### M13.5 product + security changes

- Photo delete in `MemoryPhotoViewer` (uploader or leader); confirm in memory detail
- `delete_memory_photo` RPC only — no client-side `storage.remove`
- `cleanup-memory-storage` Edge Function — folder mode + single-file mode (pg_net triggers in `251300`)
- Migration squash (11 → 4 M13 files) + remote reset
- RPC EXECUTE audit (`251400`) — see `docs/SECURITY.md`

---

# Milestone 13 — validation checklist

Run after `npx supabase db push` on linked Supabase.

**Text limits (Experiences ↔ Memories aligned)**

- [ ] Experience form blocks title > 120, description > 2000, location > 200 (UI + error messages)
- [ ] DB rejects over-limit experience writes (RPC / CHECK)
- [ ] Memory personal note blocked at 1000 chars (UI + RPC)
- [ ] Transformed memory inherits experience title/description/location without truncation errors

**Transform lifecycle**

- [ ] Plan past `transform_at` drops off Home
- [ ] Profile/memories screen calls `transform_my_due_experiences` then lists (read RPC stays pure)
- [ ] Opening ended plan detail lazy-transforms and redirects to memory detail
- [ ] Cron `transform_due_experiences` creates memories for due plans (optional: simulate via SQL)
- [ ] Cancelled plans never become memories

**Manual transform test (SQL)**

- [ ] `experiences_transform_after_end` blocks `transform_at < ends_at` — correct
- [ ] To force transform: set `ends_at` in the past, then `transform_at = ends_at + interval '3 hours'` (or any value ≥ `ends_at` and ≤ `now()`), then call `transform_my_due_experiences()` or open Profile

**Experience dates**

- [ ] Cannot create or edit a plan with `starts_at` in the past (10-minute buffer)
- [ ] UI date picker enforces minimum start time

**Profile memories**

- [ ] Profile shows memory + friend stats; friends stat opens friends list
- [ ] Edit profile button on Profile (not buried in settings)
- [ ] Memories appear inline on Profile (feed), not only behind a button
- [ ] Zero memories → empty state (not load error)
- [ ] RPC failure → error state with retry
- [ ] Search link opens title search screen when memories exist
- [ ] Settings (gear) opens account actions — switch account, sign out, delete account

**Memory data integrity**

- [ ] Deleting a `memories` row cascades to `memory_participants` and `memory_media`
- [ ] Orphan child rows from manual DB delete are cleaned by daily maintenance cron (not read RPCs)
- [ ] Account delete on solo memory purges memory immediately (not only daily cron)
- [ ] Account delete on shared memory tombstones user; memory preserved for active participants

**Memory detail**

- [ ] Shared title, dates, location, description display
- [ ] Participants list with leader label
- [ ] Add photo from library → appears in gallery (signed URL)
- [ ] Tap photo thumbnail → full-size viewer; swipe between photos; close returns to detail
- [ ] Viewer shows uploader name (or Deleted user) and upload date
- [ ] Uploader can delete own photo; leader can delete any photo; Storage file removed (Edge Function log)
- [ ] Personal note saves and reloads (private)
- [ ] Leave memory → removed from list; solo memory purges entirely
- [ ] Solo memory purge → `memories/{memory_id}/` folder removed from Storage (pg_net → `cleanup-memory-storage` logs)
- [ ] Shared memory leave (when others remain) → memory row + Storage files preserved

**Regression**

- [ ] Create/edit/cancel/remove upcoming experiences unchanged
- [ ] Search, friends, switch account, sign out unchanged

**Explicitly not in M13 (confirm absent)**

- [ ] No permission settings UI
- [ ] No moderation / reporting / DMs
- [ ] No date filter on memories list
- [ ] No memories on Home tab

---

## M13 implementation plan (locked architecture — approved)

Build in order; validate manually before commit (same rhythm as M12).

### Phase 1 — Database

1. Enums: `memory_participant_role`, `memory_edit_policy`, `memory_media_policy`
2. Tables: `memories`, `memory_participants`, `memory_media`
3. CHECK constraints for character limits (title 120, description 2000, location 200, personal_note 1000)
4. RLS: SELECT for active participants; writes via SECURITY DEFINER RPCs only
5. RPCs:
   - `transform_experience_to_memory(p_experience_id)` — internal
   - `transform_due_experiences()` — cron batch
   - `ensure_experience_transformed(p_experience_id)` — lazy on read
   - `list_my_memories(p_search optional)` — Profile list (`left_at IS NULL`)
   - `get_memory(p_id)` — shared core + participants (others’ notes excluded) + media
   - `update_memory_info(..., expected_updated_at optional)` — policy + optimistic lock
   - `update_my_memory_note(p_id, note)`
   - `leave_memory(p_id, new_leader_id optional)` — leader must pass successor when required
   - `transfer_memory_leadership(p_id, new_leader_id)` — leader handoff
   - `add_memory_photo` / `delete_memory_photo` — policy checks
   - `purge_orphaned_memories()` — cron
6. Cron: transform due experiences (~15 min); purge orphans (daily)
7. Leader transfer on profile delete: trigger or extend delete-account flow (oldest active by `joined_at`)

### Phase 2 — Storage

1. Private `memories` bucket — path `memories/{memory_id}/{media_id}.{ext}`
2. Storage policies: participants only
3. Cleanup on memory DELETE (Edge Function or pg_net, mirror avatar pattern)

### Phase 3 — Client (minimal functional)

1. Types + `lib/memories.ts`
2. Profile: memory count stat
3. `/(profile)/memories` — full list + title search
4. `/(profile)/memories/[id]` — detail, shared info, gallery, add photo, personal note, leave (with leader picker when needed)
5. Ended experience detail → lazy transform → redirect to memory
6. i18n en/es
7. Manual validation checklist in PROJECT.md

### Explicitly out of M13

- Live-window photo capture during experience
- Permission settings UI (defaults only)
- Media reports / leader moderation UI
- DMs
- Date filter on memories list
- Memories on Home tab
- Rejoin after leave

---

## Experiences schema notes (M12 audit)

Stored columns and why they exist — do not remove without updating this section:

| Column | Recommendation | Rationale |
|--------|----------------|-----------|
| `transform_at` | **Keep stored** | Recomputed on edit when `ends_at` changes; indexed for cron (`transform_at <= now()`). Storing avoids repeating `ends_at + interval` in every query and preserves the value if grace-period rules change later. |
| `purge_at` | **Keep stored** | Set at cancel time from `ends_at + 24h`; indexed for purge cron. Cancel can happen long before `ends_at`; a computed rule would need `cancelled_at` + logic anyway. |
| `cancelled_at` | **Keep** | Audit and future UX (“cancelled on …”); required by `experiences_cancelled_consistent` CHECK. |
| `created_by` | **Keep** | Immutable audit of who created the row; distinct from `organizer_id` when leadership transfers (M14). Never shown in UI. |
| `organizer_id` | **Keep** | Current permission anchor; M14 adds participants but organizer remains the operational role. |
| `location_name` / lat / lng | **Keep** | M12 uses name only; lat/lng ready for maps and public-by-area without a breaking migration. |
| `inspired_by_opportunity_id` | **Keep nullable** | Links user plans to Opportunities catalog (M18); no FK until opportunities table exists. |
| `visibility` | **Keep** | `private` \| `public` from day one; M12 RPCs enforce private only until M16. |

---

# Milestone 12 — validation checklist (complete)

Applied migrations: `20260624100000_experiences_foundation.sql`, `20260624110000_experience_m12_adjustments.sql`.

**Create & list**

- [x] Home shows empty state with **New experience** CTA
- [x] Create plan with title, dates (date/time picker), optional location/description → lands on detail
- [x] Plan appears on Home with formatted date range

**Edit**

- [x] Edit upcoming plan → changes persist on detail and Home
- [x] End time must be after start time (validation message if not)

**Cancel (purge_at = ends_at + 24h)**

- [x] Cancel upcoming plan → status **Cancelled** on detail; still on Home
- [x] Cancel a plan scheduled far in the future → remains visible until **ends_at + 24 hours**, not “24h after cancel tap”
- [x] After purge window passes (or simulate via DB) → plan disappears from Home

**Remove**

- [x] Remove upcoming plan → confirm copy says it leaves your Kairos (not “created by mistake”)
- [x] Remove cancelled plan → disappears immediately from Home and detail
- [x] Cancelled plan cannot be edited; remove is still available before purge

**Transform boundary (M13)**

- [x] Plan past `transform_at` drops off Home; detail lazy-transforms to memory
- [x] No manual **Complete** button anywhere

**Regression**

- [x] Search, Profile, friends, switch account, sign out unchanged

---

# Milestone 11 — manual validation checklist

Run after applying migration `20260623100000_friend_relationships.sql` to linked Supabase.

**Friend request flow**

- [ ] User A finds User B via Search → opens public profile → **Add friend** → A sees “Request sent”
- [ ] User B sees incoming request on Profile → Friend requests → Accept
- [ ] Both see **You are friends** on public profile; B appears in A’s Friends list and vice versa

**Decline / cancel**

- [ ] B declines incoming request → row deleted; A sees **Add friend** again
- [ ] A cancels outgoing request → row deleted; A sees **Add friend** again

**Simultaneous requests**

- [ ] A sends request to B; B sends request to A before accepting → both become friends (auto-accept)

**Remove friend**

- [ ] Either user taps **Remove friend** → confirm dialog → friendship removed on both sides

**Edge cases**

- [ ] Own public profile shows self message — no friend actions
- [ ] Incomplete / unknown username → not found (unchanged from milestone 10)
- [ ] Switch account → relationship status reflects active session
- [ ] Delete account → friendship rows involving that user are gone (CASCADE)

**Regression**

- [ ] Search still works
- [ ] Profile edit, switch account, sign out unchanged

---

# Supabase security architecture

Kairos prefers **controlled RPCs** with business rules in SQL over broad table write grants. Supabase Security Advisor warnings should be triaged as follows:

| Advisor item | Verdict | Notes |
|--------------|---------|-------|
| **SECURITY DEFINER** friendship RPCs | Expected — keep | `send_friend_request`, `accept_friend_request`, etc. enforce canonical pair ordering, expiry, and simultaneous-accept rules. All use `SET search_path = public`. Reads use INVOKER RPCs + RLS SELECT. |
| **SECURITY DEFINER** experience RPCs | Expected — keep | `create_experience`, `update_experience`, `cancel_experience`, `delete_experience` enforce dates, visibility, and solo-organizer rules. Table writes are not granted to `authenticated`. |
| **SECURITY DEFINER** triggers / cron | Expected — keep | `handle_new_user`, storage cleanup, purge/transform jobs. Revoke EXECUTE from PUBLIC where applicable (see `20260618010000_security_hardening.sql`). |
| **`rls_auto_enable()`** | Supabase-internal noise | Not owned by this project; documented in `20260618010000_security_hardening.sql`. No action. |
| **Leaked password protection** | Not applicable | Kairos uses **Email OTP only** — no password auth. Enable in Supabase dashboard if passwords are added later. |

Do not weaken RLS or remove DEFINER RPCs just to silence the linter.

---

# Important notes for AI assistants

When helping with Kairos:

- Always understand the product before coding.
- Read **Create → Live → Remember** for core domain rules (experiences, memories, transform, deletion).
- Follow the **Roadmap** section — social foundation is complete; core domain is experiences and memories.
- Do not build feeds, recommendations, suggested users, or Discover content during early core milestones.
- Friendships are **mutual** (Discord-style), not follows — no follower counts or asymmetric graph.
- Do not conflate global user search (Search tab) with the experience participant picker (friends only, later).
- **Remove** (not “delete as mistake”) removes a plan from the user’s Kairos; shared participant rules arrive in M14.
- Experiences require **starts_at and ends_at**; undated items are future Ideas, not experiences.
- Memories live on **Profile**, not Home — Home is future plans only.
- One **shared** memory per moment — no personal titles; **personal_note** is private only.
- **Leader** = admin, not owner; voluntary leave requires choosing successor when leader.
- **Leave** sets `left_at` (preserves history for others); **account delete** tombstones user — no hidden archive.
- Experiences transform to memories **automatically** at `transform_at` — no task-manager “complete” UX.
- Do not blindly generate files.
- Explain architectural decisions.
- Suggest improvements if something does not scale.
- Prioritize long-term quality.
- Ask before making major changes.

Kairos should feel like a professional product from day one.