import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { COLLECTIONS, diffState, readState, writeState, type DatabaseState, type ColumnTypes } from '../database/persistence';
import { AppDatabaseStore } from '../database/store';

const empty = () => Object.fromEntries(Object.keys(COLLECTIONS).map((key) => [key, []])) as unknown as DatabaseState;

test('persistence writes changed rows only and serializes JSON fields for PostgreSQL', async () => {
  const before = empty(), after = empty();
  before.users = [{ id: 'user', displayName: 'Existing' }];
  after.users = structuredClone(before.users);
  after.chatMessages = [{ id: 'msg', channelId: 'general', mentions: ['user'], reactions: [] }];
  const queries: {sql: string; values: unknown[]}[] = [];
  const client = { query: async (sql: string, values: unknown[]) => { queries.push({ sql, values }); return {rows: []}; } } as unknown as PoolClient;
  const columns: ColumnTypes = Object.fromEntries(Object.values(COLLECTIONS).map((name) => [name, {}]));
  columns.chat_messages = { id: 'text', channel_id: 'text', mentions: 'jsonb', reactions: 'jsonb' };
  await writeState(client, columns, before, after);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO "chat_messages"/);
  assert.deepEqual(queries[0].values, ['msg', 'general', '["user"]', '[]']);
});

test('persistence removes children before their parents and uses user_id settings key', async () => {
  const before = empty(), after = empty();
  before.users = [{ id: 'user' }];
  before.members = [{ id: 'member', ownerId: 'user' }];
  before.userSettings = [{ userId: 'user' }];
  const sql: string[] = [];
  const client = { query: async (query: string) => { sql.push(query); return { rows: [] }; } } as unknown as PoolClient;
  await writeState(client, Object.fromEntries(Object.values(COLLECTIONS).map((name) => [name, {}])), before, after);
  assert.match(sql[0], /user_settings.*user_id/);
  assert.match(sql.at(-1)!, /DELETE FROM "users"/);
  assert.equal(diffState(before, after).find((diff) => diff.name === 'members')?.removed.length, 1);
});

test('hydration maps stored columns to app properties in a single query', async () => {
  let calls = 0;
  const client = { query: async () => { calls++; return { rows: [{ collection: 'ftdEntries', rows: [{ member_username: 'member', amount: 125.5, created_at: '2026-11-21T10:00:00Z' }] }] }; } } as unknown as PoolClient;
  const state = await readState(client);
  assert.equal(calls, 1);
  assert.equal(state.ftdEntries[0].memberUsername, 'member');
  assert.equal(state.ftdEntries[0].amount, 125.5);
});

test('a failed request rolls back its database transaction and in-memory changes', async () => {
  const store = new AppDatabaseStore();
  const commands: string[] = [];
  const client = { query: async (sql: string) => {
    commands.push(sql);
    if (sql.includes('AS collection')) return {rows: Object.keys(COLLECTIONS).map((collection) => ({ collection, rows: [] }))};
    if (sql.startsWith('SELECT revision')) return {rows: [{revision: 0}]};
    return {rows: []};
  }, release: () => {} };
  store.pool = { connect: async () => client } as unknown as NonNullable<typeof store.pool>;
  await assert.rejects(store.transaction(async () => {
    store.members.push({ id: 'never-committed' } as typeof store.members[number]);
    throw new Error('save failed');
  }), /save failed/);
  assert.deepEqual(store.members, []);
  assert.ok(commands.includes('ROLLBACK'));
  assert.ok(!commands.includes('COMMIT'));
});
