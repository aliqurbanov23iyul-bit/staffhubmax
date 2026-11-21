import type { PermissionKey, UserRole } from './types';

export const ALL_ROLES: UserRole[] = [
  'Super Admin',
  'İşlem Admini',
  'Takım Lideri',
  'Menecer',
];

export const ALL_PERMISSIONS: { key: PermissionKey; label: string; group: string }[] = [
  { key: 'dashboard.view', label: 'Dashboard Görüntüleme', group: 'Genel' },
  { key: 'members.manage_own', label: 'Kendi Üyelerini Yönetme', group: 'Üye CRM' },
  { key: 'members.inspect_all', label: 'Tüm Personel Üyelerini İnceleme', group: 'Üye CRM' },
  { key: 'operations.create', label: 'İşlem Talebi Oluşturma', group: 'Operasyon' },
  { key: 'operations.process', label: 'İşlem Taleplerini Sonuçlandırma', group: 'Operasyon' },
  { key: 'operations.inspect_all', label: 'Tüm İşlemler Tablosu ve Denetim', group: 'Operasyon' },
  { key: 'chat.general', label: 'Genel Chat Kullanımı', group: 'İletişim' },
  { key: 'chat.mass_mention', label: '@admins ve @everyone Etiketleme', group: 'İletişim' },
  { key: 'chat.moderate', label: 'Chat Mesaj Sabitleme / Moderasyon', group: 'İletişim' },
  { key: 'breaks.manage_own', label: 'Kendi Molalarını Başlatma / Bitirme', group: 'Mola' },
  { key: 'breaks.control_all', label: 'Mola Kontrolü ve Süre Düzenleme', group: 'Mola' },
  { key: 'ftd.create', label: 'FTD Kaydı Ekleme', group: 'FTD' },
  { key: 'ftd.approve', label: 'FTD Onaylama', group: 'FTD' },
  { key: 'announcements.view', label: 'Duyuruları Görüntüleme ve Onaylama', group: 'Duyuru' },
  { key: 'announcements.manage', label: 'Duyuru Yayınlama ve Takip', group: 'Duyuru' },
  { key: 'staff.manage', label: 'Personel Hesabı Oluşturma ve Yönetme', group: 'Yönetim' },
  { key: 'staff.inspect', label: 'Personel Kayıtlarını İnceleme', group: 'Yönetim' },
  { key: 'reports.view', label: 'Raporları Görüntüleme', group: 'Yönetim' },
  { key: 'audit.view', label: 'Sistem Kayıtlarını Görüntüleme', group: 'Yönetim' },
  { key: 'permissions.manage', label: 'Yetki Matrisi Yönetimi', group: 'Yönetim' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  'Super Admin': ALL_PERMISSIONS.map((p) => p.key),
  'İşlem Admini': [
    'dashboard.view',
    'members.inspect_all',
    'operations.process',
    'operations.inspect_all',
    'chat.general',
    'chat.mass_mention',
    'chat.moderate',
    'breaks.manage_own',
    'breaks.control_all',
    'ftd.approve',
    'announcements.view',
    'announcements.manage',
    'staff.manage',
    'staff.inspect',
    'reports.view',
  ],
  'Takım Lideri': [
    'dashboard.view',
    'members.manage_own',
    'members.inspect_all',
    'operations.create',
    'chat.general',
    'chat.mass_mention',
    'breaks.manage_own',
    'breaks.control_all',
    'ftd.create',
    'announcements.view',
    'staff.inspect',
    'reports.view',
  ],
  'Menecer': [
    'dashboard.view',
    'members.manage_own',
    'operations.create',
    'chat.general',
    'breaks.manage_own',
    'ftd.create',
    'announcements.view',
  ],
};

export interface NavItem {
  id: string;
  label: string;
  section: 'main' | 'admin' | 'bottom';
  icon: string;
  requiredPermission?: PermissionKey;
}

export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  // MAIN MENU
  { id: 'dashboard', label: 'Dashboard', section: 'main', icon: 'dashboard', requiredPermission: 'dashboard.view' },
  { id: 'members', label: 'Üyelerim', section: 'main', icon: 'users', requiredPermission: 'members.manage_own' },
  { id: 'operations-chat', label: 'İşlem Chat', section: 'main', icon: 'bolt' },
  { id: 'general-chat', label: 'Genel Chat', section: 'main', icon: 'chat', requiredPermission: 'chat.general' },
  { id: 'ftd', label: 'FTD Tablosu', section: 'main', icon: 'wallet' },
  { id: 'breaks', label: 'Mola Yönetimi', section: 'main', icon: 'clock', requiredPermission: 'breaks.manage_own' },
  { id: 'announcements', label: 'Duyurular', section: 'main', icon: 'megaphone', requiredPermission: 'announcements.view' },
  { id: 'notifications', label: 'Bildirimler', section: 'main', icon: 'bell' },

  // ADMIN MENU
  { id: 'staff-management', label: 'Personel Yönetimi', section: 'admin', icon: 'shield-user', requiredPermission: 'staff.inspect' },
  { id: 'all-operations', label: 'Tüm İşlemler', section: 'admin', icon: 'table', requiredPermission: 'operations.inspect_all' },
  { id: 'break-control', label: 'Mola Kontrolü', section: 'admin', icon: 'timer', requiredPermission: 'breaks.control_all' },
  { id: 'ftd-approvals', label: 'FTD Onayları', section: 'admin', icon: 'check-circle', requiredPermission: 'ftd.approve' },
  { id: 'announcement-management', label: 'Duyuru Yönetimi', section: 'admin', icon: 'edit-note', requiredPermission: 'announcements.manage' },
  { id: 'reports', label: 'Raporlar', section: 'admin', icon: 'chart', requiredPermission: 'reports.view' },
  { id: 'audit-logs', label: 'Sistem Kayıtları', section: 'admin', icon: 'history', requiredPermission: 'audit.view' },
  { id: 'permissions', label: 'Yetki Yönetimi', section: 'admin', icon: 'key', requiredPermission: 'permissions.manage' },

  // BOTTOM MENU
  { id: 'settings', label: 'Ayarlar', section: 'bottom', icon: 'settings' },
  { id: 'profile', label: 'Profil', section: 'bottom', icon: 'user' },
];

export const EXCLUDED_MODULES = [
  'Verimlilik',
  'Görevler',
  'Vardiya Takvimi',
  'Hızlı Notlar',
  'Bilgi Bankası',
];

export function hasPermission(
  role: UserRole,
  permission: PermissionKey,
  matrix: Record<UserRole, PermissionKey[]> = DEFAULT_ROLE_PERMISSIONS,
): boolean {
  const list = matrix[role] ?? [];
  return list.includes(permission);
}

export function getAuthorizedNavItems(
  role: UserRole,
  matrix: Record<UserRole, PermissionKey[]> = DEFAULT_ROLE_PERMISSIONS,
): NavItem[] {
  return SIDEBAR_NAV_ITEMS.filter((item) => {
    if (item.id === 'operations-chat') {
      return (
        hasPermission(role, 'operations.create', matrix) ||
        hasPermission(role, 'operations.process', matrix)
      );
    }
    if (item.id === 'ftd') {
      return (
        hasPermission(role, 'ftd.create', matrix) ||
        hasPermission(role, 'ftd.approve', matrix)
      );
    }
    if (!item.requiredPermission) return true;
    return hasPermission(role, item.requiredPermission, matrix);
  });
}
