import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
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
      await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      this.pool = pool;
      await this.bootstrapPostgresMetadata();
      await this.loadFromPostgres();
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

  private async loadFromPostgres(): Promise<void> {
    if (!this.pool) throw new Error('PostgreSQL bağlantısı kurulmadı.');
    const collections = {
      users: 'users', members: 'members', memberComments: 'member_comments',
      commentTemplates: 'comment_templates', reminders: 'reminders', operations: 'operations',
      operationHistory: 'operation_status_history', channels: 'chat_channels', chatMessages: 'chat_messages',
      breakSchedules: 'break_schedules', breakSessions: 'break_sessions', ftdEntries: 'ftd_entries',
      announcements: 'announcements', announcementAcks: 'announcement_acknowledgments',
      notifications: 'notifications', userSettings: 'user_settings', auditLogs: 'audit_logs',
    } as const;
    for (const [collection, table] of Object.entries(collections)) {
      const result = await this.pool.query(`SELECT * FROM ${table}`);
      const rows = result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        value instanceof Date ? value.toISOString() : ['amount'].includes(key) && value !== null ? Number(value) : value,
      ])));
      Object.assign(this, { [collection]: rows });
    }
    for (const user of this.users) this.ensureDefaultTemplatesAndSettings(user);
  }
  public async persistUser(user: User): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO users (id, username, display_name, role, team, password_hash, is_active, must_change_password, avatar_color, avatar_url, last_login_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         team = EXCLUDED.team,
         password_hash = EXCLUDED.password_hash,
         is_active = EXCLUDED.is_active,
         must_change_password = EXCLUDED.must_change_password,
         avatar_color = EXCLUDED.avatar_color,
         avatar_url = EXCLUDED.avatar_url,
         last_login_at = EXCLUDED.last_login_at`,
      [
        user.id,
        user.username,
        user.displayName,
        user.role,
        user.team,
        user.passwordHash,
        user.isActive,
        user.mustChangePassword,
        user.avatarColor,
        user.avatarUrl ?? null,
        user.lastLoginAt,
        user.createdAt,
      ],
    );
  }

  public async persistAuditLog(log: AuditLog): Promise<void> {
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) this.auditLogs.length = 500;
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_type, target_id, details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [log.id, log.actorId, log.actorName, log.actorRole, log.action, log.targetType, log.targetId, log.details, log.createdAt],
    );
  }

  public ensureTodayBreakSessionsForUser(user: User): BreakSession[] {
    const todayKey = getTodayDateKey();
    const userSchedules = this.breakSchedules
      .filter((s) => s.userId === user.id)
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
