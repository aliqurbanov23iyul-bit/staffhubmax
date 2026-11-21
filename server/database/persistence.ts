import type { PoolClient } from 'pg';

export const COLLECTIONS = {
  users: 'users', sessions: 'sessions', members: 'members', memberComments: 'member_comments',
  commentTemplates: 'comment_templates', reminders: 'reminders', operations: 'operations',
  operationHistory: 'operation_status_history', channels: 'chat_channels', chatMessages: 'chat_messages',
  breakSchedules: 'break_schedules', breakSessions: 'break_sessions', ftdEntries: 'ftd_entries',
  announcements: 'announcements', announcementAcks: 'announcement_acknowledgments',
  notifications: 'notifications', userSettings: 'user_settings', auditLogs: 'audit_logs',
} as const;

export type StateRow = Record<string, unknown>;
export type CollectionName = keyof typeof COLLECTIONS;
export type DatabaseState = Record<CollectionName, StateRow[]>;
export type ColumnTypes = Record<string, Record<string, string>>;
export const camelCase = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const quote = (key: string) => `"${key.replaceAll('"', '""')}"`;

export async function readState(client: Pick<PoolClient, 'query'>): Promise<DatabaseState> {
  // One round trip rather than a separate query for each collection.
  const query = Object.entries(COLLECTIONS).map(([key, table]) =>
    `SELECT '${key}' AS collection, COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) AS rows FROM ${quote(table)} t`,
  ).join(' UNION ALL ');
  const result = await client.query(query);
  return Object.fromEntries(result.rows.map(({ collection, rows }) => [collection,
    rows.map((row: StateRow) => Object.fromEntries(Object.entries(row).map(([key, value]) => [camelCase(key), value]))),
  ])) as DatabaseState;
}

export function diffState(before: DatabaseState, after: DatabaseState) {
  return Object.keys(COLLECTIONS).map((key) => {
    const name = key as CollectionName;
    const primaryKey = name === 'userSettings' ? 'userId' : 'id';
    const old = new Map(before[name].map((row) => [row[primaryKey], JSON.stringify(row)]));
    const current = new Set(after[name].map((row) => row[primaryKey]));
    return {
      name, table: COLLECTIONS[name], primaryKey,
      changed: after[name].filter((row) => old.get(row[primaryKey]) !== JSON.stringify(row)),
      removed: before[name].filter((row) => !current.has(row[primaryKey])),
    };
  });
}

export async function writeState(client: PoolClient, columns: ColumnTypes, before: DatabaseState, after: DatabaseState): Promise<boolean> {
  const diffs = diffState(before, after);
  // Insert parents before children; deletes run in reverse dependency order.
  for (const diff of diffs) {
    const tableColumns = columns[diff.table];
    if (!tableColumns) throw new Error(`Missing database metadata: ${diff.table}`);
    const primaryColumn = diff.primaryKey === 'userId' ? 'user_id' : 'id';
    for (const row of diff.changed) {
      const fields = Object.keys(tableColumns).filter((column) => row[camelCase(column)] !== undefined);
      const values = fields.map((column) => {
        const value = row[camelCase(column)];
        return tableColumns[column] === 'jsonb' || tableColumns[column] === 'json' ? JSON.stringify(value) : value;
      });
      const updates = fields.filter((column) => column !== primaryColumn).map((column) => `${quote(column)}=EXCLUDED.${quote(column)}`).join(',');
      await client.query(`INSERT INTO ${quote(diff.table)} (${fields.map(quote).join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (${quote(primaryColumn)}) DO ${updates ? `UPDATE SET ${updates}` : 'NOTHING'}`, values);
    }
  }
  for (const diff of [...diffs].reverse()) {
    for (const row of diff.removed) {
      await client.query(`DELETE FROM ${quote(diff.table)} WHERE ${quote(diff.primaryKey === 'userId' ? 'user_id' : 'id')}=$1`, [row[diff.primaryKey]]);
    }
  }
  return diffs.some((diff) => diff.name !== 'sessions' && (diff.changed.length || diff.removed.length));
}
