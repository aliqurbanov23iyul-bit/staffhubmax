import {
  renderAuditLogsPage,
  renderPermissionsPage,
  renderReportsPage,
  renderStaffManagementPage,
} from './pages/admin.js';
import { renderAllOperationsPage } from './pages/allOperations.js';
import { renderAnnouncementsPage } from './pages/announcements.js';
import { renderBreaksPage } from './pages/breaks.js';
import { renderDashboardPage } from './pages/dashboard.js';
import { renderFtdPage } from './pages/ftd.js';
import { renderGeneralChatPage } from './pages/generalChat.js';
import { renderMembersPage } from './pages/members.js';
import { renderOperationsChatPage } from './pages/operationsChat.js';
import {
  renderNotificationsPage,
  renderProfilePage,
  renderSettingsPage,
} from './pages/settings.js';
import { clientState } from './store.js';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  members: 'Üyelerim',
  'operations-chat': 'İşlem Chat',
  'general-chat': 'Genel Chat',
  ftd: 'FTD Tablosu',
  breaks: 'Mola Yönetimi',
  announcements: 'Duyurular',
  notifications: 'Bildirimler',
  'staff-management': 'Personel Yönetimi',
  'all-operations': 'Tüm İşlemler',
  'break-control': 'Mola Kontrolü',
  'ftd-approvals': 'FTD Onayları',
  'announcement-management': 'Duyuru Yönetimi',
  reports: 'Raporlar',
  'audit-logs': 'Sistem Kayıtları',
  permissions: 'Yetki Yönetimi',
  settings: 'Ayarlar',
  profile: 'Profil',
};

export function getPageTitle(pageId) {
  return PAGE_TITLES[pageId] || 'MAXBAHIS STAFF HUB';
}

export function isPageAuthorized(pageId) {
  return clientState.navItems.some((item) => item.id === pageId);
}

export async function mountPage(pageId, viewport, navigateFn) {
  switch (pageId) {
    case 'dashboard':
      return renderDashboardPage(viewport, navigateFn);
    case 'members':
      return renderMembersPage(viewport);
    case 'operations-chat':
      return renderOperationsChatPage(viewport);
    case 'general-chat':
      return renderGeneralChatPage(viewport);
    case 'ftd':
      return renderFtdPage(viewport, { isApprovalView: false });
    case 'ftd-approvals':
      return renderFtdPage(viewport, { isApprovalView: true });
    case 'breaks':
      return renderBreaksPage(viewport, { isAdminControl: false });
    case 'break-control':
      return renderBreaksPage(viewport, { isAdminControl: true });
    case 'announcements':
      return renderAnnouncementsPage(viewport, { manageMode: false });
    case 'announcement-management':
      return renderAnnouncementsPage(viewport, { manageMode: true });
    case 'notifications':
      return renderNotificationsPage(viewport, navigateFn);
    case 'staff-management':
      return renderStaffManagementPage(viewport);
    case 'all-operations':
      return renderAllOperationsPage(viewport);
    case 'reports':
      return renderReportsPage(viewport);
    case 'audit-logs':
      return renderAuditLogsPage(viewport);
    case 'permissions':
      return renderPermissionsPage(viewport);
    case 'settings':
      return renderSettingsPage(viewport);
    case 'profile':
      return renderProfilePage(viewport, navigateFn);
    default:
      return renderDashboardPage(viewport, navigateFn);
  }
}
