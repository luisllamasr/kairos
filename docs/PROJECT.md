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

## 2. Adventures

Users can create adventures based on:

- city
- location
- participants
- budget
- duration
- mood
- preferences
- interests

Kairos helps users discover or generate personalized experiences.

The objective is to reduce the question:

"What should we do today?"

---

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

## 5. User-created experiences

Users can propose new experiences.

A proposed experience should contain:

- title
- description
- location
- category
- estimated cost
- recommended duration

Before appearing publicly, experiences should be validated.

Quality is more important than quantity.

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

---

# Current status

Phase:
Foundation complete.

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
| **12. Experiences** *(implemented — validate)* | Dated private plans; auto `transform_at`; cancel/remove | Cancel vs remove semantics; `purge_at = ends_at + 24h`; structured location | Manual complete, memories UI, participants |

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

## Phase C — Core domain (next)

Build **Create → Live → Remember** in order. Full milestone breakdown and product rules live in **Create → Live → Remember** below.

| Milestone | Scope |
|-----------|--------|
| **12. Experiences** | Dated private plans; auto `transform_at`; cancel/remove; Home = planned + cancelled-until-purge |
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
Identity ✓ → Friends ✓ → Experiences → Memories → Participants → Chat → Public → Opportunities
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
INSERT shared memory (snapshot)
INSERT memory_participants (personal layer per person)
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
| Home tab | Upcoming + cancelled-until-purge plans | Timeline (M13+) |
| Content | Title, description, location, schedule | Snapshot + photos + personal notes |
| Social | Invites, chat (later) | Shared core + personal participation |
| End state | Transform or purge | User can hide from timeline; shared core may remain for others |

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

**Memories:** do not treat `created_by` as displayed ownership. The shared memory represents the group moment. Operational history may snapshot organizer at transform time if needed; personal layers use `memory_participants`.

RLS and RPCs should check **`organizer_id`**, not `created_by`, for management actions.

---

## Visibility and opportunities

**Visibility (experiences only):**

- **`private`:** only organizer + invited participants know it exists.
- **`public`:** discoverable (M16+); join open or approval-required (M17).

**Opportunities** (external catalog, M18) are **not** experiences. Example: an airshow at the beach is an **Opportunity**; each group creates its own **Experience** via “Plan this.” One opportunity → many experiences → many memories.

---

## Shared memory model (M13)

One **shared memory core** per transformed experience — not one duplicate memory per participant.

```text
memories              — shared snapshot (title, when, where, …)
memory_participants   — per-user layer (timeline visibility, personal notes, contributed photos)
```

A 100-person public event → **one** memory core + 100 participant rows — not 100 copied memories.

---

## Account deletion and shared memories

Deleting an account removes **personal footprint**, not **shared history** for everyone else.

When a user deletes their Kairos account:

| Removed | Preserved |
|---------|-----------|
| Profile, username, avatar | The shared memory others still share |
| Auth session, friendships | Other participants’ personal layers |
| Their upcoming experiences | Memory record of the moment (for others) |

**Deleted participant display:**

- Not identifiable: no profile link, no username, no avatar.
- UI label: **“Deleted user”** (or equivalent i18n) — still shows that **someone** was part of the moment.
- Do **not** retain display-name snapshots that re-identify the person after deletion (GDPR-style erasure for personal data).

**Implementation notes (M13+):**

- `memory_participants.user_id` → `ON DELETE SET NULL` (or tombstone id with no PII).
- Photos uploaded by deleted user: show as from **“Deleted user”**; do not delete others’ memory unless all participants are gone (policy: shared memory persists).
- **`created_by`** on experience/memory: FK may SET NULL on delete; field is audit-only, never shown as identity.
- **`organizer_id`:** if organizer deletes account, transfer rules (M14) or co-participant becomes organizer before deletion — edge case for later; solo memory unaffected.

**Orphaned memories (M13):** while some participants remain active, deleted users appear as **“Deleted user.”** When **all** participants have deleted their accounts, the shared memory has no remaining audience — **delete the memory automatically** rather than keeping orphaned data forever.

This matches: *delete my footprint, don’t rewrite our shared past — but don’t keep ghosts nobody can see.*

---

## Experience chat (M15 — architecture only)

- Chat is **scoped to one experience**, participants only — not DMs.
- Active during live window; frozen then purged with experience.
- Does not become a general messaging product.

---

## Anti-drift (core domain)

Do **not** add during Experiences/Memories milestones:

- Home feed of friends’ activity
- Recommendations or trending
- Undated experiences (use future Ideas)
- Manual “complete” as primary UX
- Permanent archive of completed experiences
- General DM inbox

---

Current goal:

**Milestone 12 — Experiences** (dated private plans; Home = upcoming planned + cancelled-until-purge). Apply migration `20260624100000_experiences_foundation.sql`, then validate below. Product rules: **Create → Live → Remember** section above.

---

# Milestone 12 — manual validation checklist

Run after applying migration `20260624100000_experiences_foundation.sql` to linked Supabase.

**Create & list**

- [ ] Home shows empty state with **New plan** CTA
- [ ] Create plan with title, dates (date/time picker), optional location/description → lands on detail
- [ ] Plan appears on Home with formatted date range

**Edit**

- [ ] Edit upcoming plan → changes persist on detail and Home
- [ ] End time must be after start time (validation message if not)

**Cancel (purge_at = ends_at + 24h)**

- [ ] Cancel upcoming plan → status **Cancelled** on detail; still on Home
- [ ] Cancel a plan scheduled far in the future → remains visible until **ends_at + 24 hours**, not “24h after cancel tap”
- [ ] After purge window passes (or simulate via DB) → plan disappears from Home

**Delete**

- [ ] Remove upcoming plan → confirm copy says it leaves your Kairos (not “created by mistake”)
- [ ] Remove cancelled plan → disappears immediately from Home and detail
- [ ] Cancelled plan cannot be edited; remove is still available before purge

**Transform boundary (no M13 yet)**

- [ ] Plan past `transform_at` drops off Home; detail shows ended notice
- [ ] No manual **Complete** button anywhere

**Regression**

- [ ] Search, Profile, friends, switch account, sign out unchanged

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

# Important notes for AI assistants

When helping with Kairos:

- Always understand the product before coding.
- Read **Create → Live → Remember** for core domain rules (experiences, memories, transform, deletion).
- Follow the **Roadmap** section — social foundation is complete; core domain is experiences and memories.
- Do not build feeds, recommendations, suggested users, or Discover content during early core milestones.
- Do not conflate global user search (Search tab) with the experience participant picker (friends only, later).
- Experiences require **starts_at and ends_at**; undated items are future Ideas, not experiences.
- Experiences transform to memories **automatically** at `transform_at` — no task-manager “complete” UX.
- Do not blindly generate files.
- Explain architectural decisions.
- Suggest improvements if something does not scale.
- Prioritize long-term quality.
- Ask before making major changes.

Kairos should feel like a professional product from day one.