import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { COLLECTIONS, readState, writeState, type DatabaseState, type ColumnTypes } from './persistence';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  ALL_ROLES,
} from '../core/permissions';
import type {
  Announcement,
  AnnouncementAck,
  AppNotification,
  AuditLog,
  BreakSchedule,
  BreakSession,
  ChatChannel,
  ChatMessage,
  CommentTemplate,
  FtdEntry,
  Member,
  MemberComment,
  Operation,
  OperationHistoryEntry,
  PermissionKey,
  Reminder,
  SafeUser,
  SessionRecord,
  User,
  UserRole,
  UserSettings,
} from '../core/types';
import { getTodayDateKey } from '../core/dates';
import crypto from 'node:crypto';
import { hashPassword, validatePasswordStrength } from '../core/password';

export function sanitizeUser(user: User): SafeUser {
  const { passwordHash: _ignored, ...safe } = user;
  return safe;
}

export class AppDatabaseStore {
  public mode: 'postgres' = 'postgres';
  public databaseConnected = false;
  public pool: Pool | null = null;

  public users: User[] = [];
  public sessions: SessionRecord[] = [];
  public rolePermissions: Record<UserRole, PermissionKey[]> = {
    'Super Admin': [...DEFAULT_ROLE_PERMISSIONS['Super Admin']],
    'İşlem Admini': [...DEFAULT_ROLE_PERMISSIONS['İşlem Admini']],
    'Takım Lideri': [...DEFAULT_ROLE_PERMISSIONS['Takım Lideri']],
    'Menecer': [...DEFAULT_ROLE_PERMISSIONS['Menecer']],
  };
  public members: Member[] = [];
  public memberComments: MemberComment[] = [];
  public commentTemplates: CommentTemplate[] = [];
  public reminders: Reminder[] = [];
  public operations: Operation[] = [];
  public operationHistory: OperationHistoryEntry[] = [];
  public channels: ChatChannel[] = [];
  public chatMessages: ChatMessage[] = [];
  public breakSchedules: BreakSchedule[] = [];
  public breakSessions: BreakSession[] = [];
  public ftdEntries: FtdEntry[] = [];
  public announcements: Announcement[] = [];
  public announcementAcks: AnnouncementAck[] = [];
  public notifications: AppNotification[] = [];
  public userSettings: UserSettings[] = [];
  public auditLogs: AuditLog[] = [];

  async init(): Promise<void> {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!dbUrl) throw new Error('DATABASE_URL zorunludur. PostgreSQL bağlantısını yapılandırın.');
    const pool = new Pool({ connectionString: dbUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
    try {
      await pool.query('SELECT 1');
      const schemaPath = path.join(process.cwd(), 'server', 'database', 'schema.sql');
      const schemaClient = await pool.connect();
      try {
        await schemaClient.query('BEGIN');
        await schemaClient.query('SELECT pg_advisory_xact_lock(734221901)');
        await schemaClient.query(fs.readFileSync(schemaPath, 'utf8'));
        await schemaClient.query('COMMIT');
      } catch (error) {
        await schemaClient.query('ROLLBACK');
        throw error;
      } finally { schemaClient.release(); }
      this.pool = pool;
      await this.bootstrapPostgresMetadata();
      await this.loadFromPostgres();
      await this.transaction(async () => {
        if (this.users.length === 0 && process.env.INITIAL_ADMIN_USERNAME && process.env.INITIAL_ADMIN_PASSWORD) {
          const password = process.env.INITIAL_ADMIN_PASSWORD;
          if (!validatePasswordStrength(password).valid) throw new Error('Initial administrator password is too weak.');
          const user: User = {
            id: `usr_${crypto.randomUUID()}`, username: process.env.INITIAL_ADMIN_USERNAME.trim().toLowerCase(),
            displayName: process.env.INITIAL_ADMIN_NAME || 'Yönetici', role: 'Super Admin', team: 'Yönetim',
            passwordHash: hashPassword(password), isActive: true, mustChangePassword: true,
            avatarColor: '#8B5CF6', lastLoginAt: null, createdAt: new Date().toISOString(),
          };
          this.users.push(user);
          this.ensureDefaultTemplatesAndSettings(user);
        }
        if (!this.channels.some((channel) => channel.slug === 'genel')) {
          this.channels.push({ id: 'ch_genel', slug: 'genel', name: 'Genel', description: 'Ekip iletişim kanalı', teamScope: null, isPrivate: false });
        }
      });
      this.databaseConnected = true;
    } catch (error) {
      this.databaseConnected = false;
      this.pool = null;
      await pool.end();
      throw error;
    }
  }
  private async bootstrapPostgresMetadata(): Promise<void> {
    if (!this.pool) return;
    for (const role of ALL_ROLES) {
      await this.pool.query(
        'INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [role, `${role} rolü`],
      );
    }
    for (const perm of ALL_PERMISSIONS) {
      await this.pool.query(
        'INSERT INTO permissions (key, label, group_name) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
        [perm.key, perm.label, perm.group],
      );
    }
    const existingRp = await this.pool.query('SELECT COUNT(*)::int AS cnt FROM role_permissions');
    if (existingRp.rows[0]?.cnt === 0) {
      for (const role of ALL_ROLES) {
        for (const perm of DEFAULT_ROLE_PERMISSIONS[role]) {
          await this.pool.query(
            'INSERT INTO role_permissions (role_name, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [role, perm],
          );
        }
      }
    } else {
      const rpRows = await this.pool.query('SELECT role_name, permission_key FROM role_permissions');
      const fresh: Record<UserRole, PermissionKey[]> = {
        'Super Admin': [],
        'İşlem Admini': [],
        'Takım Lideri': [],
        'Menecer': [],
      };
      for (const r of rpRows.rows) {
        const rn = r.role_name as UserRole;
        if (fresh[rn]) fresh[rn].push(r.permission_key as PermissionKey);
      }
      this.rolePermissions = fresh;
    }
  }

  private columns: ColumnTypes = {};
  private queue: Promise<unknown> = Promise.resolve();
  private transactionClient: PoolClient | null = null;
  public revision = 0;

  private snapshot(): DatabaseState {
    return JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(COLLECTIONS).map((key) => [key, this[key as keyof typeof COLLECTIONS]])))) as DatabaseState;
  }

  private async loadFromPostgres(): Promise<void> {
    if (!this.pool) throw new Error('PostgreSQL bağlantısı kurulmadı.');
    const metadata = await this.pool.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema=current_schema()`);
    for (const row of metadata.rows) {
      (this.columns[row.table_name] ||= {})[row.column_name] = row.data_type;
    }
    Object.assign(this, await readState(this.pool));
  }

  // Existing route logic runs against a fresh database snapshot under one cross-instance lock.
  // The response is released only after all changed records commit successfully.
  public async transaction<T>(work: () => Promise<T>): Promise<T> {
    const run = async () => {
      if (!this.pool) throw new Error('PostgreSQL bağlantısı kurulmadı.');
      const client = await this.pool.connect();
      let before: DatabaseState | undefined;
      const oldPermissions = JSON.parse(JSON.stringify(this.rolePermissions));
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(734221901)");
        Object.assign(this, await readState(client));
        const permissions = await client.query('SELECT role_name, permission_key FROM role_permissions');
        for (const role of ALL_ROLES) this.rolePermissions[role] = [];
        for (const row of permissions.rows) this.rolePermissions[row.role_name as UserRole]?.push(row.permission_key as PermissionKey);
        const revision = await client.query('SELECT revision FROM staffhub_sync WHERE id=1');
        this.revision = Number(revision.rows[0]?.revision || 0);
        before = this.snapshot();
        const previousPermissions = JSON.stringify(this.rolePermissions);
        this.transactionClient = client;
        const result = await work();
        const changed = await writeState(client, this.columns, before, this.snapshot());
        const permissionsChanged = previousPermissions !== JSON.stringify(this.rolePermissions);
        if (permissionsChanged) {
          await client.query('DELETE FROM role_permissions');
          for (const role of ALL_ROLES) for (const permission of this.rolePermissions[role]) {
            await client.query('INSERT INTO role_permissions (role_name,permission_key) VALUES ($1,$2)', [role, permission]);
          }
        }
        if (changed || permissionsChanged) await client.query('UPDATE staffhub_sync SET revision=revision+1 WHERE id=1');
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (before) Object.assign(this, before);
        this.rolePermissions = oldPermissions;
        throw error;
      } finally {
        this.transactionClient = null;
        client.release();
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  public async persistUser(user: User): Promise<void> {
    if (!this.transactionClient) throw new Error('User writes require a database transaction.');
    const index = this.users.findIndex((item) => item.id === user.id);
    if (index < 0) this.users.push(user);
    else this.users[index] = user;
  }

  public async persistAuditLog(log: AuditLog): Promise<void> {
    if (!this.transactionClient) throw new Error('Audit writes require a database transaction.');
    this.auditLogs.unshift(log);
  }
  public ensureTodayBreakSessionsForUser(user: User): BreakSession[] {
    const todayKey = getTodayDateKey();
    const userSchedules = this.breakSchedules
      .filter((s) => s.userId === user.id && s.isActive !== false)
      .sort((a, b) => a.breakNumber - b.breakNumber);

    for (const sched of userSchedules) {
      const exists = this.breakSessions.find(
        (bs) => bs.scheduleId === sched.id && bs.dateKey === todayKey,
      );
      if (!exists) {
        this.breakSessions.push({
          id: `bses_${sched.id}_${todayKey}`,
          scheduleId: sched.id,
          userId: user.id,
          userName: user.displayName,
          team: user.team,
          breakNumber: sched.breakNumber,
          scheduledTime: sched.scheduledTime,
          plannedMinutes: sched.durationMinutes,
          extraMinutes: sched.extraMinutes,
          dateKey: todayKey,
          status: 'Planlandı',
          startedAt: null,
          endedAt: null,
          overdueAlertSent: false,
        });
      }
    }

    return this.breakSessions
      .filter((bs) => bs.userId === user.id && bs.dateKey === todayKey)
      .sort((a, b) => a.breakNumber - b.breakNumber);
  }

  public ensureDefaultSchedulesForNewUser(user: User): void {
    const defaults = [
      { num: 1, time: '11:00', duration: 15 },
      { num: 2, time: '13:30', duration: 30 },
      { num: 3, time: '16:00', duration: 15 },
      { num: 4, time: '19:00', duration: 15 },
    ];
    const nowIso = new Date().toISOString();
    for (const slot of defaults) {
      this.breakSchedules.push({
        id: `bs_${user.id}_${slot.num}`,
        userId: user.id,
        userName: user.displayName,
        team: user.team,
        breakNumber: slot.num,
        scheduledTime: slot.time,
        durationMinutes: slot.duration,
        extraMinutes: 0,
        createdAt: nowIso,
      });
    }
    this.ensureTodayBreakSessionsForUser(user);
  }

  public ensureDefaultTemplatesAndSettings(user: User): void {
    if (!this.userSettings.some((s) => s.userId === user.id)) {
      this.userSettings.push({
        userId: user.id,
        themeMode: 'dark',
        themePreset: 'mor-neon',
        customAccentColor: '#8B5CF6',
        fontSize: 'normal',
        compactMode: false,
        sidebarWidth: 'normal',
        animationIntensity: 'full',
        backgroundEffects: true,
        dashboardLayout: 'balanced',
        soundEnabled: true,
        notificationVolume: 75,
        notifyChat: true,
        notifyOperations: true,
        notifyBreaks: true,
        notifyAnnouncements: true,
        desktopNotifications: false,
        quietMode: false,
      });
    }
  }
}

export const store = new AppDatabaseStore();
