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
Identity and social foundation complete. **M12 Experiences**, **M13 Memories**, **M13.5 cleanup**, and **M14 shared experiences** complete — including notification retention and list/detail UX polish.

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
14. M13.5 cleanup (photo delete, migration squash, security audit). ✓
15. Shared experiences (M14 — invites, participants, lifecycle, notifications foundation, leadership SSOT cleanup). ✓

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
| **13. Memories** ✓ | Shared memory core + personal layer; automatic transform; timeline |
| **13.5 Cleanup** ✓ | Photo delete, migration squash, storage lifecycle, security audit |
| **14. Shared experiences** ✓ | Invites, suggest flow, group transform, notifications foundation + inbox retention |
| **15. Experience chat** | Purpose-bound coordination; not DMs |
| **16. Public experiences** | Discoverable plans; open join |
| **17. Join approval** | Request → approve/decline |
| **18. Opportunities** | Catalog → “Plan this” → experience |
| **19. Notifications UX** | Inbox UI, badges, push — builds on M14 notification rows (retention already shipped) |

## Phase D — Community inspiration (later)

Public discovery at scale, validated catalog content, optional inspiration feeds. Friendships and visibility enums plug in here — not before core domain exists.

```text
Identity ✓ → Friends ✓ → Experiences ✓ → Memories ✓ → Shared experiences ✓ → Chat → Public → Opportunities
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
- **Planned** plans stay on Home while the **`experiences` row exists** — including after **`transform_at`** passes, until transform DELETEs the row and the memory is created. UI may show **“Becoming a memory…”** during that short window.

### Live window

Between `starts_at` and automatic transform, the plan is **being lived**.

Future (M13+): in-window capture (“Save a photo for this memory”) attaches assets that transfer into the generated memory. Architecture must keep `transform_at` after `ends_at` with a grace period so post-moment capture is possible.

### Memory (M13+)

When `transform_at` passes, the experience **transforms** into memory in one transaction:

```text
INSERT memories (shared core + leader + policies from experience)
INSERT memory_participants (one row per accepted experience participant)
DELETE experience (+ CASCADE invitations, participants)
```

Memory is the **only** long-term source of truth for that moment.

**M14:** transform includes every **accepted** experience participant. Pending invitations do not become memory participants.

---

## Experience vs Memory — responsibilities

| Concern | Experience | Memory |
|---------|------------|--------|
| Time role | Future / present | Past |
| User job | Plan, coordinate | Remember, reflect |
| Lifetime | Ephemeral | Persistent |
| Home tab | Active plans (until transform DELETE) + cancelled-until-purge | **Profile** — memories list (M13+) |
| Content | Title, description, location, schedule | Shared title, description, location, when + photos + **personal notes** |
| Social | Invites, coordination (M14+); chat M15 | Shared memory + participation (**leave preserves history** for others) |
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

### Experience lifecycle (M14 — locked)

Experiences represent **who is currently planning to attend**. Memories represent **what was lived**. Participation semantics differ on purpose.

| Action | Who | Effect |
|--------|-----|--------|
| **Leave** | Any participant | `DELETE` their `experience_participant` row — **no tombstone**, no `left_at` |
| **Remove** | Leader only | Same as leave — hard-delete participant row (moderation; toxic participant) |
| **Cancel** | Leader only (planned) | `status = cancelled`, set `cancelled_at` + `purge_at`; plan stays visible to participants until purge window |
| **Delete** | Leader only (planned) | Hard-delete experience for **everyone** (destructive; distinct UX copy from cancel) |
| **Revive** | Any active participant | `cancelled` → `planned` if **`starts_at > now()`**; reviver becomes `organizer_id` |

**Cancelled plans (permission model):** `organizer_id` stays in the DB for history, but there is **no active leader** until someone revives. While cancelled, participants only see **Revive** (when eligible) and **Leave** — no delete, transfer, remove, invite, or edit leader actions.

**Revive rule (locked):** If `starts_at` has already passed, **do not show Revive** and do not offer a date picker during revive. The moment’s scheduling window is gone — keep the flow simple.

**Last participant gone:** `DELETE` experience row (same as solo M12 when the only person leaves).

**Cancel vs delete UX:** Both are leader-only while the plan is **planned**. Copy must make clear that **cancel** keeps the plan visible and revivable (when dates allow); **delete** permanently removes it for all participants. Once cancelled, delete is not offered — participants wait out the purge window or leave individually.

**M12 “Remove” (solo):** Maps to **Leave** when the user is a participant. When solo organizer removes the plan entirely, that is **Delete** (or leave as last participant → experience purged).

**Invitations:** Only **accepted** invitees become `experience_participants`. Pending/declined invitations never appear in the participant list.

**Account delete (experiences):** Remove participation completely — **no tombstone** on `experience_participants`. Cancel pending invites involving the deleted user. Transfer `organizer_id` before purge when they were leader.

**Account delete (memories):** Unchanged from M13 — tombstone (`user_id → NULL`), preserve shared moment for others.

**Leader remove participant:** Leader may remove a participant before transform (same hard-delete as voluntary leave). Does **not** apply to memories — removing someone from a lived memory is out of scope for M14.

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
| **`organizer_id`** | Who can edit (per policy), cancel, delete, invite, approve suggestions, remove participants, transfer leadership | **Yes** (M14+) | **Yes** — UI label **Leader** |

On create (M12/M14): `organizer_id := created_by`. Creator is always the first accepted participant row.

**Memories:** do not treat `created_by` or `leader_id` as displayed ownership. The shared memory represents the group moment. **`leader_id`** is operational admin (WhatsApp-style), not owner. Personal data lives only in **`personal_note`** (private) and participation rows.

RLS and RPCs should check **`organizer_id`** on experiences and **`leader_id` + policies** on memories for management actions — not `created_by`.

**Edit policies (M14 experiences, M13 memories):** Each entity stores `edit_info_policy`: `all_participants` \| `leader_only`. Applies to shared **content** (title, description, location) — not lifecycle actions (cancel, delete, invite, remove participant, leadership transfer).

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
| **Home** | What is **going to happen** — planned experiences (until transform) and cancelled-until-purge |
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
  — personal_note (private; max 1000 chars)
  — joined_at, left_at (NULL = active participation)
  — notifications_muted boolean DEFAULT false
  — memory_id → memories(id) ON DELETE CASCADE (leave uses left_at; memory delete removes row)

**Leadership (SSOT):** `experiences.organizer_id` and `memories.leader_id` are the only operational leadership columns. Participant list RPCs expose derived flags (`is_organizer`, `is_leader`) — no stored participant `role` (removed in migration `261607`).

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

| Mode | Meaning | Experience (M14) | Memory (M13) |
|------|---------|------------------|--------------|
| **User leaves** | User opts out; entity may survive for others | `DELETE` participant row | `leave_memory` → `left_at` |
| **Leader removes** | Moderation before the moment | `DELETE` participant row | Out of scope M14 |
| **User account deleted** | Personal identity erased | `DELETE` participation | Tombstone participant |
| **Parent entity deleted** | Dependent rows CASCADE | `DELETE experiences` | `DELETE memories` → CASCADE |
| **Orphan purge** | No active participants remain | DELETE experience row | DELETE memory row |

**Active participant** (memories): `user_id IS NOT NULL AND left_at IS NULL`. Tombstones and voluntary leave rows do **not** keep a memory alive.

### Account deletion chain

The **only** supported account deletion entry point is `DELETE auth.users` (via `delete-account` Edge Function). Never `DELETE FROM profiles` directly — that orphans `auth.users`.

```text
DELETE auth.users
  → CASCADE DELETE public.profiles
  → BEFORE DELETE: handle_profile_delete_memories()
       • transfer leader_id where deleted user was leader
       • tombstone memory_participants (user_id → NULL, clear personal_note)
       • purge memories with no remaining active participants
  → BEFORE DELETE: handle_profile_delete_experiences() (M14)
       • transfer organizer_id where deleted user was leader
       • DELETE experience_participant rows (no tombstone)
       • cancel pending invites; purge experience if no participants remain
  → CASCADE DELETE public.friendships (any row referencing profile)
  → SET NULL on experiences.created_by / organizer_id (M14 — no CASCADE on shared plan row)
  → SET NULL on memories audit columns (created_by, leader_id, …)
  → SET NULL on memory_media.uploaded_by_user_id
  → AFTER DELETE: pg_net → cleanup-user-storage (avatars)
```

| Removed on account delete | Preserved for others |
|---------------------------|----------------------|
| Profile, username, avatar, auth session | Shared memory when other **active** participants remain |
| All friendship rows involving user | Shared photos (uploader → “Deleted user”) |
| User’s participation on upcoming experiences | Other participants’ plans (experience row stays) |
| Solo memories (no active participants after tombstone) | Shared photos with “Deleted user” attribution |

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

#### `experiences` (M12 solo → M14 shared)

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `created_by` | `profiles(id)` | **CASCADE** → **M14: SET NULL** | Audit tombstone only |
| `organizer_id` | `profiles(id)` | **CASCADE** → **M14: SET NULL** | Transfer via RPC before leave/delete; never CASCADE-delete shared plan |

**M14 child tables:** `experience_participants`, `experience_invitations`, `experience_invite_suggestions`, `experience_invite_declines` — CASCADE from `experiences(id)`.

Entity delete = `DELETE experiences` row (leader delete, last participant leave, transform, or purge cron).

#### `experience_participants` (M14)

| FK | References | ON DELETE | Verdict |
|----|------------|-----------|---------|
| `experience_id` | `experiences(id)` | **CASCADE** | Experience deleted → row gone |
| `user_id` | `profiles(id)` | **CASCADE** → **M14: SET NULL not used** | Account delete → **DELETE row** (no tombstone). Voluntary leave / leader remove → **DELETE row**. |

No `left_at` on experience participants — roster is current-only.

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
| `experiences` | `experience_participants`, invitations, suggestions (M14) | Memory rows (separate lifecycle) |
| `profiles` | `friendships`, `experiences` (M12) | Memory rows (tombstone + purge rules) |

**Leave memory (not delete):** `leave_memory` RPC sets `left_at`; participant row **kept** for shared history. Leader must transfer when required. `purge_memory_if_orphaned` runs when no active participants remain.

**Orphan safety net:** `purge_orphaned_memory_rows()` removes child rows whose `memory_id` was deleted outside CASCADE (manual DB edits only). Runs in **daily maintenance cron** — not in read RPCs. Normal deletes use CASCADE.

**Memory read RPCs:** Client-granted reads (`list_my_memories`, `get_memory`, `list_memory_participants`, `list_memory_media`) are **LANGUAGE sql, STABLE, SECURITY INVOKER, SELECT only** (`261620`). Internal `count_my_memories` remains DEFINER and is not client-granted. No purge, no transform inside reads (Postgres read-only transaction error 25006).

**Memory RLS (SELECT):** Policies on `memories`, `memory_participants`, and `memory_media` must **not** subquery `memory_participants` directly — that causes **42P17 infinite recursion** when INVOKER code reads those tables. Use `is_active_memory_participant(memory_id)` (SECURITY DEFINER helper) in all three SELECT policies.

**Transform before list (client):** Profile, memories search, and **Home** call `transform_my_due_experiences()` as an explicit **write RPC** before listing — not embedded in read RPCs. Home also calls `purge_my_stale_experiences()` before listing plans. **Home list visibility** uses row existence (`status = planned`), not `transform_at > now()` — a due plan stays visible until transform DELETEs it (optional UI: “Becoming a memory…”). Also: ended experience detail (`ensure_experience_transformed`), global cron every 15 min (transform + stale experience purge).

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
| `purge_stale_experiences()` | Cancelled plans past `purge_at` (daily cron + 15 min transform cron) |
| `purge_my_stale_experiences()` | Explicit write RPC (Home screen) before list — participant-scoped stale cancel purge |
| `transform_due_experiences()` | Planned → memory at `transform_at` |
| `purge_orphaned_memories()` | Memories with zero active participants |
| `purge_orphaned_memory_rows()` | Child rows whose memory row was removed outside CASCADE (cron only) |
| `maintain_orphaned_memories()` | Daily cron: child-row purge + memory orphan purge |
| `transform_my_due_experiences()` | Explicit write RPC (Home, Profile, memories screen) before list — not inside reads |
| `expire_stale_friend_requests()` | Pending requests > 60 days |
| `handle_profile_delete_memories()` | Leader transfer + tombstone + **immediate** orphan memory purge (+ Storage cleanup via memory DELETE trigger) |

### M14 migration requirements (locked)

1. **`experience_participants`** — accepted participants only; **hard DELETE on leave / leader remove / account delete** (no tombstone, no `left_at`).
2. **`experience_invitations`** + **`experience_invite_suggestions`** + **`experience_invite_declines`** (per-experience decline limit).
3. **`experiences.edit_info_policy`** — reuse `memory_permission_policy` enum.
4. **`experiences.created_by` / `organizer_id`** → **SET NULL** on profile delete; transfer `organizer_id` via RPC/trigger before leave.
5. **`handle_profile_delete_experiences`** — remove participation, transfer leader, purge pending invites; do not CASCADE-delete shared experience rows.
6. **`notifications`** table + insert from RPCs (see Milestone 14 — Notifications foundation).
7. **`notifications_muted`** on `experience_participants` and `memory_participants` (per-entity mute).
8. Extend **`transform_experience_to_memory`** — all accepted participants → memory; copy `edit_info_policy`.
9. Participant-based Home/list RLS and **`transform_my_due_experiences`** (not organizer-only).
10. ~~**Memory storage cleanup**~~ — **done in M13.5**; do not reintroduce client-only purge paths.

---

## Account deletion and shared memories

Deleting an account removes **personal footprint**, not **shared history** for everyone else.

When a user deletes their Kairos account:

| Removed | Preserved |
|---------|-----------|
| Profile, username, avatar | The shared memory others still share |
| Auth session, friendships | Other participants’ personal layers |
| Their participation on shared upcoming experiences (row deleted) | Shared memory when other **active** participants remain |
| Pending invites they sent/received (deleted/cancelled) | Shared photos (uploader → “Deleted user”) |

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

**Milestone 15 — Experience chat** — next after M14 completion (retention + UX polish).

---

# Milestone 14 — locked architecture (approved)

Do not implement outside this model without updating this section first.

## Goal

Turn solo private plans into **shared experiences**: friend invites, participant suggest flow, group transform to one memory, leadership transfer, and a **notification data foundation** (inbox/push in M19).

## Planning roster vs historical record

| | Experience (M14) | Memory (M13) |
|--|------------------|--------------|
| Meaning | Who plans to attend | What was lived |
| Leave | `DELETE` participant row | `SET left_at` |
| Leader remove | `DELETE` participant row | **Out of scope M14** |
| Account delete | `DELETE` participation | Tombstone `user_id → NULL` |
| Pending social state | `experience_invitations` | N/A |

This is intentional — do not unify into one participation pattern.

## Data model (conceptual)

```text
experiences
  + edit_info_policy  (all_participants | leader_only)
  organizer_id, status, starts_at, ends_at, …  (existing)

experience_participants
  experience_id, user_id
  joined_at
  notifications_muted  boolean DEFAULT false
  UNIQUE (experience_id, user_id)
  — accepted participants only; no pending rows
  — leadership derived from experiences.organizer_id (is_organizer in list RPC)

experience_invitations
  experience_id, invitee_id, invited_by, status (pending | accepted | declined)
  suggestion_id NULL  — set when created from approved suggestion
  created_at, responded_at

experience_invite_suggestions
  experience_id, suggested_by, suggested_user_id
  status (pending | approved | rejected)
  reviewed_by, reviewed_at

experience_invite_declines
  experience_id, invitee_id, decline_count, blocked_at
  — after 3 declines for same pair on same experience, block new invites

notifications  (M14 foundation)
  id, recipient_id, type, entity_type, entity_id
  actor_id NULL, payload jsonb, read_at NULL, created_at
```

**Rejected complexity:** Separate “declined invitations history” table beyond `decline_count` on blocks — one counter row per `(experience, invitee)` is enough.

## Invitations (locked)

| Rule | Detail |
|------|--------|
| When | On create **and** after create, only while `now() < starts_at` |
| Direct invite (private) | Invitee must be **leader’s friend** (accepted) |
| On create | Creator may batch-invite friends only |
| Accept | Creates `experience_participant` row |
| Decline | No participant row; increment per-experience decline count |
| After 3 declines | Block further invites to that user **for that experience only** |
| Cancelled experience | Expire/reject pending invites; no new invites until **revived** |
| Status | Only `planned` experiences accept invites |

Philosophy mirrors **friend requests**: pending state is temporary; declining does not create a permanent social block (except the per-experience 3-strike rule).

## Suggest invite flow (M14.0 — not deferred)

| Step | Rule |
|------|------|
| Who suggests | Any **accepted participant**, after creation, before `starts_at` |
| Suggested user | Must be **suggester’s friend** (accepted) — enables inviting non-leader friends after leader approval |
| Leader | Approves or rejects suggestion |
| If approved | System creates normal `experience_invitation`; invitee must still **accept** |
| Direct invite | Leader only; leader’s friends only (private) |

**Rejected complexity:** Participant sending invite without leader approval — always goes through suggestion when inviter is not leader or target is not leader’s friend.

## Edit permissions

Same enum as memories: `edit_info_policy` on `experiences`.

- **`all_participants`:** any accepted participant may edit title, description, location (via RPC + optional `expected_updated_at`).
- **`leader_only`:** only `organizer_id`.
- **Not governed by policy:** cancel, delete, revive, invite, suggest, remove participant, leadership transfer.

Default for new private plans: `all_participants` (match memory default).

## Leadership (experiences + memories)

UI label **Leader**; DB field `organizer_id` (experiences) / `leader_id` (memories).

| Case | Rule |
|------|------|
| Manual transfer | Leader picks successor (`transfer_experience_leadership` / existing memory RPC) |
| Voluntary leader leave | Must choose successor before leaving |
| Account delete / forced removal | Oldest active participant by `joined_at` |
| Revive | **Reviver becomes `organizer_id`** |

Invariant: leader must always be an active accepted participant.

## Cancel / delete / revive

See **Experience lifecycle (M14 — locked)** above.

On **cancel:** set `purge_at` from `ends_at + 24h`; clear pending invites.

On **revive:** require `starts_at > now()`; set `status = planned`; clear cancel fields; assign `organizer_id := reviver`.

On **delete:** hard-delete experience and all child rows for all participants.

## Transform to memory (M14 changes)

Extend existing transform RPC:

1. Require `status = planned` and `transform_at <= now()`.
2. Insert one `memory_participants` row per **accepted** experience participant; set `leader_id := organizer_id` at transform; copy `edit_info_policy`.
3. Set `leader_id := organizer_id at transform`; copy `edit_info_policy`.
4. `DELETE` experience (CASCADE invitations + participants).

Cron `transform_due_experiences` unchanged in spirit — scans all due planned experiences.

Client: `transform_my_due_experiences` and `ensure_experience_transformed` must include experiences where user is **any active participant**, not only organizer.

## Notifications foundation (M14)

**M14 ships:** `notifications` table + RPC inserts + `list_notifications` / `mark_notification_read` (minimal).

**M19 ships:** notification center UI, badges, push, email, preference matrix.

### Event catalog (recommended)

Insert a notification row when the event occurs **unless** the recipient has muted that experience/memory (see below). Skip notifying the actor about their own action.

#### Friendships (keep minimal — Profile already surfaces requests)

| Type | Recipients | M14? |
|------|------------|------|
| `friend_request_received` | Target user | Yes |
| `friend_request_accepted` | Original requester (if not auto-accept edge) | Yes |
| `friend_request_declined` | — | **No** — silent like today |
| `friend_removed` | — | **No** — optional M19 |

#### Experiences — invitations

| Type | Recipients | M14? |
|------|------------|------|
| `experience_invitation_received` | Invitee | Yes |
| `experience_invitation_accepted` | Leader + inviter (if different) | Yes |
| `experience_invitation_declined` | Leader (+ inviter if different) | Yes — low volume |
| `experience_invite_blocked` | Inviter | **No** — RPC returns clear error |

#### Experiences — suggestions

| Type | Recipients | M14? |
|------|------------|------|
| `experience_invite_suggestion_received` | Leader | Yes |
| `experience_invite_suggestion_approved` | Suggester | Yes |
| `experience_invite_suggestion_rejected` | Suggester | Yes |

#### Experiences — participation & lifecycle

| Type | Recipients | M14? |
|------|------------|------|
| `experience_participant_joined` | Leader + other participants (not joiner) | Yes |
| `experience_participant_left` | Leader + remaining (not leaver) | Yes |
| `experience_participant_removed` | Removed user | Yes |
| `experience_updated` | Non-muted participants except editor | Yes — **one type per edit RPC**, not per field |
| `experience_cancelled` | Non-muted participants except leader | Yes |
| `experience_revived` | Non-muted participants except reviver | Yes |
| `experience_deleted` | All participants before delete | Optional — row gone; brief in-app toast may suffice |

#### Memories

| Type | Recipients | M14? |
|------|------------|------|
| `memory_created` | All participants (experience transformed) | Yes — “Your plan is now a memory” |
| `memory_info_updated` | Non-muted participants except editor | Yes — if policy allows edit |
| `memory_photo_added` | — | **No M14** — too noisy; reconsider M19 with digest |
| `memory_photo_deleted` | — | **No** — unless moderation report later |

**Rejected complexity for M14:**

- Global notification preferences per type — use **per-experience / per-memory mute** only.
- Push / email delivery — M19.
- Notifying every photo upload in a memory.
- Separate notification threads or grouping UI — M19.

### Per-entity muting (locked)

WhatsApp-style: small groups want alerts; large public plans (M16+) may not.

```text
experience_participants.notifications_muted  DEFAULT false
memory_participants.notifications_muted        DEFAULT false
```

RPC `set_participant_notifications_muted(entity, muted)` — user mutes **their own** participation row only.

When enqueueing notifications for an experience/memory event, skip recipients where `notifications_muted = true` on that entity.

**Friend notifications:** not mutable via entity mute (no participation row) — volume is low.

**Default:** unmuted. UI copy: “Mute notifications for this plan/memory.”

### Inbox retention (M14 completion)

Keeps notification rows bounded before M19 inbox UI ships. Entity lifecycle purge (`purge_entity_notifications`, invitation resolve, experience end) is unchanged and runs in addition to these rules.

| Rule | Behavior |
|------|----------|
| **Cap** | Max **50** rows per `recipient_id`. After each insert, `trim_notification_inbox` deletes oldest **read** rows first; if still over cap, deletes oldest rows regardless of read state. |
| **Read TTL** | Rows with `read_at` older than **30 days** are deleted by `maintain_notification_retention`. |
| **Unread** | Preserved until cap trim or entity purge — no time-based delete for unread rows. |
| **Schedule** | Daily: `maintain_orphaned_memories()` calls `maintain_notification_retention()` (same cron as orphan memory purge). Per-insert trim runs inside `enqueue_notification`. |

Replaces the earlier 90-day `maintain_stale_notifications` helper (dropped in `261609`).

## Account deletion (M14)

| Domain | Behavior |
|--------|----------|
| Experiences | DELETE `experience_participant` rows; cancel pending invites; transfer leader; purge experience if no participants remain |
| Memories | M13 tombstone + leader transfer + orphan purge |

Add **`handle_profile_delete_experiences`** (mirror memory handler pattern).

## RPC inventory (M14 — implemented)

**Reads (INVOKER where RLS suffices):** `list_my_home_experiences`, `get_experience`, `list_incoming_experience_invitations`, `list_notifications`, `count_unread_notifications`, `mark_notification_read`, `list_my_memories`, `get_memory`, `list_memory_participants`, `list_memory_media`.

**Reads (DEFINER — cross-role gating):** `list_experience_participants`, `list_experience_invitations`, `list_experience_invite_suggestions`.

**Writes (SECURITY DEFINER):** `create_experience`, `update_experience`, `cancel_experience`, `delete_experience`, `revive_experience`, `leave_experience`, `remove_experience_participant`, `transfer_experience_leadership`, `send_experience_invitation`, `accept_experience_invitation`, `decline_experience_invitation`, `suggest_experience_invite`, `review_experience_invite_suggestion`, `set_experience_notifications_muted`, `set_memory_notifications_muted`, `purge_my_stale_experiences`, plus existing memory write RPCs.

**Internal / cron (not client-granted):** `transform_experience_to_memory`, `transform_due_experiences`, `transform_my_due_experiences`, `purge_stale_experiences`, profile-delete triggers, notification enqueue helpers, `trim_notification_inbox`, `maintain_notification_retention`.

## Explicitly out of M14

- Public experience discovery / open join (M16–M17)
- Experience chat (M15)
- Removing participants from **memories**
- Rejoin after leave (experiences or memories)
- Global user block list
- Push notifications and full inbox UX (M19)
- Permission settings UI beyond defaults + leader changing `edit_info_policy` (can be minimal)

## Implementation order (recommended)

1. Schema: participants, invitations, suggestions, blocks, `edit_info_policy`, FK fixes, profile-delete handler
2. Core RPCs: invite accept/decline, leave, leader remove, transfer, participant list, Home RLS
3. Cancel / delete / revive + multi-participant transform
4. Suggest-invite flow
5. Notifications table + enqueue in RPCs + mute flag
6. Client: create-with-invites, detail participants, invite inbox, leader actions, muted toggle
7. Manual validation checklist (M14)

---

### M13 / M13.5 reference (complete)

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

- [ ] Plan past `transform_at` stays on Home with “Becoming a memory…” until transform DELETEs the row; memory then appears on Profile
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

1. Enums: `memory_permission_policy` (`memory_edit_policy` / `memory_media_policy` naming in docs); ~~`memory_participant_role`~~ dropped in M14 cleanup (`261607`)
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

## Memories schema notes (M13/M14 audit)

| Column | Recommendation | Rationale |
|--------|----------------|-----------|
| `leader_id` | **Keep** | Current permission anchor for memory admin actions; transfer via RPC before leave/delete. |
| `organizer_id_at_transform` | **Keep** | Immutable audit snapshot of `experiences.organizer_id` at transform — distinct from `created_by` and from current `leader_id` after transfers. Never shown in UI. |
| `created_by` | **Keep** | Immutable audit of who created the source experience row. |
| `updated_by` / `updated_at` | **Keep** | Shared edit audit + optimistic concurrency on `update_memory_info`. |
| `source_experience_id` | **Keep** | Lineage UUID after experience row is deleted on transform; not joinable but useful for support/analytics. |
| ~~`memory_participants.role`~~ | **Removed (`261607`)** | Duplicated leadership state; derive via `leader_id` + `is_leader` in list RPC. |

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
- [x] Cancelled plan cannot be edited; no leader-only actions (delete, transfer, remove, invite)
- [x] Cancelled participants may leave without transferring leadership; reviver becomes leader on revive

**Transform boundary (M13)**

- [x] Plan past `transform_at` stays on Home until transform completes; detail/list show “Becoming a memory…” during the window
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

Kairos prefers **controlled RPCs** with business rules in SQL over broad table write grants. Supabase Security Advisor warnings should be triaged as follows — **full M14 inventory:** `docs/SECURITY.md`.

| Advisor item | Verdict | Notes |
|--------------|---------|-------|
| **SECURITY DEFINER** friendship RPCs | Expected — keep | Pair ordering, expiry, simultaneous-accept rules. Reads use INVOKER + RLS. |
| **SECURITY DEFINER** experience / memory write RPCs | Expected — keep | Dates, leadership columns, edit policies, lifecycle rules. No direct table writes for `authenticated`. |
| **SECURITY DEFINER** experience list read RPCs | Expected for now | Cross-role profile gating; deferred INVOKER migration. |
| **SECURITY DEFINER** one-arg membership helpers | Expected — keep | RLS/Storage recursion break; caller-only (`261610`). |
| **SECURITY DEFINER** triggers / cron | Expected — keep | Profile delete, storage cleanup, purge/transform jobs. |
| **`experiences_select_organizer` overlap** | Keep until measured | Redundant with participant policy but harmless; do not drop without EXPLAIN. |
| **`rls_auto_enable()`** | Supabase-internal noise | Not owned by this project. No action. |
| **Leaked password protection** | Accepted on Free plan | OTP-only auth — N/A; Pro+ feature only. See `docs/SECURITY.md`. |
| **`db lint` SQL errors** | Fix when found | e.g. `FOR UPDATE` + `DISTINCT` fixed in `261605`, `261608`. Run `npx supabase db lint --linked` after pushes. |

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
- **Remove** (not “delete as mistake”) removes a plan from the user’s Kairos; shared participant rules are in M14 (complete).
- Leadership SSOT: `organizer_id` / `leader_id` only — no participant `role` column.
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