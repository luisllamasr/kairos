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

Kairos has a social layer.

Users can:

- follow friends
- discover public experiences
- share memories
- get inspiration from others

Kairos does not try to replace Instagram or traditional social networks.

Social interaction should support real life, not replace it.

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
5. User profile (onboarding, username, avatar upload). ✓
6. Storage cleanup (pg_net trigger → Edge Function on account deletion). ✓

Current goal:

Build the first experience creation flow.

---

# Important notes for AI assistants

When helping with Kairos:

- Always understand the product before coding.
- Do not blindly generate files.
- Explain architectural decisions.
- Suggest improvements if something does not scale.
- Prioritize long-term quality.
- Ask before making major changes.

Kairos should feel like a professional product from day one.