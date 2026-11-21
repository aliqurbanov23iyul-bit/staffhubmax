import { apiRequest } from './api.js';
import { notifyUserEvent } from './notifications.js';

export const clientState = {
  user: null,
  settings: null,
  navItems: [],
  permissions: [],
  activeSessions: [],
  mode: 'postgres',
  databaseConnected: false,
  currentPage: 'dashboard',
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  notifications: [],
  unreadCount: 0,
  onlineUserIds: [],
  ws: null,
  wsReconnectTimer: null,
};

export function hasClientPermission(perm) {
  return clientState.permissions.includes(perm);
}

export function applyUserSettings(settings) {
  if (!settings) return;
  const html = document.documentElement;
  html.setAttribute('data-theme', settings.themeMode || 'dark');
  html.setAttribute('data-preset', settings.themePreset || 'mor-neon');
  html.setAttribute('data-font-size', settings.fontSize || 'normal');
  html.setAttribute('data-sidebar-width', settings.sidebarWidth || 'normal');
  html.setAttribute('data-anim', settings.animationIntensity || 'full');

  if (settings.customAccentColor && /^#[0-9A-Fa-f]{6}$/.test(settings.customAccentColor)) {
    html.style.setProperty('--accent-primary', settings.customAccentColor);
    html.style.setProperty('--accent-soft', `${settings.customAccentColor}24`);
    html.style.setProperty('--accent-glow', `${settings.customAccentColor}45`);
  } else {
    html.style.removeProperty('--accent-primary');
    html.style.removeProperty('--accent-soft');
    html.style.removeProperty('--accent-glow');
  }

  const shell = document.querySelector('.shell');
  if (shell) {
    shell.classList.toggle('compact-mode', Boolean(settings.compactMode));
    shell.classList.toggle('bg-fx', settings.backgroundEffects !== false);
  }
}

let syncTimer = null;
let syncRunning = false;
let syncGeneration = 0;
let syncRevision = null;
let syncPrimed = false;
let knownNotifications = new Set();

async function syncState() {
  if (syncRunning || !clientState.user) return;
  const generation = syncGeneration;
  syncRunning = true;
  clearTimeout(syncTimer);
  try {
    const result = await apiRequest('/sync');
    if (generation !== syncGeneration || !clientState.user) return;
    clientState.onlineUserIds = result.onlineUserIds || [];
    const notifications = result.notifications || [];
    if (syncPrimed) for (const item of notifications) {
      if (!knownNotifications.has(item.id) && !item.isRead) notifyUserEvent(item, clientState.settings);
    }
    knownNotifications = new Set(notifications.map((item) => item.id));
    clientState.notifications = notifications;
    clientState.unreadCount = notifications.filter((item) => !item.isRead).length;
    window.dispatchEvent(new CustomEvent('mb:notifications'));
    const changed = syncRevision !== result.revision;
    syncRevision = result.revision;
    syncPrimed = true;
    if (changed) window.dispatchEvent(new CustomEvent('mb:ws', {detail: {event: 'sync:refresh'}}));
  } catch (error) {
    if (error.status === 401 && generation === syncGeneration) {
      disconnectRealtimeWebSocket();
      window.dispatchEvent(new CustomEvent('mb:auth-expired'));
    }
  } finally {
    syncRunning = false;
    if (generation === syncGeneration && clientState.user) syncTimer = setTimeout(syncState, document.hidden ? 15000 : 3000);
  }
}

// The shared PostgreSQL revision works across Vercel instances and reconnects.
// Keep these exported names compatible with the existing authentication flow.
export function connectRealtimeWebSocket() {
  if (syncTimer || !clientState.user) return;
  syncRevision = null;
  syncPrimed = false;
  knownNotifications = new Set(clientState.notifications.map((item) => item.id));
  syncState();
  window.addEventListener('mb:mutation', syncState);
}

export function disconnectRealtimeWebSocket() {
  syncGeneration++;
  clearTimeout(syncTimer);
  syncTimer = null;
  syncRevision = null;
  window.removeEventListener('mb:mutation', syncState);
  clientState.ws = null;
}