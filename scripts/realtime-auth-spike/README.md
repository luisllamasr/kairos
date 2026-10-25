# Realtime authorization regression check (dev project)

Verifies the applied migrations `20260803140000` (private experience-chat channels +
`realtime.messages` policies) and `20260803150000` (reaction events as trigger-sent private
Broadcast, reactions table out of the Realtime publication) against the linked Kairos **dev**
project. Not part of the
app; ESLint ignores `scripts/**`. (It started as the spike that chose this architecture.)

- SQL runs through `npx supabase db query --linked` (the CLI login `db push` already uses).
  No service-role key and no database password are needed.
- It never creates or drops policies: it first asserts the migration is applied (3 policies,
  the parser function, history row, no extra policies) and aborts otherwise.
- It creates four throwaway users and three experiences (four in `reactions` mode) with SQL (tagged with a run id) and
  always removes them in teardown. Existing application data is never read or modified.
- Teardown runs once on normal completion, a failed check, a timeout, SIGINT/SIGTERM and an
  uncaught error. If it fails, the script says so; remove the leftovers by pattern
  (experiences titled `SPIKE <runId>`, users `spike-*-<runId>@kairos-spike.test`).

```
node scripts/realtime-auth-spike/run.mjs phase1   # needs "Allow public access to channels" ON
node scripts/realtime-auth-spike/run.mjs phase2   # setting OFF (turn it OFF while it polls, or already OFF)
node scripts/realtime-auth-spike/run.mjs reactions pre|post   # reaction events; works with the setting OFF
```

## Phase 1 (public access ON)

SQL evaluation of `experience_user_can` under the `authenticated` role, the private chat
channel (messages binding), the join race and the refetch
mitigation, non-participant / cancelled / missing-experience / malformed topics, signals
read/write incl. `leader_only`, public-vs-private isolation, presence not usable, and
revocation on token refresh.

## Phase 2 (public access OFF)

Checks that public joins are rejected (`PrivateOnly`) while private channels keep working.

- **Setting still ON:** the script prints `>>> NOW: ...` and polls (up to 10 min) until you
  turn the setting OFF, then runs the checks. Check 4.1 observes the ON -> OFF transition
  (the existing public subscriber is disconnected).
- **Setting already OFF (re-run):** the public watcher cannot subscribe, so no ON -> OFF
  transition can be observed and **4.1 is reported as `SKIP`** (not a pass, not a failure).
  Every authorization assertion stays mandatory: public chat/signals joins rejected (4.2,
  4.6), private channel without a policy rejected (4.4), private chat delivery (4.3, 4.3b,
  4.3f) and private typing signals delivered (4.5).

## Reactions mode (`reactions pre|post`)

Covers migration `20260803150000`. Everything is on **private** channels, so it works with
"Allow public access to channels" OFF. Carol is an outsider to experience E1 but a legitimate
participant of her own experience E4: the starting point of the original leak (a
`postgres_changes` binding is table-level and client-chosen, so any participant of any
experience could bind the reactions table). The script checks, read-only and before creating
anything, that the database really is in the stated state (`pre`: table in the publication, no
trigger; `post`: table out of the publication, trigger present) and refuses to start otherwise.

- **`pre` (before the migration):** `R0` reproduces the leak (the outsider receives the reaction
  `DELETE` with `message_id` + `user_id`; a hard row whose PASS means "reproduced"); `R0b`
  outsider gets no reaction INSERT/UPDATE; `R2` outsider cannot join E1's chat topic; `R0c`
  and `R8` informational/RLS rows.
- **`post` (after it):** `R1` participants receive `reaction_changed` for add, emoji change
  and removal with only `message_id` (+ the broadcast row `id`); `R2` outsider cannot join;
  `R3` outsider on her own topics gets no reaction event, even with the unfiltered table
  binding; `R4` a reaction in another experience reaches nobody on E1's topic; `R5` a client
  cannot forge `reaction_changed`; `R6` deleting a message that has a reaction works and the
  cascaded removal sends nothing extra; `R7` catalog check of the trigger function (owner,
  `SECURITY DEFINER`, empty `search_path`, no EXECUTE for `PUBLIC`/`anon`/`authenticated`),
  the trigger definition and publication membership.
- **Both:** `R8a` (hard) an outsider's unfiltered messages binding receives no message INSERT;
  `R8b` (informational) it receives message `DELETE` events carrying only the message `id`,
  while the app's filtered binding received none for a participant. This is pre-existing
  behavior, not changed by migration `20260803150000`.

## Private chat check (`1.3` in phase 1, `4.3` in phase 2)

`postgres_changes` delivers nothing until the server-side change feed is ready, and
`SUBSCRIBED` can precede it. The check therefore has three separate parts:

| Row | Kind | What it records |
|-----|------|-----------------|
| `<id>i` | informational (never fails the run) | a message sent right after `SUBSCRIBED`: delivered or not, plus when the `ok: Subscribed to PostgreSQL` readiness event arrived relative to `SUBSCRIBED` and to the send |
| `<id>` | **hard** | after the readiness event, a new message is delivered through Realtime |
| `<id>f` | **hard** | a database refetch (`list_experience_messages`, same RLS as the app) returns **both** messages |

The readiness event is a useful signal, not a guarantee. A missed immediate event with both
messages present in the refetch is a timing/reliability issue, not an authorization failure.
`4.3b` (delivery on the settled channel) stays a hard assertion.

## Exit status

Any failed hard assertion gives a non-zero exit code (the run still tears down and prints the
full summary). Informational rows never fail the run and `SKIP` rows are not counted.

## Status and limits (dev project)

- `phase2` passed live: run 1 (Oct 24, 2026) flipped the setting ON -> OFF while polling and
  passed the transition check (4.1) and the public/private checks, except the original strict
  immediate-send check (since redesigned, see above); run 2 (Oct 25, 2026) passed with the
  setting already OFF, with 4.1 skipped.
- `reactions pre` (before the migration) reproduced the leak, and `reactions post` (after
  applying `20260803150000` to the dev project, Oct 25, 2026) passed every check; `phase2`
  was re-run afterwards and passed (4.1 skipped, setting already OFF). Teardown completed,
  residue was 0 and row counts matched the baseline each time.
- `phase1` has **not** been re-run live since the `1.3` redesign (it needs the setting ON);
  its old reaction checks (`1.3r`/`1.3c`/`1.3d`) were removed in favor of `reactions` mode.
- Single runs on the dev project with throwaway users. This is a regression check of the
  Realtime authorization layer, **not a complete security audit**.
- **Keep "Allow public access to channels" OFF on the dev project.** Do not turn it back ON
  for routine work; a future phase 1 run would need a deliberate, temporary switch.
- **Reaction `DELETE` leak:** fixed on the **dev project** by `20260803150000`. It has **not**
  been applied to production, which has not been audited.
- Message `DELETE` events (only the message `id`) still reach an outsider's unfiltered binding;
  pre-existing, documented, not changed.

Results and conclusions: `docs/SECURITY.md` → Realtime authorization.
