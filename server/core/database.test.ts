import test from 'node:test';
import assert from 'node:assert/strict';
import { AppDatabaseStore } from '../database/store';

test('database configuration is required and never generates sample accounts or activity', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const store = new AppDatabaseStore();
    await assert.rejects(store.init(), /DATABASE_URL/);
    assert.equal(store.databaseConnected, false);
    for (const collection of [store.users, store.members, store.chatMessages, store.operations, store.ftdEntries, store.announcements, store.notifications, store.auditLogs]) {
      assert.deepEqual(collection, []);
    }
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
