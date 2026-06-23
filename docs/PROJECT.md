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

An experience represents a real moment that someone can live:

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

After completing an experience, users can create a memory.

A memory can contain:

- photos
- participants
- date
- location
- description
- personal notes

Memories work like a personal timeline of meaningful moments.

They are not designed around likes or popularity.

---

## 4. Community

Kairos has a social layer — but it is not the product center.

Users can eventually follow people, discover public experiences, and get inspiration from others.

The social graph exists to support real life: finding people, planning together, remembering shared moments.

Kairos does not try to replace Instagram or traditional social networks.

**Anti-drift rule:** Do not build feeds, recommendations, suggested users, DMs, or profile bloat unless they directly serve experiences and memories. When user discovery, public profiles, and follow relationships exist, treat the **social foundation as complete** and return focus to the core domain.

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

---

# Roadmap

Build order is intentional. Do not skip ahead into full social-network features or shared experiences before the foundations below exist.

## Phase A — Identity (complete)

Authentication, onboarding, profiles, avatars, account deletion, multi-account switching, incomplete signup cleanup.

## Phase B — Social foundation (in progress)

Minimal graph-building before shared experiences. Purpose: **search → view profile → follow** — not a feed, not content discovery.

| Milestone | Scope | In | Out |
|-----------|--------|-----|-----|
| **10. Social user discovery** ✓ | Search tab, global `@username` search, public profile screen, RLS/RPC foundation | Prefix search, public profile (avatar, display name, username), incomplete profiles hidden from discovery | Feed, recommendations, suggested users, Discover content, participant picker, bio/stats, DMs |
| **11. Follow relationships** *(next)* | Follow/unfollow on public profile; optional thin following list | Asymmetric follow, RLS on `follows` table | Home feed, follower counts as product focus, mutual friends complexity |

**Navigation (milestone 10):** Third tab **Search** — global people discovery. Not buried in Profile (Profile = identity and account only).

**Two search concepts — do not merge:**

- **Global user search** (Search tab): find anyone on Kairos; social graph building.
- **Participant picker** (later, inside experience creation): choose from people you already follow — not open search.

**Incomplete profiles:** Users who have not finished onboarding cannot enter the app. Their profiles are never discoverable by others (RLS + RPC). Only the owner reads their own incomplete row for routing.

When milestones 10 and 11 are done, **stop expanding the social layer** unless a core-domain feature requires it.

## Phase C — Core domain (next after social foundation)

| Milestone | Scope |
|-----------|--------|
| **12. Experiences** | Create and manage experiences; `visibility` from day one (private first) |
| **13. Memories** | Photos and personal timeline linked to experiences |
| **14. Shared experiences** | Participants — picker draws from **follows**, not global search |

## Phase D — Community inspiration (later)

Public experiences, Discover tab content (experiences, ideas), optional feed of public content from people you follow. Follows and visibility enums plug in here — not before core domain exists.

```text
Identity ✓ → Search + public profile → Follows → Experiences → Memories → Participants → Discover/feed
```

---

Current goal:

**Milestone 11 — Follow relationships** (follow/unfollow on public profile).

---

# Important notes for AI assistants

When helping with Kairos:

- Always understand the product before coding.
- Follow the **Roadmap** section — social foundation is small and bounded; core domain is experiences and memories.
- Do not build feeds, recommendations, suggested users, or Discover content during milestones 10–11.
- Do not conflate global user search (Search tab) with the experience participant picker (follows only, later).
- Do not blindly generate files.
- Explain architectural decisions.
- Suggest improvements if something does not scale.
- Prioritize long-term quality.
- Ask before making major changes.

Kairos should feel like a professional product from day one.