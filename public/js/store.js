import { getAuthToken } from './api.js';
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

export function connectRealtimeWebSocket() {
  if (clientState.ws && clientState.ws.readyState <= 1) return;
  if (!clientState.user) return;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getAuthToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const ws = new WebSocket(`${proto}//${window.location.host}/ws${qs}`);
  clientState.ws = ws;

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const { event, payload } = msg;
      if (event === 'presence:update' && Array.isArray(payload?.onlineUserIds)) {
        clientState.onlineUserIds = payload.onlineUserIds;
      }
      if (event === 'notification:new' && payload) {
        if (!clientState.notifications.some((n) => n.id === payload.id)) {
          clientState.notifications.unshift(payload);
          clientState.unreadCount += 1;
        }
        notifyUserEvent(payload, clientState.settings);
        window.dispatchEvent(new CustomEvent('mb:notifications'));
      }
      window.dispatchEvent(new CustomEvent('mb:ws', { detail: { event, payload } }));
    } catch {
      // Ignore invalid WS messages
    }
  });

  ws.addEventListener('close', () => {
    clientState.ws = null;
    if (clientState.user) {
      clearTimeout(clientState.wsReconnectTimer);
      clientState.wsReconnectTimer = setTimeout(connectRealtimeWebSocket, 3000);
    }
  });
}

export function disconnectRealtimeWebSocket() {
  clearTimeout(clientState.wsReconnectTimer);
  if (clientState.ws) {
    clientState.ws.close();
    clientState.ws = null;
  }
}
