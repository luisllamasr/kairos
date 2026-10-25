/**
 * Realtime Authorization regression check -- runs against the linked Kairos DEV
 * project and validates the REAL migration 20260803140000 (it never creates or
 * drops policies itself). See README.md in this folder. Plain Node (>=22 for
 * native WebSocket); uses the already-installed @supabase/supabase-js.
 *
 * SQL goes through `npx supabase db query --linked` (the CLI login the project
 * already uses for `db push`), so no service-role key and no DB password are
 * needed. Throwaway test users/experiences are created with SQL, tagged with a
 * run id, and always removed in teardown. Existing application data is never
 * read or modified.
 *
 *   node scripts/realtime-auth-spike/run.mjs phase1   # "Allow public access" ON  (default)
 *   node scripts/realtime-auth-spike/run.mjs phase2   # run while you flip public access OFF
 *   node scripts/realtime-auth-spike/run.mjs reactions pre|post
 *       # reaction-event authorization (migration 20260803150000). Works with public access OFF.
 *       # `pre` = before that migration (reproduces the DELETE leak); `post` = after it.
 *       # The script verifies the database really is in the stated state before creating anything.
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const mode = process.argv[2] ?? 'phase1';
const expectedState = process.argv[3] ?? null; // 'pre' | 'post' (reactions mode only)

function die(message) {
  console.error(`\nABORT: ${message}\n`);
  process.exit(1);
}

// URL + anon key are the app's public client config (already shipped in the bundle).
function readEnv(name) {
  const text = readFileSync(join(repoRoot, '.env'), 'utf8');
  const match = text.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}
const URL_ = readEnv('EXPO_PUBLIC_SUPABASE_URL');
const ANON = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (!URL_ || !ANON) die('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing in .env');

const runId = Date.now().toString(36);
const password = `Sp!ke-${randomBytes(12).toString('hex')}`; // throwaway; never printed
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function record(id, question, expected, actual, ok) {
  results.push({ id, question, expected, actual, result: ok ? 'PASS' : 'FAIL/INFO' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  expected: ${expected}  |  actual: ${actual}`);
  // Informational rows are recorded with ok=true, so ok=false is always a real failed assertion.
  // Only the exit status is affected: the run continues, tears down, and prints the full summary.
  if (!ok) process.exitCode = 1;
}

/** A check that cannot apply to this run (never a failure, never a pass): shown as SKIP in the summary. */
function recordSkipped(id, question, reason) {
  results.push({ id, question, expected: 'skipped / not applicable', actual: reason, result: 'SKIP' });
  console.log(`SKIP  ${id}  not applicable  |  ${reason}`);
}

async function waitFor(predicate, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return true;
    await sleep(100);
  }
  return predicate();
}

// ---------------------------------------------------------------------------
// SQL via the linked project's CLI login
// ---------------------------------------------------------------------------
function runSql(sqlText, { quiet = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kairos-spike-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sqlText);
  try {
    const r = spawnSync(
      'npx',
      ['--yes', 'supabase@latest', 'db', 'query', '--linked', '-f', file, '-o', 'json'],
      { cwd: repoRoot, encoding: 'utf8', shell: true, maxBuffer: 20 * 1024 * 1024 },
    );
    const out = r.stdout ?? '';
    const start = out.indexOf('{');
    let parsed = null;
    try {
      parsed = start >= 0 ? JSON.parse(out.slice(start)) : null;
    } catch {
      parsed = null;
    }
    if (r.status !== 0 || !parsed) {
      const detail = `${out}\n${r.stderr ?? ''}`.replace(password, '***');
      if (!quiet) console.error(detail);
      throw new Error(`SQL failed (exit ${r.status})`);
    }
    return parsed.rows ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
function openChannel(
  client,
  topic,
  {
    isPrivate = false,
    experienceId = null,
    ack = false,
    withReactions = false,
    withReactionBroadcast = false,
    withMessagesUnfiltered = false,
    withPresence = false,
  } = {},
) {
  const log = {
    topic,
    isPrivate,
    statuses: [],
    inserts: [],
    messageEvents: [],
    unfilteredMessageEvents: [],
    reactions: [],
    reactionEvents: [],
    reactionBroadcasts: [],
    broadcasts: [],
    system: [],
    pgReadyAt: null,
  };
  const channel = client.channel(topic, {
    config: {
      private: isPrivate,
      broadcast: { ack, self: false },
      ...(withPresence ? { presence: { key: runId } } : {}),
    },
  });
  channel.on('system', {}, (payload) => {
    log.system.push(`${payload.status ?? ''}:${payload.message ?? ''}`);
    // "ok: Subscribed to PostgreSQL" = the postgres_changes binding is registered server-side.
    // A useful readiness signal, not an absolute guarantee against races.
    if (log.pgReadyAt === null && payload.status === 'ok' && /PostgreSQL/i.test(payload.message ?? '')) {
      log.pgReadyAt = Date.now();
    }
  });
  if (withPresence) channel.on('presence', { event: 'sync' }, () => undefined);
  if (withReactionBroadcast) {
    // The app's listener after migration 20260803150000: database-sent Broadcast, no table binding.
    channel.on('broadcast', { event: 'reaction_changed' }, (payload) => log.reactionBroadcasts.push(payload.payload));
  }
  if (withMessagesUnfiltered) {
    // An UNFILTERED messages binding on whatever topic this client is allowed to join (the same
    // kind of client-chosen, table-level binding an attacker could add).
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'experience_messages' }, (payload) => {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      log.unfilteredMessageEvents.push({ type: payload.eventType, keys: Object.keys(row ?? {}) });
    });
  }
  if (withReactions) {
    // Unfiltered reactions table binding. Before migration 20260803150000 this is exactly what the
    // app did (table RLS did the scoping); it is also what an attacker can ask for on any topic
    // they are allowed to join.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'experience_message_reactions' },
      (payload) => {
        const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
        log.reactions.push(row?.emoji ?? 'removed');
        log.reactionEvents.push({
          type: payload.eventType,
          keys: Object.keys(row ?? {}),
          message_id: row?.message_id,
          user_id: row?.user_id,
        });
      },
    );
  }
  if (experienceId) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'experience_messages',
        filter: `experience_id=eq.${experienceId}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT') log.inserts.push(payload.new?.body);
        const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
        log.messageEvents.push({ type: payload.eventType, keys: Object.keys(row ?? {}) });
      },
    );
  }
  channel.on('broadcast', { event: 'typing' }, (payload) => log.broadcasts.push(payload.payload));

  const settled = new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: 'NO_STATUS_IN_10S' }), 10000);
    channel.subscribe((status, err) => {
      log.statuses.push({ at: Date.now(), status, err: err?.message });
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        clearTimeout(timer);
        resolve({ status, err: err?.message });
      }
    });
  });
  return { channel, log, settled };
}

const closeChannel = (client, handle) => client.removeChannel(handle.channel);
const describe = (s) => (s.err ? `${s.status} (${s.err})` : s.status);

// ---------------------------------------------------------------------------
// Fixture: users, experiences (SQL), sign-in (anon key, password grant)
// ---------------------------------------------------------------------------
const names = ['alice', 'bob', 'carol', 'dave'];
const people = Object.fromEntries(
  names.map((n) => [n, { id: randomUUID(), email: `spike-${n}-${runId}@kairos-spike.test` }]),
);
const ctx = {
  E1: randomUUID(),
  E2: randomUUID(),
  E3: randomUUID(),
  GONE: randomUUID(),
  // reactions mode only: an experience carol legitimately belongs to (alice + carol), so she has a
  // private topic she is allowed to join -- the starting point of the reaction DELETE exploit.
  ...(mode === 'reactions' ? { E4: randomUUID() } : {}),
};
const tag = `SPIKE ${runId}`;

function setupSql() {
  const userRows = names
    .map((n) => {
      const p = people[n];
      return `('${p.id}', '${p.email}')`;
    })
    .join(',\n');

  const exp = (id, chatPolicy, status) =>
    `('${id}', '${people.alice.id}', '${people.alice.id}', '${tag}', now() + interval '1 day', now() + interval '2 days', now() + interval '3 days', '${status}', ${
      status === 'cancelled' ? 'now()' : 'null'
    }, '${chatPolicy}')`;

  const members = (expId, who) =>
    who.map((n) => `('${expId}', '${people[n].id}')`).join(', ');

  return `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('${password}', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
from (values ${userRows}) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u where u.email like '%-${runId}@kairos-spike.test';

insert into public.experiences (id, created_by, organizer_id, title, starts_at, ends_at, transform_at, status, cancelled_at, chat_policy)
values
  ${exp(ctx.E1, 'all_participants', 'planned')},
  ${exp(ctx.E2, 'leader_only', 'planned')},
  ${exp(ctx.E3, 'all_participants', 'cancelled')}${ctx.E4 ? `,\n  ${exp(ctx.E4, 'all_participants', 'planned')}` : ''};

insert into public.experience_participants (experience_id, user_id) values
  ${members(ctx.E1, ['alice', 'bob'])},
  ${members(ctx.E2, ['alice', 'dave'])},
  ${members(ctx.E3, ['alice', 'bob'])}${ctx.E4 ? `,\n  ${members(ctx.E4, ['alice', 'carol'])}` : ''};
`;
}

function teardownSql() {
  const ids = Object.values(ctx)
    .map((id) => `'${id}'`)
    .join(', ');
  const userIds = names.map((n) => `'${people[n].id}'`).join(', ');
  return `
delete from public.experiences where id in (${ids});
delete from auth.users where id in (${userIds});
`;
}

const EXPECTED_POLICIES = [
  ['experience_chat_channel_read', 'SELECT'],
  ['experience_chat_signals_read', 'SELECT'],
  ['experience_chat_signals_write', 'INSERT'],
];

/** The migration must already be applied; this script only verifies it. */
function assertMigrationApplied() {
  const rows = runSql(`
select policyname::text as name, cmd::text as cmd from pg_policies where schemaname = 'realtime'
union all
select 'fn:' || proname::text, 'FUNCTION' from pg_proc where proname = 'experience_id_from_realtime_topic'
union all
select 'history:' || version, 'MIGRATION' from supabase_migrations.schema_migrations where version = '20260803140000';`);
  const have = new Set(rows.map((r) => `${r.name}|${r.cmd}`));
  const missing = [
    ...EXPECTED_POLICIES.map(([n, c]) => `${n}|${c}`),
    'fn:experience_id_from_realtime_topic|FUNCTION',
    'history:20260803140000|MIGRATION',
  ].filter((key) => !have.has(key));
  const extra = rows.filter((r) => r.cmd !== 'FUNCTION' && r.cmd !== 'MIGRATION' && !EXPECTED_POLICIES.some(([n]) => n === r.name));
  record('pre.migration', 'Migration 20260803140000 applied (3 policies + parser + history row)', 'present', missing.length ? `MISSING ${missing.join(', ')}` : 'present', missing.length === 0);
  record('pre.noExtraPolicies', 'No other policies on realtime.messages', 'none', extra.length ? extra.map((r) => r.name).join(', ') : 'none', extra.length === 0);
  if (missing.length) die('Apply the migration first (npx supabase db push).');
}

async function signInAll() {
  for (const n of names) {
    const client = createClient(URL_, ANON, clientOpts);
    const { error } = await client.auth.signInWithPassword({ email: people[n].email, password });
    if (error) throw new Error(`signIn(${n}): ${error.message}`);
    people[n].client = client;
  }
}

async function sendMessage(from, experienceId, body) {
  const { data, error } = await people[from].client.rpc('send_experience_message', {
    p_experience_id: experienceId,
    p_body: body,
  });
  if (error) throw new Error(`send_experience_message: ${error.message}`);
  return data;
}

async function react(from, messageId, emoji) {
  const { error } = await people[from].client.rpc('set_experience_message_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) throw new Error(`set_experience_message_reaction: ${error.message}`);
}

const sendTyping = (handle, label) =>
  handle.channel.send({ type: 'broadcast', event: 'typing', payload: { from: label } });

/** When the postgres_changes readiness event arrived, relative to SUBSCRIBED and to a send (negative = before it). */
function readinessTiming(log, sentAt) {
  if (log.pgReadyAt === null) return 'pgReady=never';
  const subscribedAt = log.statuses.find((s) => s.status === 'SUBSCRIBED')?.at;
  const parts = [];
  if (subscribedAt) parts.push(`${log.pgReadyAt - subscribedAt}ms after SUBSCRIBED`);
  if (sentAt) parts.push(`${log.pgReadyAt - sentAt}ms after the immediate send`);
  return `pgReady ${parts.join(', ')}`;
}

/**
 * Private chat channel delivery as three separate observations (bob's private channel on E1):
 *  <p>i  INFORMATIONAL  message sent straight after SUBSCRIBED (the known cold-join race; never fails the run)
 *  <p>   HARD           after the postgres_changes readiness event, a new message is delivered
 *  <p>f  HARD           a database refetch (list_experience_messages, as bob) returns BOTH messages
 * Returns the still-open handle; the caller closes it.
 */
async function checkPrivateChatDelivery(idPrefix, label) {
  const { E1 } = ctx;
  const h = openChannel(people.bob.client, `experience-chat:${E1}`, { isPrivate: true, experienceId: E1 });
  const s = await h.settled;

  // (a) Immediately after SUBSCRIBED: no readiness wait, on purpose.
  const readyBeforeSend = h.log.pgReadyAt !== null;
  const immediateBody = `${idPrefix}-immediate-${runId}`;
  const immediateSentAt = Date.now();
  await sendMessage('alice', E1, immediateBody);
  const immediateWithin4s = await waitFor(() => h.log.inserts.includes(immediateBody), 4000);

  // (b) Wait for the readiness signal, then send. Still sent if it never arrives (the row then fails).
  const ready = s.status === 'SUBSCRIBED' && (await waitFor(() => h.log.pgReadyAt !== null, 10000));
  const gatedBody = `${idPrefix}-gated-${runId}`;
  await sendMessage('alice', E1, gatedBody);
  const gatedGot = await waitFor(() => h.log.inserts.includes(gatedBody), 8000);
  const immediateByEnd = h.log.inserts.includes(immediateBody);

  record(
    `${idPrefix}i`,
    `${label}: message sent immediately after SUBSCRIBED (info)`,
    'informational',
    `deliveredWithin4s=${immediateWithin4s}, deliveredByEnd=${immediateByEnd}, pgReadyBeforeSend=${readyBeforeSend}, ${readinessTiming(h.log, immediateSentAt)}`,
    true,
  );
  record(
    idPrefix,
    `${label}: message sent after the postgres_changes readiness event`,
    'SUBSCRIBED + readiness event + delivered',
    `${describe(s)}, ready=${ready}, delivered=${gatedGot}, ${readinessTiming(h.log, immediateSentAt)}, system=[${h.log.system.join(' | ')}]`,
    s.status === 'SUBSCRIBED' && ready && gatedGot,
  );

  // (c) Recovery path, independent of realtime: the committed rows are readable by the participant.
  const { data, error } = await people.bob.client.rpc('list_experience_messages', { p_experience_id: E1, p_before: null, p_limit: 50 });
  const bodies = Array.isArray(data) ? data.map((m) => m.body) : [];
  const hasImmediate = bodies.includes(immediateBody);
  const hasGated = bodies.includes(gatedBody);
  record(
    `${idPrefix}f`,
    `${label}: database refetch returns both the immediate and the readiness-gated message`,
    'both present',
    error ? `rpc error: ${error.message}` : `immediate=${hasImmediate}, gated=${hasGated}`,
    !error && hasImmediate && hasGated,
  );
  return h;
}

// ---------------------------------------------------------------------------
// Direct SQL verification of the policy expressions under the authenticated role
// ---------------------------------------------------------------------------
function directSqlMatrix() {
  const cases = [
    ['bob', 'E1', 'experience-chat', 'chat_read', true],
    ['carol', 'E1', 'experience-chat', 'chat_read', false],
    ['bob', 'E3', 'experience-chat', 'chat_read', true], // cancelled still readable
    ['bob', 'GONE', 'experience-chat', 'chat_read', false], // experience does not exist
    ['alice', 'E1', 'experience-chat-signals', 'chat_write', true],
    ['bob', 'E1', 'experience-chat-signals', 'chat_write', true],
    ['dave', 'E2', 'experience-chat-signals', 'chat_read', true],
    ['dave', 'E2', 'experience-chat-signals', 'chat_write', false], // leader_only, not organizer
    ['alice', 'E2', 'experience-chat-signals', 'chat_write', true],
    ['carol', 'E1', 'experience-chat-signals', 'chat_read', false],
  ];
  const lines = ['create temp table spike_r (label text, got boolean);', 'grant all on spike_r to authenticated;'];
  for (const [who, exp, prefix, cap] of cases) {
    const topic = `${prefix}:${ctx[exp]}`;
    lines.push(
      'begin;',
      'set local role authenticated;',
      `select set_config('request.jwt.claims', '{"sub":"${people[who].id}","role":"authenticated"}', true);`,
      `select set_config('request.jwt.claim.sub', '${people[who].id}', true);`,
      `select set_config('realtime.topic', '${topic}', true);`,
      `insert into spike_r select '${who}|${exp}|${prefix}|${cap}', public.experience_user_can(public.experience_id_from_realtime_topic('${prefix}', (select realtime.topic())), '${cap}');`,
      'commit;',
    );
  }
  // malformed topics must yield NULL / false, never raise
  for (const topic of [
    'experience-chat-signals:not-a-uuid',
    `experience-chat-signals:${ctx.E1}x`,
    `other:${ctx.E1}`,
    `experience-chat-signals:${ctx.E1.toUpperCase()}`,
  ]) {
    lines.push(
      'begin;',
      'set local role authenticated;',
      `select set_config('request.jwt.claims', '{"sub":"${people.alice.id}","role":"authenticated"}', true);`,
      `select set_config('request.jwt.claim.sub', '${people.alice.id}', true);`,
      `select set_config('realtime.topic', '${topic}', true);`,
      `insert into spike_r select 'alice|malformed|${topic.slice(0, 40)}', coalesce(public.experience_user_can(public.experience_id_from_realtime_topic('experience-chat-signals', (select realtime.topic())), 'chat_read'), false);`,
      'commit;',
    );
  }
  lines.push('select label, got from spike_r;');
  return { sql: lines.join('\n'), cases };
}

function verifyDirectSql() {
  const { sql, cases } = directSqlMatrix();
  const rows = runSql(sql);
  const byLabel = new Map(rows.map((r) => [r.label, r.got]));
  for (const [who, exp, prefix, cap, expected] of cases) {
    const got = byLabel.get(`${who}|${exp}|${prefix}|${cap}`);
    record(`0.${who}.${exp}.${prefix.replace('experience-', '')}.${cap}`, 'SQL: experience_user_can under authenticated + JWT sub', String(expected), String(got), got === expected);
  }
  const malformed = rows.filter((r) => r.label.startsWith('alice|malformed'));
  record('0.malformed', 'SQL: malformed topics deny without raising', 'all false', malformed.map((r) => r.got).join(','), malformed.length === 4 && malformed.every((r) => r.got === false));
}

// ---------------------------------------------------------------------------
// Phase 1 -- "Allow public access to channels" ENABLED (Supabase default)
// ---------------------------------------------------------------------------
async function phase1() {
  const { E1, E2, E3, GONE } = ctx;
  const { alice, bob, carol, dave } = people;

  // Q1 baseline: the existing public postgres_changes channel.
  {
    const bobPub = openChannel(bob.client, `experience-chat:${E1}`, { experienceId: E1 });
    const carolPub = openChannel(carol.client, `experience-chat:${E1}`, { experienceId: E1 });
    const [b, c] = await Promise.all([bobPub.settled, carolPub.settled]);
    // First message goes out IMMEDIATELY after SUBSCRIBED: on a cold tenant/first join the
    // postgres_changes binding may not be ready yet. Informational -- the app refetches on
    // SUBSCRIBED for exactly this reason (see 1.3refetch).
    await sendMessage('alice', E1, `baseline-immediate-${runId}`);
    const immediateGot = await waitFor(() => bobPub.log.inserts.includes(`baseline-immediate-${runId}`), 4000);
    // Second message after the channel has settled: this one must always be delivered.
    await sleep(2000);
    await sendMessage('alice', E1, `baseline-${runId}`);
    const bobGot = await waitFor(() => bobPub.log.inserts.includes(`baseline-${runId}`));
    await sleep(1500);
    const carolGot = carolPub.log.inserts.some((body) => body?.startsWith('baseline'));
    record('1.0', 'Cold first join (info): event for a message sent immediately after SUBSCRIBED', 'informational', `delivered=${immediateGot}`, true);
    record('1.1', 'Q1 baseline: participant, public channel, postgres_changes (settled channel)', 'SUBSCRIBED + event', `${describe(b)}, event=${bobGot}`, b.status === 'SUBSCRIBED' && bobGot);
    record('1.2', 'Q1 baseline: non-participant, public channel', 'SUBSCRIBED but NO event (table RLS)', `${describe(c)}, event=${carolGot}`, c.status === 'SUBSCRIBED' && !carolGot);
    await closeChannel(bob.client, bobPub);
    await closeChannel(carol.client, carolPub);
  }

  // Q1: private chat channel WITH a policy (informational immediate send, readiness-gated delivery, DB refetch).
  {
    const h = await checkPrivateChatDelivery('1.3', 'Q1: private + postgres_changes, topic has a read policy');
    await closeChannel(bob.client, h);
  }

  // Reaction events are covered by `run.mjs reactions pre|post` (migration 20260803150000): reactions
  // no longer travel over a postgres_changes binding, so the old 1.3r / 1.3c / 1.3d checks are gone.

  // Join race: send immediately after SUBSCRIBED, several times. Missed realtime events are
  // informational; what matters is that the app's mitigation (refetch on SUBSCRIBED) recovers them.
  {
    const trials = 5;
    let missed = 0;
    let refetchAlwaysHas = true;
    for (let i = 0; i < trials; i += 1) {
      const h = openChannel(bob.client, `experience-chat:${E1}`, { isPrivate: true, experienceId: E1 });
      await h.settled;
      const body = `race-${i}-${runId}`;
      await sendMessage('alice', E1, body);
      if (!(await waitFor(() => h.log.inserts.includes(body), 4000))) missed += 1;
      const { data } = await bob.client.rpc('list_experience_messages', { p_experience_id: E1, p_before: null, p_limit: 50 });
      if (!Array.isArray(data) || !data.some((m) => m.body === body)) refetchAlwaysHas = false;
      await closeChannel(bob.client, h);
    }
    record('1.3race', 'Join race (info): realtime events missed when sending right after SUBSCRIBED', 'informational', `missed=${missed}/${trials}`, true);
    record('1.3refetch', 'Refetch after SUBSCRIBED (the app mitigation) always returns the message', 'all present', `allPresent=${refetchAlwaysHas}`, refetchAlwaysHas);
  }

  // Q1: private chat channel with NO policy for its topic.
  {
    const h = openChannel(bob.client, `experience-nopolicy:${E1}`, { isPrivate: true, experienceId: E1 });
    const s = await h.settled;
    await sendMessage('alice', E1, `nopolicy-pg-${runId}`);
    await sleep(2000);
    const got = h.log.inserts.includes(`nopolicy-pg-${runId}`);
    record('1.4', 'Q1: private + postgres_changes, NO policy for topic', 'join rejected (policy required)', `${describe(s)}, event=${got}`, s.status !== 'SUBSCRIBED');
    await closeChannel(bob.client, h);
  }

  // Q3: helper evaluated under the user's JWT context (live Realtime path).
  {
    const h = openChannel(carol.client, `experience-chat:${E1}`, { isPrivate: true, experienceId: E1 });
    const s = await h.settled;
    record('1.5', 'Q3: non-participant, private chat topic', 'join rejected', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(carol.client, h);
  }
  {
    const h = openChannel(bob.client, `experience-chat:${E3}`, { isPrivate: true, experienceId: E3 });
    const s = await h.settled;
    record('1.6a', 'Q3: participant of a CANCELLED experience (chat_read=true)', 'SUBSCRIBED', describe(s), s.status === 'SUBSCRIBED');
    await closeChannel(bob.client, h);
  }
  {
    const h = openChannel(bob.client, `experience-chat:${GONE}`, { isPrivate: true, experienceId: GONE });
    const s = await h.settled;
    record('1.6b', 'Q3: experience that does not exist (e.g. already a memory)', 'join rejected', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(bob.client, h);
  }
  {
    const h = openChannel(bob.client, 'experience-chat-signals:not-a-uuid', { isPrivate: true });
    const s = await h.settled;
    record('1.7', 'Q3: malformed topic', 'join rejected cleanly', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(bob.client, h);
  }

  // Q3: signals channel read/write through the helper.
  const aliceSig = openChannel(alice.client, `experience-chat-signals:${E1}`, { isPrivate: true });
  const bobSig = openChannel(bob.client, `experience-chat-signals:${E1}`, { isPrivate: true });
  const [as, bs] = await Promise.all([aliceSig.settled, bobSig.settled]);
  record('1.8a', 'Q3: participants join private signals topic', 'both SUBSCRIBED', `alice=${describe(as)}, bob=${describe(bs)}`, as.status === 'SUBSCRIBED' && bs.status === 'SUBSCRIBED');
  await sendTyping(aliceSig, 'alice-1');
  const bobHeard = await waitFor(() => bobSig.log.broadcasts.some((p) => p.from === 'alice-1'));
  record('1.8b', 'Q3: chat_write participant broadcasts, other participant receives', 'delivered', `delivered=${bobHeard}`, bobHeard);

  {
    const carolSig = openChannel(carol.client, `experience-chat-signals:${E1}`, { isPrivate: true });
    const s = await carolSig.settled;
    record('1.10', 'Q3: non-participant, private signals topic', 'join rejected', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(carol.client, carolSig);
  }

  // Q3: leader_only chat -- non-organizer may read but not write.
  {
    const aliceLo = openChannel(alice.client, `experience-chat-signals:${E2}`, { isPrivate: true });
    const daveLo = openChannel(dave.client, `experience-chat-signals:${E2}`, { isPrivate: true, ack: true });
    const [a2, d2] = await Promise.all([aliceLo.settled, daveLo.settled]);
    const daveSend = await sendTyping(daveLo, 'dave-1');
    await sleep(2000);
    const aliceHeardDave = aliceLo.log.broadcasts.some((p) => p.from === 'dave-1');
    await sendTyping(aliceLo, 'alice-2');
    const daveHeardAlice = await waitFor(() => daveLo.log.broadcasts.some((p) => p.from === 'alice-2'));
    record('1.9a', 'Q3: leader_only, non-organizer joins to READ', 'SUBSCRIBED', `alice=${describe(a2)}, dave=${describe(d2)}`, a2.status === 'SUBSCRIBED' && d2.status === 'SUBSCRIBED');
    record('1.9b', 'Q3: leader_only, non-organizer send is blocked (chat_write=false)', 'NOT delivered', `delivered=${aliceHeardDave}, ackResult=${daveSend}`, !aliceHeardDave);
    record('1.9c', 'Q3: leader_only, organizer send is delivered to non-organizer', 'delivered', `delivered=${daveHeardAlice}`, daveHeardAlice);
    await closeChannel(alice.client, aliceLo);
    await closeChannel(dave.client, daveLo);
  }

  // Q2: public vs private isolation on the SAME topic string.
  {
    const carolPubSig = openChannel(carol.client, `experience-chat-signals:${E1}`, { isPrivate: false });
    const s = await carolPubSig.settled;
    await sendTyping(aliceSig, 'alice-3');
    const bobHeard3 = await waitFor(() => bobSig.log.broadcasts.some((p) => p.from === 'alice-3'));
    await sleep(1500);
    const carolHeardAlice = carolPubSig.log.broadcasts.some((p) => p.from === 'alice-3');
    await sendTyping(carolPubSig, 'carol-spoof');
    await sleep(2000);
    const aliceHeardCarol = aliceSig.log.broadcasts.some((p) => p.from === 'carol-spoof');
    const bobHeardCarol = bobSig.log.broadcasts.some((p) => p.from === 'carol-spoof');
    record('2.1', 'Q2: outsider joins SAME topic as PUBLIC channel (public access on)', 'allowed to join (info)', describe(s), true);
    record('2.2', "Q2: outsider (public) does NOT receive private participants' broadcast", 'not received', `bobGot=${bobHeard3}, carolGot=${carolHeardAlice}`, bobHeard3 && !carolHeardAlice);
    record('2.3', 'Q2: outsider (public) broadcast does NOT reach private participants', 'not received', `aliceGot=${aliceHeardCarol}, bobGot=${bobHeardCarol}`, !aliceHeardCarol && !bobHeardCarol);
    await closeChannel(carol.client, carolPubSig);
  }

  // Authorization caching / revocation (source says: re-evaluated on token refresh).
  {
    runSql(`delete from public.experience_participants where experience_id = '${E1}' and user_id = '${bob.id}';`);
    await sendTyping(aliceSig, 'alice-4');
    const stillHears = await waitFor(() => bobSig.log.broadcasts.some((p) => p.from === 'alice-4'), 3000);
    await sleep(1500); // new JWT needs a different iat
    await bob.client.auth.refreshSession();
    await sleep(3000);
    await sendTyping(aliceSig, 'alice-5');
    const hearsAfterRefresh = await waitFor(() => bobSig.log.broadcasts.some((p) => p.from === 'alice-5'), 3000);
    const lastStatus = bobSig.log.statuses.at(-1)?.status;
    record('3.1', 'Revocation: removed participant, BEFORE token refresh', 'still receives (cached authorization) -- info', `receives=${stillHears}`, true);
    record('3.2', 'Revocation: removed participant, AFTER token refresh', 'stops receiving / channel closed', `receives=${hearsAfterRefresh}, lastStatus=${lastStatus}`, !hearsAfterRefresh);
    results.at(-2).note = stillHears ? 'cached' : 'not cached';
  }

  await closeChannel(alice.client, aliceSig);
  await closeChannel(bob.client, bobSig);

  // Presence must stay unusable: the policies only match the broadcast extension. A join that
  // also asks for presence is still accepted (broadcast read is enough), so the real check is
  // that presence state never flows between two authorized participants.
  // (Runs on E2 topics that no client has open: supabase-js hands back the existing channel
  // object for a topic that is still registered, which would reject `.on('presence')`.)
  {
    const aliceP = openChannel(alice.client, `experience-chat-signals:${E2}`, { isPrivate: true, withPresence: true });
    const daveP = openChannel(dave.client, `experience-chat-signals:${E2}`, { isPrivate: true, withPresence: true });
    const [as, ds] = await Promise.all([aliceP.settled, daveP.settled]);
    let trackResult;
    try {
      trackResult = await aliceP.channel.track({ probe: runId });
    } catch (error) {
      trackResult = `threw:${error?.message}`;
    }
    await sleep(3000);
    const daveSeesAlice = Object.keys(daveP.channel.presenceState()).length;
    const aliceSeesSelf = Object.keys(aliceP.channel.presenceState()).length;
    record('1.11', 'Presence state does NOT flow between participants on the signals topic', 'no presence visible', `join alice=${describe(as)}, dave=${describe(ds)}, track=${trackResult}, daveSees=${daveSeesAlice}, aliceSees=${aliceSeesSelf}`, daveSeesAlice === 0);
    await closeChannel(alice.client, aliceP);
    await closeChannel(dave.client, daveP);
  }
}

// ---------------------------------------------------------------------------
// Phase 2 -- "Allow public access to channels" DISABLED (flipped while this runs)
// ---------------------------------------------------------------------------
async function phase2() {
  const { E1 } = ctx;
  const { alice, bob, carol } = people;

  // Long-lived PUBLIC subscriber that exists BEFORE the toggle.
  const watcher = openChannel(bob.client, `experience-chat:${E1}`, { experienceId: E1 });
  const w = await watcher.settled;
  console.log(`\nWatcher (public, pre-toggle): ${describe(w)}`);
  record('4.0', 'Pre-toggle public chat channel (SUBSCRIBED if public access still ON)', 'info', describe(w), true);
  // 4.1 needs an ON -> OFF transition to observe. If the public watcher could not subscribe, public access
  // is already OFF (re-run) and 4.1 is reported as skipped. 4.2 / 4.4 / 4.6 below stay hard assertions.
  const publicWasOn = w.status === 'SUBSCRIBED';
  if (!publicWasOn) {
    console.log('NOTE: the pre-toggle public watcher did not subscribe, so public access looks already OFF; 4.1 will be skipped.');
  }

  console.log('\n>>> NOW: Dashboard -> Realtime -> Settings -> turn OFF "Allow public access to channels" -> Save.');
  console.log('    Polling for the change (up to 10 min)...\n');
  const waitStart = Date.now();
  let flippedAt = null;
  while (Date.now() - waitStart < 10 * 60 * 1000) {
    const probe = openChannel(carol.client, `experience-probe:${runId}`, { isPrivate: false });
    const s = await probe.settled;
    await closeChannel(carol.client, probe);
    if (s.status !== 'SUBSCRIBED') {
      flippedAt = Date.now();
      console.log(`Public join now rejected after ${Math.round((flippedAt - waitStart) / 1000)}s: ${describe(s)}`);
      break;
    }
    await sleep(5000);
  }
  // Throw (not die()): process.exit() here would skip teardown. main() catches it and tears down.
  if (!flippedAt) throw new Error('Public access never turned off within 10 minutes.');
  await sleep(10000);

  const events = watcher.log.statuses.filter((s) => s.at >= waitStart);
  if (publicWasOn) {
    record(
      '4.1',
      'Setting change: existing PUBLIC subscriber is disconnected / errored',
      'status transitions after toggle',
      events.length ? events.map((e) => describe(e)).join(' -> ') : 'no status change observed',
      events.length > 0,
    );
  } else {
    recordSkipped(
      '4.1',
      'Setting change: existing PUBLIC subscriber is disconnected / errored',
      `no ON -> OFF transition to observe: the public watcher never subscribed (${describe(w)}), public access was already OFF`,
    );
  }
  await closeChannel(bob.client, watcher);

  {
    const h = openChannel(bob.client, `experience-chat:${E1}`, { isPrivate: false, experienceId: E1 });
    const s = await h.settled;
    record('4.2', 'Public chat join with public access OFF', 'rejected (PrivateOnly)', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(bob.client, h);
  }
  {
    const h = await checkPrivateChatDelivery('4.3', 'Private chat channel + policy, public access OFF');
    // Same delivery check again on the by-now settled channel (independent of any join race).
    await sleep(4000);
    await sendMessage('alice', E1, `after-toggle-late-${runId}`);
    const gotLate = await waitFor(() => h.log.inserts.includes(`after-toggle-late-${runId}`), 8000);
    record('4.3b', 'Private chat channel + policy, public access OFF (settled channel)', 'postgres_changes event', `event=${gotLate}, system=[${h.log.system.join(' | ')}]`, gotLate);
    await closeChannel(bob.client, h);
  }
  {
    const h = openChannel(bob.client, `experience-nopolicy:${E1}`, { isPrivate: true, experienceId: E1 });
    const s = await h.settled;
    record('4.4', 'Private channel, NO policy, public access OFF', 'rejected', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(bob.client, h);
  }
  {
    const aliceSig = openChannel(alice.client, `experience-chat-signals:${E1}`, { isPrivate: true });
    const bobSig = openChannel(bob.client, `experience-chat-signals:${E1}`, { isPrivate: true });
    const [as, bs] = await Promise.all([aliceSig.settled, bobSig.settled]);
    await sendTyping(aliceSig, 'alice-6');
    const heard = await waitFor(() => bobSig.log.broadcasts.some((p) => p.from === 'alice-6'));
    record('4.5', 'Private signals broadcast, public access OFF', 'delivered', `alice=${describe(as)}, bob=${describe(bs)}, delivered=${heard}`, heard);
    await closeChannel(alice.client, aliceSig);
    await closeChannel(bob.client, bobSig);
  }
  {
    const h = openChannel(carol.client, `experience-chat-signals:${E1}`, { isPrivate: false });
    const s = await h.settled;
    record('4.6', 'Outsider public join on signals topic, public access OFF', 'rejected', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(carol.client, h);
  }
}

// ---------------------------------------------------------------------------
// Reactions mode -- who can learn about reaction changes (migration 20260803150000)
// ---------------------------------------------------------------------------
const THUMBS_UP = '\u{1F44D}';
const HEART = '\u2764\uFE0F';

/**
 * Read-only. 'pre'  = reactions table still in the supabase_realtime publication, no trigger.
 *            'post' = table removed from the publication and the broadcast trigger present.
 * Anything else is a half-applied state and the run must not start.
 */
function detectReactionFixState() {
  const rows = runSql(`
select 'publication' as k, count(*)::text as v from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'experience_message_reactions'
union all
select 'trigger', count(*)::text from pg_trigger
  where tgrelid = 'public.experience_message_reactions'::regclass and not tgisinternal
union all
select 'history', count(*)::text from supabase_migrations.schema_migrations where version = '20260803150000';`);
  const n = (k) => Number(rows.find((r) => r.k === k)?.v ?? Number.NaN);
  const detail = `inPublication=${n('publication')}, triggers=${n('trigger')}, historyRow=${n('history')}`;
  if (n('publication') === 1 && n('trigger') === 0) return { state: 'pre', detail };
  if (n('publication') === 0 && n('trigger') === 1) return { state: 'post', detail };
  return { state: 'partial', detail };
}

/** Distinct, throwaway-id based comparisons only; no id value is printed. */
async function reactionsMode(state) {
  const post = state === 'post';
  const { E1, E3, E4 } = ctx;
  const { alice, bob, carol } = people;
  const hasMessage = (log, id) => log.reactionBroadcasts.some((p) => p?.message_id === id);

  // All channels are PRIVATE (works with "Allow public access to channels" OFF).
  // bob/alice: legitimate participants of E1. carol: NOT in E1, but legitimately in E4 -- she can join
  // her own E4 topics, which is all the exploit needs because a postgres_changes binding is
  // table-level and chosen by the client (the topic name does not scope it).
  const bobCh = openChannel(bob.client, `experience-chat:${E1}`, {
    isPrivate: true,
    experienceId: E1,
    withReactions: !post,
    withReactionBroadcast: post,
  });
  const aliceCh = openChannel(alice.client, `experience-chat:${E1}`, { isPrivate: true, withReactionBroadcast: post });
  const carolOwn = openChannel(carol.client, `experience-chat:${E4}`, {
    isPrivate: true,
    experienceId: E4,
    withReactionBroadcast: true,
    withMessagesUnfiltered: true,
  });
  const carolTable = openChannel(carol.client, `experience-chat-signals:${E4}`, { isPrivate: true, withReactions: true });
  const [b, a, co, ct] = await Promise.all([bobCh.settled, aliceCh.settled, carolOwn.settled, carolTable.settled]);
  record(
    'R.join',
    'Participants join their E1 chat topic; carol joins her own E4 topics (all private)',
    'bob, alice, carol(E4 chat) SUBSCRIBED',
    `bob=${describe(b)}, alice=${describe(a)}, carolChat=${describe(co)}, carolTableTopic=${describe(ct)}`,
    b.status === 'SUBSCRIBED' && a.status === 'SUBSCRIBED' && co.status === 'SUBSCRIBED',
  );
  // postgres_changes bindings need the server-side readiness event before they deliver anything.
  await Promise.all(
    [bobCh, carolOwn, ...(ct.status === 'SUBSCRIBED' ? [carolTable] : [])].map((h) =>
      h.log.statuses.some((s) => s.status === 'SUBSCRIBED') ? waitFor(() => h.log.pgReadyAt !== null, 10000) : true,
    ),
  );
  await sleep(500);

  // R2 (both states): an outsider cannot join the E1 chat topic at all.
  {
    const h = openChannel(carol.client, `experience-chat:${E1}`, { isPrivate: true, withReactionBroadcast: true });
    const s = await h.settled;
    record('R2', 'Outsider (carol) joins the private E1 chat topic', 'join rejected', describe(s), s.status !== 'SUBSCRIBED');
    await closeChannel(carol.client, h);
  }

  // The activity: add, change emoji (UPDATE), remove (DELETE) -- by alice, in E1.
  const messageId = await sendMessage('alice', E1, `react-target-${runId}`);
  const bobSeen = () => (post ? bobCh.log.reactionBroadcasts.length : bobCh.log.reactionEvents.length);
  await react('alice', messageId, THUMBS_UP); // INSERT
  await waitFor(() => bobSeen() >= 1, 6000);
  await react('alice', messageId, HEART); // UPDATE
  await waitFor(() => bobSeen() >= 2, 6000);
  await react('alice', messageId, HEART); // same emoji again -> removal (DELETE)
  await waitFor(() => bobSeen() >= 3, 6000);
  await sleep(2500);

  if (!post) {
    // R0: reproduce the leak.
    const outsiderEvents = carolTable.log.reactionEvents;
    const outsiderDeletes = outsiderEvents.filter((e) => e.type === 'DELETE');
    const outsiderInsUpd = outsiderEvents.filter((e) => e.type === 'INSERT' || e.type === 'UPDATE').length;
    const leaked = outsiderDeletes.find((e) => e.message_id === messageId && e.user_id === alice.id);
    record(
      'R0',
      "Reproduction (pre-fix): outsider on her OWN private topic + unfiltered reactions binding receives another experience's reaction DELETE",
      'DELETE received carrying message_id + user_id (confirms the root cause)',
      `carolTableTopic=${describe(ct)}, deleteEvents=${outsiderDeletes.length}, keys=${outsiderDeletes[0]?.keys.join('+') ?? '-'}, messageIdMatches=${Boolean(leaked)}`,
      ct.status === 'SUBSCRIBED' && Boolean(leaked) && ['message_id', 'user_id'].every((k) => leaked.keys.includes(k)),
    );
    record(
      'R0b',
      'Same binding: outsider gets NO reaction INSERT/UPDATE (table RLS intact)',
      'none',
      `insertUpdateEvents=${outsiderInsUpd}`,
      outsiderInsUpd === 0,
    );
    const bobTypes = bobCh.log.reactionEvents.map((e) => e.type).join(',');
    record('R0c', 'Participant (bob) receives add / change / removal via the table binding (info)', 'informational', `events=[${bobTypes}]`, true);
  } else {
    // R1: authorized participants receive add / change / removal, with the minimal payload.
    const events = bobCh.log.reactionBroadcasts;
    const onlyMinimalKeys = events.every((p) => Object.keys(p ?? {}).every((k) => k === 'message_id' || k === 'id'));
    const allForMessage = events.length > 0 && events.every((p) => p?.message_id === messageId);
    record(
      'R1',
      'Participant (bob) receives reaction_changed for add, emoji change and removal, payload = message_id only',
      '3 events for the message; keys only message_id (+ the broadcast row id)',
      `events=${events.length}, allForMessage=${allForMessage}, minimalKeys=${onlyMinimalKeys}, keys=${events[0] ? Object.keys(events[0]).join('+') : '-'}`,
      events.length === 3 && allForMessage && onlyMinimalKeys,
    );
    record('R1b', 'The reacting participant (alice) also receives them (info)', 'informational', `events=${aliceCh.log.reactionBroadcasts.length}`, true);

    // R3: the outsider learns nothing, neither from Broadcast nor from the (now unavailable) table binding.
    const outsiderTable = carolTable.log.reactionEvents.length;
    record(
      'R3',
      'Outsider (carol) on her own topics: no reaction_changed broadcast and no table events for E1 reactions',
      '0 broadcasts, 0 table events',
      `broadcasts=${carolOwn.log.reactionBroadcasts.length}, tableEvents=${outsiderTable}, tableBindingTopic=${describe(ct)}`,
      carolOwn.log.reactionBroadcasts.length === 0 && outsiderTable === 0,
    );

    // R4: reactions in another experience do not reach E1 subscribers, nor the outsider.
    const m3 = await sendMessage('alice', E3, `r4-${runId}`);
    await react('alice', m3, THUMBS_UP);
    await sleep(3500);
    record(
      'R4',
      'Reaction in experience E3: not delivered on the E1 topic (bob) nor to the outsider',
      'none',
      `bobGot=${hasMessage(bobCh.log, m3)}, carolGot=${hasMessage(carolOwn.log, m3)}`,
      !hasMessage(bobCh.log, m3) && !hasMessage(carolOwn.log, m3),
    );

    // R5: a client cannot inject reaction_changed into the topic (no INSERT policy there).
    let forgedResult;
    try {
      forgedResult = await bobCh.channel.send({
        type: 'broadcast',
        event: 'reaction_changed',
        payload: { message_id: messageId, forged: runId },
      });
    } catch (error) {
      forgedResult = `threw:${error?.message}`;
    }
    await sleep(3000);
    const forgedSeen = [aliceCh, carolOwn].some((h) => h.log.reactionBroadcasts.some((p) => p?.forged === runId));
    record('R5', 'Participant tries to send reaction_changed on the E1 chat topic', 'not delivered to anyone', `delivered=${forgedSeen}, sendResult=${forgedResult}`, !forgedSeen);

    // R6: deleting a message that has reactions (FK cascade) works; the cascaded reaction delete has no parent to look up.
    const m6 = await sendMessage('alice', E1, `r6-${runId}`);
    await react('bob', m6, '\u{1F64F}');
    await waitFor(() => hasMessage(aliceCh.log, m6), 6000);
    const forEvents = () => aliceCh.log.reactionBroadcasts.filter((p) => p?.message_id === m6).length;
    const beforeDelete = forEvents();
    const { error: delError } = await alice.client.rpc('delete_experience_message', { p_message_id: m6 });
    await sleep(3500);
    const { data: listed } = await bob.client.rpc('list_experience_messages', { p_experience_id: E1, p_before: null, p_limit: 100 });
    const stillListed = Array.isArray(listed) && listed.some((m) => m.id === m6);
    record('R6', 'Deleting a message that has a reaction (cascade)', 'delete succeeds, message gone', `rpcError=${delError?.message ?? 'none'}, stillListed=${stillListed}`, !delError && !stillListed);
    record('R6b', 'Cascaded reaction removal: events after the delete (info; 0 = skipped because the parent is gone)', 'informational', `eventsBefore=${beforeDelete}, eventsAfter=${forEvents()}`, true);

    // R7: catalog state of the trigger function, trigger and publication.
    const rows = runSql(`
select 'fn' as k, concat_ws(' | ', 'owner=' || pg_get_userbyid(p.proowner), 'secdef=' || p.prosecdef::text,
  'config=' || coalesce(array_to_string(p.proconfig, ','), 'none'),
  'anon_exec=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text,
  'auth_exec=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text,
  'acl=' || coalesce(p.proacl::text, 'null')) as v
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'broadcast_experience_reaction_change'
union all
select 'trg', pg_get_triggerdef(t.oid) from pg_trigger t
where t.tgrelid = 'public.experience_message_reactions'::regclass and not t.tgisinternal
union all
select 'pub', tablename::text from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'experience_message%';`);
    const fn = rows.find((r) => r.k === 'fn')?.v ?? '';
    const trg = rows.find((r) => r.k === 'trg')?.v ?? '';
    const pubs = rows.filter((r) => r.k === 'pub').map((r) => r.v);
    const aclOk = !/acl=null/.test(fn) && !/(^|[{,])=X\//.test(fn.split('acl=')[1] ?? '');
    record(
      'R7',
      'Trigger function: SECURITY DEFINER, owned by postgres, empty search_path, no EXECUTE for PUBLIC/anon/authenticated; row trigger on INSERT/UPDATE/DELETE; only messages left in the publication',
      'all true',
      `fn=[${fn.replace(/acl=.*/, 'acl=...')}], aclOk=${aclOk}, trigger=[${trg.replace(/CREATE TRIGGER /, '')}], publication=[${pubs.join(',')}]`,
      /owner=postgres/.test(fn) &&
        /secdef=true/.test(fn) &&
        /search_path=""/.test(fn) &&
        /anon_exec=false/.test(fn) &&
        /auth_exec=false/.test(fn) &&
        aclOk &&
        /AFTER INSERT OR DELETE OR UPDATE ON public\.experience_message_reactions FOR EACH ROW/.test(trg) &&
        pubs.length === 1 &&
        pubs[0] === 'experience_messages',
    );
  }

  // R8 (both states, Option A): what an outsider sees through an UNFILTERED messages binding.
  {
    const deletesBefore = carolOwn.log.unfilteredMessageEvents.filter((e) => e.type === 'DELETE').length;
    const participantDeletesBefore = bobCh.log.messageEvents.filter((e) => e.type === 'DELETE').length;
    const m8 = await sendMessage('alice', E1, `r8-${runId}`);
    await sleep(2500);
    const { error: delError } = await alice.client.rpc('delete_experience_message', { p_message_id: m8 });
    await sleep(5000);
    const outsiderAll = carolOwn.log.unfilteredMessageEvents;
    const outsiderInserts = outsiderAll.filter((e) => e.type === 'INSERT').length;
    const newDeletes = outsiderAll.filter((e) => e.type === 'DELETE').slice(deletesBefore);
    const participantDeletes = bobCh.log.messageEvents.filter((e) => e.type === 'DELETE').slice(participantDeletesBefore);
    record(
      'R8a',
      'Outsider, unfiltered messages binding: NO message INSERT events from E1 (table RLS)',
      'none',
      `insertEvents=${outsiderInserts}, deleteRpcError=${delError?.message ?? 'none'}`,
      outsiderInserts === 0 && !delError,
    );
    record(
      'R8b',
      'Message DELETE through an unfiltered messages binding (info, Option A): what the outsider receives',
      'informational',
      `outsiderDeleteEvents=${newDeletes.length}, keys=${newDeletes[0]?.keys.join('+') ?? '-'}; participantFilteredBindingDeleteEvents=${participantDeletes.length}`,
      true,
    );
  }

  await closeChannel(bob.client, bobCh);
  await closeChannel(alice.client, aliceCh);
  await closeChannel(carol.client, carolOwn);
  await closeChannel(carol.client, carolTable);
}

// ---------------------------------------------------------------------------
// Teardown and shutdown
// ---------------------------------------------------------------------------
// Set just BEFORE the setup SQL runs, so teardown is attempted even if setup fails partway.
// Safe: teardown only deletes rows keyed by this run's random ids (it is a no-op if none exist).
let created = false;
let cleanupPromise = null;

/**
 * Closes realtime channels and deletes the throwaway data. Idempotent: every caller (normal
 * completion, error, timeout, signal, fatal error) shares one run, so the delete never executes
 * twice and nobody exits before it has finished. It never rejects.
 * `closeChannels: false` (fatal path) skips the async channel close, so the teardown runs
 * synchronously and nothing else gets to run in between; the sockets die with the process.
 */
function cleanup({ closeChannels = true } = {}) {
  cleanupPromise ??= (async () => {
    for (const person of closeChannels ? Object.values(people) : []) {
      try {
        // Bounded, so a stuck socket cannot prevent the database teardown below.
        await Promise.race([person.client?.removeAllChannels(), sleep(5000)]);
      } catch {
        // Ignored: the channels die with the process anyway.
      }
    }
    if (created) {
      try {
        runSql(teardownSql());
        console.log('\nTeardown complete: throwaway users and experiences removed (migration objects untouched).');
      } catch {
        process.exitCode = 1;
        console.error(`\nTEARDOWN FAILED. Remove manually: experiences titled "${tag}" and users spike-*-${runId}@kairos-spike.test.`);
      }
    }
  })();
  return cleanupPromise;
}

function finish() {
  console.log('\n=== SUMMARY ===');
  console.table(results);
  const failed = results.filter((r) => r.result === 'FAIL/INFO').length;
  if (failed) console.error(`${failed} check(s) FAILED.`);
  process.exit(process.exitCode ?? 0);
}

/** Waits for the (shared) teardown, then prints the summary and exits. Exits even if finish() throws. */
function exitAfterCleanup(options) {
  cleanup(options)
    .then(finish)
    .catch(() => process.exit(process.exitCode || 1));
}

let interrupted = false;
function handleSignal(signal, exitCode) {
  if (interrupted) {
    console.error(`\nReceived ${signal} again; teardown is already running, please wait...`);
    return;
  }
  interrupted = true;
  process.exitCode = exitCode;
  console.error(`\nReceived ${signal}; running teardown before exit...`);
  exitAfterCleanup();
}

let fatalHandled = false;
/** unhandledRejection / uncaughtException: tear down, print the failure, exit non-zero. Never re-entered. */
function handleFatal(kind, error) {
  process.exitCode = 1;
  if (fatalHandled) {
    console.error(`\nAnother ${kind} during fatal shutdown (ignored): ${error?.message ?? String(error)}`);
    return;
  }
  fatalHandled = true;
  console.error(`\nFATAL ${kind}: ${error?.stack ?? String(error)}`);
  console.error('Running teardown before exit...');
  exitAfterCleanup({ closeChannels: false });
}

// ---------------------------------------------------------------------------
async function main() {
  // Validate before creating anything: process.exit() inside the try below would skip teardown.
  if (!['phase1', 'phase2', 'reactions'].includes(mode)) die(`unknown mode "${mode}" (use phase1, phase2 or reactions pre|post)`);
  if (mode === 'reactions' && !['pre', 'post'].includes(expectedState)) die('reactions mode needs a state: "reactions pre" or "reactions post"');
  console.log(`Spike run ${runId} against ${new URL(URL_).host} (mode=${mode}${expectedState ? ` ${expectedState}` : ''})\n`);
  process.on('SIGINT', () => handleSignal('SIGINT', 130));
  process.on('SIGTERM', () => handleSignal('SIGTERM', 143));
  process.on('unhandledRejection', (reason) => handleFatal('unhandledRejection', reason));
  process.on('uncaughtException', (error) => handleFatal('uncaughtException', error));
  try {
    assertMigrationApplied();
    if (mode === 'reactions') {
      // Read-only, and before anything is created: the stated state must match the database.
      const found = detectReactionFixState();
      record('pre.reactionState', `Database is in the "${expectedState}" state for migration 20260803150000`, expectedState, `${found.state} (${found.detail})`, found.state === expectedState);
      if (found.state !== expectedState) die(`database state is "${found.state}" (${found.detail}), not "${expectedState}". Nothing was created.`);
    }
    console.log('Creating throwaway users and experiences via the linked CLI login...');
    created = true;
    runSql(setupSql());
    await signInAll();
    console.log('Signed in 4 spike users with the password grant.\n');

    if (mode === 'phase1') {
      verifyDirectSql();
      await phase1();
    } else if (mode === 'phase2') {
      await phase2();
    } else if (mode === 'reactions') {
      await reactionsMode(expectedState);
    } else {
      die(`unknown mode "${mode}"`);
    }
  } catch (error) {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }

  finish();
}

main();
