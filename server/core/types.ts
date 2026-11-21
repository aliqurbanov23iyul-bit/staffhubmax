export type UserRole = 'Super Admin' | 'İşlem Admini' | 'Takım Lideri' | 'Menecer';

export type MemberStatus =
  | 'Yeni'
  | 'Takipte'
  | 'Aranacak'
  | 'VIP'
  | 'Ulaşılamadı'
  | 'Pasif';

export type OperationStatus =
  | 'Bekliyor'
  | 'İşleme Alındı'
  | 'Tamamlandı'
  | 'Reddedildi';

export type BreakStatus =
  | 'Planlandı'
  | 'Mola Saati Geldi'
  | 'Molada'
  | 'Tamamlandı'
  | 'Gecikti';

export type FtdStatus = 'Onay Bekliyor' | 'Onaylandı';

export type AnnouncementPriority = 'Normal' | 'Önemli' | 'Acil';

export type ThemePreset =
  | 'mor-neon'
  | 'ocean-blue'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'midnight';

export type PermissionKey =
  | 'dashboard.view'
  | 'members.manage_own'
  | 'members.inspect_all'
  | 'operations.create'
  | 'operations.process'
  | 'operations.inspect_all'
  | 'chat.general'
  | 'chat.mass_mention'
  | 'chat.moderate'
  | 'breaks.manage_own'
  | 'breaks.control_all'
  | 'ftd.create'
  | 'ftd.approve'
  | 'announcements.view'
  | 'announcements.manage'
  | 'staff.manage'
  | 'staff.inspect'
  | 'reports.view'
  | 'audit.view'
  | 'permissions.manage';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  team: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  avatarColor: string;
  avatarUrl?: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SafeUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  team: string;
  isActive: boolean;
  mustChangePassword: boolean;
  avatarColor: string;
  avatarUrl?: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  userId: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface Member {
  id: string;
  username: string;
  normalizedUsername: string;
  ownerId: string;
  ownerName: string;
  team: string;
  realName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  status: MemberStatus;
  isPinned: boolean;
  isArchived: boolean;
  latestComment: string;
  latestCommentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberComment {
  id: string;
  memberId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface CommentTemplate {
  id: string;
  userId: string;
  text: string;
  sortOrder: number;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  memberId: string | null;
  memberUsername: string | null;
  title: string;
  dueAt: string;
  isCompleted: boolean;
  notified: boolean;
  createdAt: string;
}

export interface OperationHistoryEntry {
  id: string;
  operationId: string;
  status: OperationStatus;
  actorId: string;
  actorName: string;
  note: string;
  createdAt: string;
}

export interface Operation {
  id: string;
  managerId: string;
  managerName: string;
  team: string;
  memberUsername: string;
  operationType: string;
  rawMessage: string;
  status: OperationStatus;
  claimedByAdminId: string | null;
  claimedByAdminName: string | null;
  claimedAt: string | null;
  resolvedByAdminId: string | null;
  resolvedByAdminName: string | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ChatChannel {
  id: string;
  slug: string;
  name: string;
  description: string;
  teamScope: string | null;
  isPrivate: boolean;
}

export interface ChatReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderAvatarColor: string;
  content: string;
  replyToId: string | null;
  replyPreview: string | null;
  mentions: string[];
  reactions: ChatReaction[];
  attachments: ChatAttachment[];
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BreakSchedule {
  id: string;
  userId: string;
  userName: string;
  team: string;
  breakNumber: number;
  scheduledTime: string; // HH:MM
  durationMinutes: number;
  extraMinutes: number;
  createdAt: string;
}

export interface BreakSession {
  id: string;
  scheduleId: string;
  userId: string;
  userName: string;
  team: string;
  breakNumber: number;
  scheduledTime: string;
  plannedMinutes: number;
  extraMinutes: number;
  dateKey: string; // YYYY-MM-DD
  status: BreakStatus;
  startedAt: string | null;
  endedAt: string | null;
  overdueAlertSent: boolean;
}

export interface FtdEntry {
  id: string;
  managerId: string;
  managerName: string;
  team: string;
  memberUsername: string;
  normalizedMemberUsername: string;
  amount: number;
  currency: string;
  status: FtdStatus;
  approvedByAdminId: string | null;
  approvedByAdminName: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  targetAudience: string; // 'Tümü' | 'Menecer' | 'İşlem Admini' | 'Takım Lideri' | team name
  authorId: string;
  authorName: string;
  publishedAt: string;
  createdAt: string;
}

export interface AnnouncementAck {
  id: string;
  announcementId: string;
  userId: string;
  userName: string;
  acknowledgedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type:
    | 'chat'
    | 'operation_accepted'
    | 'operation_completed'
    | 'operation_rejected'
    | 'break_due'
    | 'break_overdue'
    | 'ftd_approved'
    | 'announcement'
    | 'reminder'
    | 'mention';
  title: string;
  description: string;
  linkPage: string;
  linkEntityId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  themeMode: 'dark' | 'light';
  themePreset: ThemePreset;
  customAccentColor: string;
  fontSize: 'compact' | 'normal' | 'large';
  compactMode: boolean;
  sidebarWidth: 'narrow' | 'normal' | 'wide';
  animationIntensity: 'full' | 'subtle' | 'reduced';
  backgroundEffects: boolean;
  dashboardLayout: 'balanced' | 'dense';
  soundEnabled: boolean;
  notificationVolume: number; // 0..100
  notifyChat: boolean;
  notifyOperations: boolean;
  notifyBreaks: boolean;
  notifyAnnouncements: boolean;
  desktopNotifications: boolean;
  quietMode: boolean;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}
