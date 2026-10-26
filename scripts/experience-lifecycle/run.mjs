/**
 * Lifecycle regression for migration 20260826100000.
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
const password = `Lc!${randomBytes(12).toString('hex')}`;
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };
const results = [];

function record(id, question, expected, actual, ok) {
  results.push({ id, question, expected, actual, result: ok ? 'PASS' : 'FAIL' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  expected: ${expected}  |  actual: ${actual}`);
  if (!ok) process.exitCode = 1;
}

function runSql(sqlText, { quiet = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kairos-lifecycle-'));
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
  if (msg.includes('leader required')) return 'leader required';
  return msg || 'ok';
}

const names = ['alice', 'bob'];
const people = Object.fromEntries(
  names.map((n) => [n, { id: randomUUID(), email: `lifecycle-${n}-${runId}@kairos-spike.test` }]),
);
const tag = `LIFECYCLE ${runId}`;
let expId = null;

function setupSql() {
  const userRows = names.map((n) => `('${people[n].id}', '${people[n].email}')`).join(',\n');
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
`;
}

function teardownSql() {
  const userIds = names.map((n) => `'${people[n].id}'`).join(', ');
  return `
delete from public.experiences where title = '${tag}'${expId ? ` or id = '${expId}'` : ''};
delete from auth.users where id in (${userIds});
`;
}

function baselineSql() {
  return `
select
  (select count(*) from auth.users where email like '%@kairos-spike.test') as spike_users,
  (select count(*) from public.experiences where title like 'LIFECYCLE %' or title like 'SPIKE %') as tagged_experiences;
`;
}

async function main() {
  const history = runSql(`
select count(*)::int as n from supabase_migrations.schema_migrations where version = '20260826100000';`);
  record(
    'pre.migration',
    'Migration 20260826100000 recorded',
    '1',
    String(history[0]?.n ?? 0),
    history[0]?.n === 1,
  );
  if (history[0]?.n !== 1) die('Apply the migration first (npx supabase db push --linked --yes).');

  const compute = runSql(`
select public.compute_experience_transform_at('2026-01-01 12:00:00+00') as t;`);
  const computeOk = String(compute[0]?.t ?? '').startsWith('2026-01-01');
  record(
    'pre.compute',
    'compute_experience_transform_at equals ends_at (no +3h)',
    '2026-01-01 12:00:00',
    String(compute[0]?.t ?? ''),
    computeOk,
  );

  const offset = runSql(`
select count(*)::int as n from public.experiences
where status = 'planned' and transform_at is distinct from ends_at;`);
  record(
    'pre.backfill',
    'No planned row with transform_at <> ends_at',
    '0',
    String(offset[0]?.n ?? 'err'),
    offset[0]?.n === 0,
  );

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

    const { data: created, error: createError } = await people.alice.client.rpc('create_experience', {
      p_title: tag,
      p_description: 'lifecycle regression',
      p_location_name: null,
      p_starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      p_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      p_invitee_ids: null,
    });
    if (createError || !created) throw new Error(`create_experience: ${createError?.message}`);
    expId = created;
    const liveId = expId;

    runSql(`
insert into public.experience_participants (experience_id, user_id)
values ('${liveId}', '${people.bob.id}')
on conflict do nothing;
`);

    const row = runSql(`
select extract(epoch from (transform_at - ends_at)) as delta, organizer_id::text as org
from public.experiences where id = '${liveId}';`)[0];
    record('create.transform_at', 'New plan transform_at = ends_at', '0', String(row?.delta ?? 'err'), Number(row?.delta) === 0);

    const bobUpdate = await people.bob.client.rpc('update_experience', {
      p_id: liveId,
      p_title: tag,
      p_description: 'bob should not edit',
      p_location_name: null,
      p_starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      p_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    record(
      'before.bob_edit',
      'Non-leader cannot edit before start',
      'not allowed',
      rpcCode(bobUpdate.error),
      rpcCode(bobUpdate.error) === 'not allowed',
    );

    const aliceUpdate = await people.alice.client.rpc('update_experience', {
      p_id: liveId,
      p_title: `${tag} edited`,
      p_description: 'ok',
      p_location_name: null,
      p_starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      p_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    record('before.alice_edit', 'Leader can edit before start', 'ok', aliceUpdate.error ? rpcCode(aliceUpdate.error) : 'ok', !aliceUpdate.error);

    const chat = await people.bob.client.rpc('send_experience_message', {
      p_experience_id: liveId,
      p_body: 'hello before start',
    });
    record('before.chat', 'Participant can chat before start', 'ok', chat.error ? rpcCode(chat.error) : 'ok', !chat.error);

    runSql(`
update public.experiences
set starts_at = now() - interval '1 minute',
    ends_at = now() + interval '2 hours',
    transform_at = now() + interval '2 hours'
where id = '${liveId}';
`);

    const aliceEditLive = await people.alice.client.rpc('update_experience', {
      p_id: liveId,
      p_title: `${tag} live edit`,
      p_description: 'should fail',
      p_location_name: null,
      p_starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      p_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    record(
      'live.alice_edit',
      'Leader cannot edit after starts_at',
      'not allowed',
      rpcCode(aliceEditLive.error),
      rpcCode(aliceEditLive.error) === 'not allowed',
    );

    const aliceCancelLive = await people.alice.client.rpc('cancel_experience', { p_id: liveId });
    record(
      'live.alice_cancel',
      'Leader cannot cancel after starts_at',
      'not cancellable',
      rpcCode(aliceCancelLive.error),
      rpcCode(aliceCancelLive.error) === 'not cancellable',
    );

    const aliceRemoveLive = await people.alice.client.rpc('remove_experience_participant', {
      p_experience_id: liveId,
      p_user_id: people.bob.id,
    });
    record(
      'live.alice_remove',
      'Leader cannot remove participant after starts_at',
      'not allowed',
      rpcCode(aliceRemoveLive.error),
      rpcCode(aliceRemoveLive.error) === 'not allowed',
    );

    const aliceTransfer = await people.alice.client.rpc('transfer_experience_leadership', {
      p_experience_id: liveId,
      p_new_organizer_id: people.bob.id,
    });
    record(
      'live.transfer',
      'Leader can transfer during live window',
      'ok',
      aliceTransfer.error ? rpcCode(aliceTransfer.error) : 'ok',
      !aliceTransfer.error,
    );

    const bobChatLive = await people.bob.client.rpc('send_experience_message', {
      p_experience_id: liveId,
      p_body: 'hello during live',
    });
    record(
      'live.chat',
      'Participant can chat during live window',
      'ok',
      bobChatLive.error ? rpcCode(bobChatLive.error) : 'ok',
      !bobChatLive.error,
    );

    const bobPolicy = await people.bob.client.rpc('set_experience_chat_policy', {
      p_experience_id: liveId,
      p_policy: 'leader_only',
    });
    record(
      'live.chat_policy',
      'Leader can change chat_policy during live window',
      'ok',
      bobPolicy.error ? rpcCode(bobPolicy.error) : 'ok',
      !bobPolicy.error,
    );

    const stillThere = runSql(`
select count(*)::int as n from public.experience_participants
where experience_id = '${liveId}' and user_id = '${people.alice.id}';`)[0];
    record('live.alice_still_member', 'Transfer does not remove the former leader', '1', String(stillThere?.n), stillThere?.n === 1);
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
    'Throwaway users gone (baseline tagged counts)',
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
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
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
