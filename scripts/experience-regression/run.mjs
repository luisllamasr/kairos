/**
 * Private-plan regression + M16 Phase 1 update_experience checks.
 * Throwaway users only; teardown always runs. See README.md.
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

function die(message) {
  console.error(`\nABORT: ${message}\n`);
  process.exit(1);
}

function readEnv(name) {
  const text = readFileSync(join(repoRoot, '.env'), 'utf8');
  const match = text.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

const URL_ = readEnv('EXPO_PUBLIC_SUPABASE_URL');
const ANON = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (!URL_ || !ANON) die('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing in .env');

const runId = Date.now().toString(36);
const password = `Rg!${randomBytes(12).toString('hex')}`;
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const results = [];

function record(id, question, expected, actual, ok) {
  results.push({ id, question, expected, actual, result: ok ? 'PASS' : 'FAIL' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  expected: ${expected}  |  actual: ${actual}`);
  if (!ok) process.exitCode = 1;
}

function runSql(sqlText, { quiet = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kairos-regression-'));
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

function rpcCode(error) {
  const msg = error?.message ?? '';
  if (msg.includes('not allowed')) return 'not allowed';
  if (msg.includes('not cancellable')) return 'not cancellable';
  if (msg.includes('not found')) return 'not found';
  if (msg.includes('not friends with leader')) return 'not friends with leader';
  if (msg.includes('invite blocked')) return 'invite blocked';
  if (msg.includes('not friends')) return 'not friends';
  if (msg.includes('leader required')) return 'leader required';
  return msg || 'ok';
}

const names = ['alice', 'bob', 'carol', 'dave'];
const people = Object.fromEntries(
  names.map((n) => [n, { id: randomUUID(), email: `regression-${n}-${runId}@kairos-spike.test` }]),
);
const tag = `REGRESSION ${runId}`;
let expId = null;
let mode = 'baseline';

function setupSql() {
  const userRows = names.map((n) => `('${people[n].id}', '${people[n].email}')`).join(',\n');
  const alice = people.alice.id;
  const bob = people.bob.id;
  const dave = people.dave.id;
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

insert into public.friendships (user_low_id, user_high_id, status, initiated_by, responded_at)
values
  (least('${alice}'::uuid, '${bob}'::uuid), greatest('${alice}'::uuid, '${bob}'::uuid), 'accepted', '${alice}', now()),
  (least('${alice}'::uuid, '${dave}'::uuid), greatest('${alice}'::uuid, '${dave}'::uuid), 'accepted', '${alice}', now());
`;
}

function teardownSql() {
  const userIds = names.map((n) => `'${people[n].id}'`).join(', ');
  return `
delete from public.experiences where title like '${tag}%'${expId ? ` or id = '${expId}'` : ''};
delete from auth.users where id in (${userIds});
`;
}

function baselineSql() {
  return `
select
  (select count(*) from auth.users where email like '%@kairos-spike.test') as spike_users,
  (select count(*) from public.experiences where title like 'REGRESSION %' or title like 'LIFECYCLE %' or title like 'SPIKE %') as tagged_experiences;
`;
}

function countUpdated(userId) {
  const rows = runSql(`
select count(*)::int as n from public.notifications
where recipient_id = '${userId}'
  and entity_id = '${expId}'
  and type = 'experience_updated';`);
  return Number(rows[0]?.n ?? 0);
}

function countType(userId, type) {
  const rows = runSql(`
select count(*)::int as n from public.notifications
where recipient_id = '${userId}'
  and entity_id = '${expId}'
  and type = '${type}';`);
  return Number(rows[0]?.n ?? 0);
}

function visibilityOf() {
  const rows = runSql(`select visibility::text as v from public.experiences where id = '${expId}';`);
  return rows[0]?.v ?? 'missing';
}

async function loadState(client) {
  const { data, error } = await client.rpc('get_experience', { p_id: expId });
  if (error) throw new Error(`get_experience: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('get_experience returned no row');
  return {
    title: row.title,
    description: row.description ?? null,
    location_name: row.location_name ?? null,
    location_latitude: row.location_latitude ?? null,
    location_longitude: row.location_longitude ?? null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
  };
}

async function updateFrom(client, state, patch = {}) {
  const next = { ...state, ...patch };
  const { error } = await client.rpc('update_experience', {
    p_id: expId,
    p_title: next.title,
    p_description: next.description,
    p_location_name: next.location_name,
    p_starts_at: next.starts_at,
    p_ends_at: next.ends_at,
    p_location_latitude: next.location_latitude,
    p_location_longitude: next.location_longitude,
  });
  return { error, next };
}

function expectDelta(id, question, before, after, expectedDelta) {
  const actual = after - before;
  record(id, question, String(expectedDelta), String(actual), actual === expectedDelta);
}

async function main() {
  const history = runSql(`
select count(*)::int as n from supabase_migrations.schema_migrations where version = '20260826110000';`);
  const migrated = history[0]?.n === 1;
  mode = migrated ? 'post' : 'baseline';
  const expectNotify = migrated ? 1 : 0;
  const expectVisibility = migrated ? 'public' : 'private';

  record(
    'pre.mode',
    'Phase 1 migration 20260826110000 recorded',
    migrated ? 'post' : 'baseline',
    `${mode} (n=${history[0]?.n ?? 0})`,
    true,
  );
  console.log(`\nRunning experience-regression in ${mode} mode (expectNotify=${expectNotify})\n`);

  const before = runSql(baselineSql())[0];

  let signedIn = false;
  try {
    runSql(setupSql());
    for (const n of names) {
      const client = createClient(URL_, ANON, clientOpts);
      const { error } = await client.auth.signInWithPassword({
        email: people[n].email,
        password,
      });
      if (error) throw new Error(`signIn(${n}): ${error.message}`);
      people[n].client = client;
    }
    signedIn = true;

    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: created, error: createError } = await people.alice.client.rpc('create_experience', {
      p_title: tag,
      p_description: 'regression private plan',
      p_location_name: null,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_invitee_ids: null,
    });
    if (createError || !created) throw new Error(`create_experience: ${createError?.message}`);
    expId = created;

    const createdVis = visibilityOf();
    record('create.visibility', 'New plans are private', 'private', createdVis, createdVis === 'private');

    const carolGet = await people.carol.client.rpc('get_experience', { p_id: expId });
    const carolRows = Array.isArray(carolGet.data) ? carolGet.data : carolGet.data ? [carolGet.data] : [];
    record(
      'private.outsider_get',
      'Outsider get_experience is empty',
      '0',
      String(carolRows.length),
      carolRows.length === 0 && !carolGet.error,
    );

    const carolChat = await people.carol.client.rpc('send_experience_message', {
      p_experience_id: expId,
      p_body: 'outsider',
    });
    record(
      'private.outsider_chat',
      'Outsider cannot chat',
      'not found',
      rpcCode(carolChat.error),
      rpcCode(carolChat.error) === 'not found',
    );

    const carolInvite = await people.alice.client.rpc('send_experience_invitation', {
      p_experience_id: expId,
      p_invitee_id: people.carol.id,
    });
    record(
      'private.invite_non_friend',
      'Invite to non-friend is rejected',
      'not friends with leader',
      rpcCode(carolInvite.error),
      rpcCode(carolInvite.error) === 'not friends with leader',
    );

    const publicList = await people.carol.client.rpc('list_public_experiences');
    record(
      'private.no_discovery_rpc',
      'Public discovery RPC is not available yet',
      'missing',
      publicList.error ? 'missing' : 'present',
      Boolean(publicList.error),
    );

    const bobInvite = await people.alice.client.rpc('send_experience_invitation', {
      p_experience_id: expId,
      p_invitee_id: people.bob.id,
    });
    record(
      'private.invite_friend',
      'Invite to accepted friend succeeds',
      'ok',
      bobInvite.error ? rpcCode(bobInvite.error) : 'ok',
      !bobInvite.error && Boolean(bobInvite.data),
    );

    const bobAccept = await people.bob.client.rpc('accept_experience_invitation', {
      p_invitation_id: bobInvite.data,
    });
    record(
      'private.accept_invite',
      'Friend can accept invitation',
      'ok',
      bobAccept.error ? rpcCode(bobAccept.error) : 'ok',
      !bobAccept.error,
    );

    for (let i = 1; i <= 3; i += 1) {
      const inv = await people.alice.client.rpc('send_experience_invitation', {
        p_experience_id: expId,
        p_invitee_id: people.dave.id,
      });
      if (inv.error) throw new Error(`dave invite ${i}: ${inv.error.message}`);
      const dec = await people.dave.client.rpc('decline_experience_invitation', {
        p_invitation_id: inv.data,
      });
      if (dec.error) throw new Error(`dave decline ${i}: ${dec.error.message}`);
    }
    const daveFourth = await people.alice.client.rpc('send_experience_invitation', {
      p_experience_id: expId,
      p_invitee_id: people.dave.id,
    });
    record(
      'private.three_decline_block',
      'Fourth invite after three declines is blocked',
      'invite blocked',
      rpcCode(daveFourth.error),
      rpcCode(daveFourth.error) === 'invite blocked',
    );

    let state = await loadState(people.alice.client);

    const bobEdit = await updateFrom(people.bob.client, state, { title: `${tag} bob` });
    record(
      'private.bob_edit',
      'Non-leader cannot edit',
      'not allowed',
      rpcCode(bobEdit.error),
      rpcCode(bobEdit.error) === 'not allowed',
    );

    const noopBeforeAlice = countUpdated(people.alice.id);
    const noopBeforeBob = countUpdated(people.bob.id);
    const noopBeforeCarol = countUpdated(people.carol.id);
    const noopSave = await updateFrom(people.alice.client, state);
    record(
      'notify.noop.save',
      'No-op save succeeds',
      'ok',
      noopSave.error ? rpcCode(noopSave.error) : 'ok',
      !noopSave.error,
    );
    expectDelta('notify.noop.alice', 'No-op does not notify the editor', noopBeforeAlice, countUpdated(people.alice.id), 0);
    expectDelta('notify.noop.bob', 'No-op produces no experience_updated', noopBeforeBob, countUpdated(people.bob.id), 0);
    expectDelta('notify.noop.carol', 'No-op does not notify an outsider', noopBeforeCarol, countUpdated(people.carol.id), 0);
    state = await loadState(people.alice.client);

    const fieldCases = [
      { id: 'title', patch: { title: `${tag} title` } },
      { id: 'description', patch: { description: 'changed description' } },
      { id: 'location_name', patch: { location_name: 'Tarragona' } },
      { id: 'coordinates', patch: { location_latitude: 41.3851, location_longitude: 2.1734 } },
      {
        id: 'ends_at',
        patch: { ends_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString() },
      },
      {
        id: 'starts_at',
        patch: { starts_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString() },
      },
    ];

    for (const field of fieldCases) {
      const beforeAlice = countUpdated(people.alice.id);
      const beforeBob = countUpdated(people.bob.id);
      const beforeCarol = countUpdated(people.carol.id);
      const saved = await updateFrom(people.alice.client, state, field.patch);
      record(
        `notify.${field.id}.save`,
        `Leader can change ${field.id}`,
        'ok',
        saved.error ? rpcCode(saved.error) : 'ok',
        !saved.error,
      );
      expectDelta(
        `notify.${field.id}.alice`,
        `${field.id} does not notify the editor`,
        beforeAlice,
        countUpdated(people.alice.id),
        0,
      );
      expectDelta(
        `notify.${field.id}.bob`,
        `${field.id} notification delta for unmuted participant`,
        beforeBob,
        countUpdated(people.bob.id),
        expectNotify,
      );
      expectDelta(
        `notify.${field.id}.carol`,
        `${field.id} does not notify an outsider`,
        beforeCarol,
        countUpdated(people.carol.id),
        0,
      );
      state = await loadState(people.alice.client);
    }

    const mute = await people.bob.client.rpc('set_experience_notifications_muted', {
      p_experience_id: expId,
      p_muted: true,
    });
    record('private.mute', 'Participant can mute all experience notifications', 'ok', mute.error ? rpcCode(mute.error) : 'ok', !mute.error);
    const mutedBefore = countUpdated(people.bob.id);
    const mutedSave = await updateFrom(people.alice.client, state, { title: `${tag} muted` });
    record('notify.muted.save', 'Title change while muted still saves', 'ok', mutedSave.error ? rpcCode(mutedSave.error) : 'ok', !mutedSave.error);
    expectDelta('notify.muted.bob', 'Global mute suppresses experience_updated', mutedBefore, countUpdated(people.bob.id), 0);
    state = await loadState(people.alice.client);

    const unmute = await people.bob.client.rpc('set_experience_notifications_muted', {
      p_experience_id: expId,
      p_muted: false,
    });
    if (unmute.error) throw new Error(`unmute: ${unmute.error.message}`);

    runSql(`update public.experiences set visibility = 'public' where id = '${expId}';`);
    const visBeforeUpdate = visibilityOf();
    record('visibility.forced_public', 'SQL probe set visibility to public', 'public', visBeforeUpdate, visBeforeUpdate === 'public');
    const visSave = await updateFrom(people.alice.client, state, { title: `${tag} vis` });
    record('visibility.save', 'update_experience after public probe succeeds', 'ok', visSave.error ? rpcCode(visSave.error) : 'ok', !visSave.error);
    const visAfter = visibilityOf();
    record(
      'visibility.preserved',
      migrated
        ? 'update_experience preserves existing public visibility'
        : 'update_experience currently resets visibility to private',
      expectVisibility,
      visAfter,
      visAfter === expectVisibility,
    );

    const transfer = await people.alice.client.rpc('transfer_experience_leadership', {
      p_experience_id: expId,
      p_new_organizer_id: people.bob.id,
    });
    record('private.transfer', 'Leader can transfer leadership', 'ok', transfer.error ? rpcCode(transfer.error) : 'ok', !transfer.error);

    const transferBack = await people.bob.client.rpc('transfer_experience_leadership', {
      p_experience_id: expId,
      p_new_organizer_id: people.alice.id,
    });
    if (transferBack.error) throw new Error(`transfer back: ${transferBack.error.message}`);

    const cancelBefore = countType(people.bob.id, 'experience_cancelled');
    const cancel = await people.alice.client.rpc('cancel_experience', { p_id: expId });
    record('private.cancel', 'Leader can cancel before start', 'ok', cancel.error ? rpcCode(cancel.error) : 'ok', !cancel.error);
    expectDelta('private.cancel_notify', 'Cancel notifies unmuted participant', cancelBefore, countType(people.bob.id, 'experience_cancelled'), 1);

    const reviveBefore = countType(people.alice.id, 'experience_revived');
    const revive = await people.bob.client.rpc('revive_experience', { p_id: expId });
    record('private.revive', 'Any participant can revive before start', 'ok', revive.error ? rpcCode(revive.error) : 'ok', !revive.error);
    expectDelta('private.revive_notify', 'Revive notifies the previous leader', reviveBefore, countType(people.alice.id, 'experience_revived'), 1);

    const leave = await people.bob.client.rpc('leave_experience', {
      p_id: expId,
      p_new_organizer_id: people.alice.id,
    });
    record(
      'private.leave',
      'Leader with others remaining can leave by choosing a successor',
      'ok',
      leave.error ? rpcCode(leave.error) : 'ok',
      !leave.error,
    );
  } finally {
    if (signedIn) {
      for (const n of names) {
        try {
          await people[n].client?.auth.signOut();
        } catch {
          /* ignore */
        }
      }
    }
    try {
      runSql(teardownSql());
    } catch (err) {
      console.error('teardown failed', err);
      process.exitCode = 1;
    }
  }

  const after = runSql(baselineSql())[0];
  record(
    'teardown.users',
    'Throwaway users gone',
    String(before.spike_users),
    String(after.spike_users),
    Number(after.spike_users) === Number(before.spike_users),
  );
  record(
    'teardown.experiences',
    'Throwaway experiences gone',
    String(before.tagged_experiences),
    String(after.tagged_experiences),
    Number(after.tagged_experiences) === Number(before.tagged_experiences),
  );

  const failed = results.filter((r) => r.result === 'FAIL');
  console.log(`\nmode=${mode}  ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  try {
    runSql(teardownSql());
  } catch {
    /* ignore */
  }
  process.exit(1);
});
