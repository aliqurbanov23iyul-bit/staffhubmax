-- MAXBAHIS STAFF HUB — PostgreSQL / Neon Compatible Schema

CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  group_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_name TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_name, permission_key)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES roles(name),
  team TEXT NOT NULL DEFAULT 'Genel',
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_color TEXT NOT NULL DEFAULT '#8B5CF6',
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  normalized_username TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  owner_name TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'Genel',
  real_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Yeni',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  latest_comment TEXT NOT NULL DEFAULT '',
  latest_comment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_owner ON members(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_norm_username ON members(normalized_username);

CREATE TABLE IF NOT EXISTS member_comments (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  member_username TEXT,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES users(id),
  manager_name TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'Genel',
  member_username TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  raw_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Bekliyor',
  claimed_by_admin_id TEXT REFERENCES users(id),
  claimed_by_admin_name TEXT,
  claimed_at TIMESTAMPTZ,
  resolved_by_admin_id TEXT REFERENCES users(id),
  resolved_by_admin_name TEXT,
  resolved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_manager ON operations(manager_id);

CREATE TABLE IF NOT EXISTS operation_status_history (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  team_scope TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  sender_avatar_color TEXT NOT NULL DEFAULT '#8B5CF6',
  content TEXT NOT NULL,
  reply_to_id TEXT,
  reply_preview TEXT,
  mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS break_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'Genel',
  break_number INTEGER NOT NULL,
  scheduled_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  extra_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS break_sessions (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES break_schedules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'Genel',
  break_number INTEGER NOT NULL,
  scheduled_time TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  extra_minutes INTEGER NOT NULL DEFAULT 0,
  date_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planlandı',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  overdue_alert_sent BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ftd_entries (
  id TEXT PRIMARY KEY,
  manager_id TEXT NOT NULL REFERENCES users(id),
  manager_name TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT 'Genel',
  member_username TEXT NOT NULL,
  normalized_member_username TEXT UNIQUE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  status TEXT NOT NULL DEFAULT 'Onay Bekliyor',
  approved_by_admin_id TEXT REFERENCES users(id),
  approved_by_admin_name TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal',
  target_audience TEXT NOT NULL DEFAULT 'Tümü',
  author_id TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcement_acknowledgments (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  link_page TEXT NOT NULL,
  link_entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme_mode TEXT NOT NULL DEFAULT 'dark',
  theme_preset TEXT NOT NULL DEFAULT 'mor-neon',
  custom_accent_color TEXT NOT NULL DEFAULT '#8B5CF6',
  font_size TEXT NOT NULL DEFAULT 'normal',
  compact_mode BOOLEAN NOT NULL DEFAULT FALSE,
  sidebar_width TEXT NOT NULL DEFAULT 'normal',
  animation_intensity TEXT NOT NULL DEFAULT 'full',
  background_effects BOOLEAN NOT NULL DEFAULT TRUE,
  dashboard_layout TEXT NOT NULL DEFAULT 'balanced',
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notification_volume INTEGER NOT NULL DEFAULT 75,
  notify_chat BOOLEAN NOT NULL DEFAULT TRUE,
  notify_operations BOOLEAN NOT NULL DEFAULT TRUE,
  notify_breaks BOOLEAN NOT NULL DEFAULT TRUE,
  notify_announcements BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_mode BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
