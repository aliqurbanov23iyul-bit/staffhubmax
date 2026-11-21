import { apiRequest, setAuthToken } from './api.js';
import { renderLoginPage } from './auth.js';
import {
  openCommandPalette,
  renderAppShell,
  updateBellBadges,
} from './components/layout.js';
import { getPageTitle, isPageAuthorized, mountPage } from './router.js';
import {
  applyUserSettings,
  clientState,
  connectRealtimeWebSocket,
  disconnectRealtimeWebSocket,
} from './store.js';

let activeCleanup = null;

async function navigate(pageId) {
  if (!clientState.user) return;
  const target = isPageAuthorized(pageId) ? pageId : 'dashboard';
  clientState.currentPage = target;
  if (window.location.hash !== `#${target}`) {
    history.replaceState(null, '', `#${target}`);
  }

  if (typeof activeCleanup === 'function') {
    try {
      activeCleanup();
    } catch {
      // Ignore cleanup errors
    }
    activeCleanup = null;
  }

  renderAppShell({
    pageTitle: getPageTitle(target),
    navigateFn: navigate,
    onLogout: handleLogout,
    renderPageContent: async (viewport) => {
      const cleanup = await mountPage(target, viewport, navigate);
      if (typeof cleanup === 'function') activeCleanup = cleanup;
    },
  });
}

async function handleLogout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout network error
  }
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }
  setAuthToken(null);
  disconnectRealtimeWebSocket();
  clientState.user = null;
  clientState.navItems = [];
  clientState.permissions = [];
  renderLoginPage(onAuthenticated);
}

async function onAuthenticated() {
  try {
    const notifRes = await apiRequest('/notifications');
    clientState.notifications = notifRes.notifications || [];
    clientState.unreadCount = notifRes.unreadCount || 0;
  } catch {
    clientState.unreadCount = 0;
  }

  const hashPage = window.location.hash.replace(/^#/, '') || 'dashboard';
  await navigate(isPageAuthorized(hashPage) ? hashPage : 'dashboard');
}

async function bootstrap() {
  let isAuthenticated = false;
  try {
    const health = await apiRequest('/health');
    clientState.mode = health.mode;
    clientState.databaseConnected = health.databaseConnected;
    isAuthenticated = Boolean(health.authenticated);
  } catch {
    // Ignore health fetch issues
  }

  if (!isAuthenticated) {
    renderLoginPage(onAuthenticated);
    return;
  }

  // Restore authenticated session
  try {
    const me = await apiRequest('/auth/me');
    clientState.user = me.user;
    clientState.settings = me.settings;
    clientState.navItems = me.navItems;
    clientState.permissions = me.permissions;
    clientState.activeSessions = me.activeSessions || [];
    clientState.mode = me.mode;
    clientState.databaseConnected = me.databaseConnected;
    applyUserSettings(me.settings);
    connectRealtimeWebSocket();
    await onAuthenticated();
  } catch {
    renderLoginPage(onAuthenticated);
  }
}

window.addEventListener('hashchange', () => {
  if (!clientState.user) return;
  const hashPage = window.location.hash.replace(/^#/, '') || 'dashboard';
  if (hashPage !== clientState.currentPage && isPageAuthorized(hashPage)) {
    navigate(hashPage);
  }
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    if (!clientState.user) return;
    e.preventDefault();
    openCommandPalette(navigate);
  }
});

window.addEventListener('mb:notifications', () => {
  updateBellBadges();
});
window.addEventListener('mb:auth-expired', handleLogout);

bootstrap();
