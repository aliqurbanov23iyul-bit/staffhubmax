import { apiRequest } from '../api.js';
import { renderBrandLogo } from '../graphics.js';
import { icon } from '../icons.js';
import { clientState } from '../store.js';
import { escapeHtml, formatTimeTr, renderAvatar } from '../utils.js';

let modalCloseHandler = null;

export function openModal({ title, bodyHtml, footerHtml = '', maxWidth = '520px', onMount }) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  root.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" style="max-width:${escapeHtml(maxWidth)}">
      <div class="modal-header">
        <h3 class="card-title">${escapeHtml(title)}</h3>
        <button type="button" class="btn-icon" id="modal-close-x" aria-label="Pencereyi kapat">${icon('x')}</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;

  const close = () => closeModal();
  root.querySelector('#modal-close-x')?.addEventListener('click', close);
  root.onclick = (e) => {
    if (e.target === root) close();
  };
  modalCloseHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', modalCloseHandler);

  if (typeof onMount === 'function') onMount(root);
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
  if (modalCloseHandler) {
    window.removeEventListener('keydown', modalCloseHandler);
    modalCloseHandler = null;
  }
}

export function openDrawer({ title, subtitle = '', bodyHtml, onMount }) {
  const root = document.getElementById('drawer-root');
  if (!root) return;
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  root.innerHTML = `
    <aside class="drawer-panel" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <h3 class="card-title">${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="card-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="btn-icon" id="drawer-close-x" aria-label="Paneli kapat">${icon('x')}</button>
      </div>
      <div class="modal-body" style="flex:1;max-height:none">${bodyHtml}</div>
    </aside>
  `;
  root.querySelector('#drawer-close-x')?.addEventListener('click', closeDrawer);
  root.onclick = (e) => {
    if (e.target === root) closeDrawer();
  };
  if (typeof onMount === 'function') onMount(root);
}

export function closeDrawer() {
  const root = document.getElementById('drawer-root');
  if (!root) return;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
}

export function openCommandPalette(navigateFn) {
  const root = document.getElementById('palette-root');
  if (!root) return;

  const commands = [
    { id: 'cmd-new-member', label: 'Yeni Üye Ekle', hint: 'Üyelerim CRM', page: 'members', icon: 'users' },
    { id: 'cmd-ops-chat', label: 'İşlem Chat Aç', hint: 'Gerçek Zamanlı Operasyon', page: 'operations-chat', icon: 'bolt' },
    { id: 'cmd-reminder', label: 'Hatırlatıcı Kur', hint: 'Üyelerim Hatırlatıcılar', page: 'members', action: 'open-reminder', icon: 'alarm' },
    { id: 'cmd-breaks', label: 'Molaları Gör', hint: 'Mola Yönetimi', page: 'breaks', icon: 'clock' },
    { id: 'cmd-announcements', label: 'Duyuruları Aç', hint: 'Duyurular', page: 'announcements', icon: 'megaphone' },
    { id: 'cmd-settings', label: 'Ayarlara Git', hint: 'Görünüm ve Tercihler', page: 'settings', icon: 'settings' },
  ].filter((c) => {
    if (c.page === 'members' || c.page === 'breaks' || c.page === 'announcements' || c.page === 'settings') {
      return clientState.navItems.some((n) => n.id === c.page) || c.page === 'settings';
    }
    return clientState.navItems.some((n) => n.id === c.page);
  });

  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  root.innerHTML = `
    <div class="modal-card" role="dialog" aria-label="Hızlı Komut Paleti" style="max-width:540px;align-self:flex-start;margin-top:9vh">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border-hairline);display:flex;align-items:center;gap:10px">
        ${icon('search')}
        <input id="palette-search" type="text" class="input" style="border:none;background:transparent;padding:0;height:28px;box-shadow:none" placeholder="Komut veya sayfa ara… (Esc ile kapat)" autofocus />
      </div>
      <div id="palette-list" style="padding:8px;max-height:340px;overflow-y:auto"></div>
    </div>
  `;

  const close = () => {
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
  };

  const renderList = (q = '') => {
    const listEl = root.querySelector('#palette-list');
    if (!listEl) return;
    const filtered = commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q.toLowerCase()) ||
        c.hint.toLowerCase().includes(q.toLowerCase()),
    );
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:13px">Eşleşen komut bulunamadı.</div>';
      return;
    }
    listEl.innerHTML = filtered
      .map(
        (c) => `
      <button type="button" class="dropdown-item" data-page="${escapeHtml(c.page)}" data-action="${escapeHtml(c.action || '')}" style="padding:10px 12px;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:10px">${icon(c.icon)} <span>${escapeHtml(c.label)}</span></span>
        <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.hint)}</span>
      </button>
    `,
      )
      .join('');

    listEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-page');
        const action = btn.getAttribute('data-action');
        close();
        navigateFn(page);
        if (action === 'open-reminder') {
          setTimeout(() => window.dispatchEvent(new CustomEvent('mb:open-reminder-modal')), 80);
        }
      });
    });
  };

  renderList('');
  const input = root.querySelector('#palette-search');
  input?.focus();
  input?.addEventListener('input', (e) => renderList(e.target.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') {
      root.querySelector('#palette-list button')?.click();
    }
  });
  root.onclick = (e) => {
    if (e.target === root) close();
  };
}

export function renderAppShell({ pageTitle, navigateFn, onLogout, renderPageContent }) {
  const root = document.getElementById('app-root');
  if (!root) return;
  const sidebarScrollTop = root.querySelector('.sidebar-scroll')?.scrollTop || 0;
  const focusedNav = root.contains(document.activeElement)
    ? document.activeElement?.closest('[data-nav]')?.getAttribute('data-nav')
    : null;

  const user = clientState.user;
  const mainItems = clientState.navItems.filter((i) => i.section === 'main');
  const adminItems = clientState.navItems.filter((i) => i.section === 'admin');
  const bottomItems = clientState.navItems.filter((i) => i.section === 'bottom');

  const renderNavBtn = (item) => {
    const isActive = clientState.currentPage === item.id;
    const badge =
      item.id === 'notifications' && clientState.unreadCount > 0
        ? `<span class="nav-badge" id="sidebar-notif-badge">${clientState.unreadCount}</span>`
        : '';
    return `
      <button type="button" class="nav-item ${isActive ? 'active' : ''}" data-nav="${escapeHtml(item.id)}" title="${escapeHtml(item.label)}">
        ${icon(item.icon)}
        <span class="nav-label">${escapeHtml(item.label)}</span>
        ${badge}
      </button>
    `;
  };

  const shellClasses = [
    'shell',
    clientState.sidebarCollapsed ? 'sidebar-collapsed' : '',
    clientState.mobileSidebarOpen ? 'mobile-sidebar-open' : '',
    clientState.settings?.compactMode ? 'compact-mode' : '',
    clientState.settings?.backgroundEffects !== false ? 'bg-fx' : '',
  ]
    .filter(Boolean)
    .join(' ');

  root.innerHTML = `
    <div class="${shellClasses}">
      <div class="ambient-background" aria-hidden="true"><span class="ambient-haze"></span><span class="ambient-sparks"></span></div>
      <div class="mobile-backdrop" id="mobile-backdrop"></div>
      <aside class="sidebar" aria-label="Ana Menü">
        <div class="sidebar-header">
          <a href="#dashboard" class="brand-lockup" id="brand-home-link">
            ${renderBrandLogo(28)}
            <span class="brand-wordmark">MAXBAHIS STAFF HUB</span>
          </a>
          <button type="button" class="btn-icon sidebar-collapse-btn" id="sidebar-collapse-btn" aria-label="Kenar çubuğunu daralt veya genişlet">
            ${icon(clientState.sidebarCollapsed ? 'chevronRight' : 'chevronLeft')}
          </button>
        </div>

        <nav class="sidebar-scroll">
          <div class="nav-section">
            <div class="nav-section-label">Ana Menü</div>
            ${mainItems.map(renderNavBtn).join('')}
          </div>

          ${
            adminItems.length > 0
              ? `
            <div class="nav-section">
              <div class="nav-section-label">Yönetim</div>
              ${adminItems.map(renderNavBtn).join('')}
            </div>
          `
              : ''
          }
        </nav>

        <div class="sidebar-footer">
          ${bottomItems.map(renderNavBtn).join('')}
          <button type="button" class="nav-item" id="sidebar-logout-btn" title="Çıkış Yap">
            ${icon('logout')}
            <span class="nav-label">Çıkış Yap</span>
          </button>
          <div class="sidebar-mode-note">
            <strong>${clientState.databaseConnected ? 'PostgreSQL Bağlı' : 'Bağlantı Bekleniyor'}</strong>
            <span>${clientState.databaseConnected ? 'Çalışma alanı bağlantısı etkin.' : 'Sunucu bağlantısını kontrol edin.'}</span>
          </div>
        </div>
      </aside>

      <div class="main-column">
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="btn-icon mobile-menu-btn" id="mobile-menu-btn" aria-label="Menüyü aç">
              ${icon('menu')}
            </button>
            <h1 class="breadcrumb-title">${escapeHtml(pageTitle)}</h1>
          </div>

          <div class="topbar-right">
            <button type="button" class="cmd-trigger" id="open-palette-btn" aria-label="Hızlı arama ve komut paleti">
              ${icon('search')}
              <span class="cmd-trigger-text">Hızlı Komut</span>
              <span class="kbd-hint">Ctrl+K</span>
            </button>

            <div class="dropdown-wrap">
              <button type="button" class="btn-icon" id="topbar-bell-btn" aria-label="Bildirim Merkezi">
                ${icon('bell')}
                ${
                  clientState.unreadCount > 0
                    ? `<span id="topbar-bell-badge" style="position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:var(--danger);color:#fff;font-size:10.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">${clientState.unreadCount}</span>`
                    : ''
                }
              </button>
              <div class="dropdown-menu wide" id="bell-dropdown" hidden></div>
            </div>

            <div class="dropdown-wrap">
              <button type="button" class="btn btn-secondary btn-sm" id="user-menu-btn" style="padding:4px 10px 4px 5px;height:36px" aria-label="Kullanıcı menüsü">
                ${renderAvatar(user, user.avatarColor, user.avatarUrl, 26)}
                <span class="user-chip-name" style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(user.displayName)}</span>
              </button>
              <div class="dropdown-menu" id="user-dropdown" hidden>
                <div style="padding:8px 10px;border-bottom:1px solid var(--border-hairline);margin-bottom:4px">
                  <div style="font-weight:600;font-size:13px">${escapeHtml(user.displayName)}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary)">${escapeHtml(user.role)} · ${escapeHtml(user.team)}</div>
                </div>
                <button type="button" class="dropdown-item" data-menu-nav="profile">${icon('user')} Profilim</button>
                <button type="button" class="dropdown-item" data-menu-nav="settings">${icon('settings')} Ayarlar</button>
                <button type="button" class="dropdown-item" id="menu-logout-btn" style="color:var(--danger)">${icon('logout')} Çıkış Yap</button>
              </div>
            </div>
          </div>
        </header>

        <main class="content-viewport" id="page-viewport"></main>
      </div>
    </div>
  `;

  // Bind navigation
  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clientState.mobileSidebarOpen = false;
      navigateFn(btn.getAttribute('data-nav'));
    });
  });

  root.querySelector('#brand-home-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateFn('dashboard');
  });

  root.querySelector('#sidebar-collapse-btn')?.addEventListener('click', () => {
    clientState.sidebarCollapsed = !clientState.sidebarCollapsed;
    const shell = root.querySelector('.shell');
    shell?.classList.toggle('sidebar-collapsed', clientState.sidebarCollapsed);
    const btn = root.querySelector('#sidebar-collapse-btn');
    if (btn) btn.innerHTML = icon(clientState.sidebarCollapsed ? 'chevronRight' : 'chevronLeft');
  });

  root.querySelector('#mobile-menu-btn')?.addEventListener('click', () => {
    clientState.mobileSidebarOpen = true;
    root.querySelector('.shell')?.classList.add('mobile-sidebar-open');
  });

  root.querySelector('#mobile-backdrop')?.addEventListener('click', () => {
    clientState.mobileSidebarOpen = false;
    root.querySelector('.shell')?.classList.remove('mobile-sidebar-open');
  });

  root.querySelector('#sidebar-logout-btn')?.addEventListener('click', onLogout);
  root.querySelector('#menu-logout-btn')?.addEventListener('click', onLogout);
  root.querySelector('#open-palette-btn')?.addEventListener('click', () => openCommandPalette(navigateFn));

  // Bell dropdown
  const bellBtn = root.querySelector('#topbar-bell-btn');
  const bellDrop = root.querySelector('#bell-dropdown');
  const userBtn = root.querySelector('#user-menu-btn');
  const userDrop = root.querySelector('#user-dropdown');

  const closeDrops = () => {
    if (bellDrop) bellDrop.hidden = true;
    if (userDrop) userDrop.hidden = true;
  };

  bellBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const willOpen = bellDrop.hidden;
    closeDrops();
    if (willOpen) {
      bellDrop.hidden = false;
      bellDrop.innerHTML = '<div style="padding:16px;text-align:center;font-size:12.5px;color:var(--text-secondary)">Yükleniyor…</div>';
      try {
        const data = await apiRequest('/notifications');
        clientState.notifications = data.notifications;
        clientState.unreadCount = data.unreadCount;
        const top5 = data.notifications.slice(0, 6);
        bellDrop.innerHTML = `
          <div style="padding:10px 14px;border-bottom:1px solid var(--border-hairline);display:flex;align-items:center;justify-content:space-between">
            <strong style="font-size:13px">Bildirimler</strong>
            <button type="button" class="btn-ghost btn-sm" id="drop-read-all" style="font-size:11.5px;border:none">Tümünü Okundu İşaretle</button>
          </div>
          <div style="max-height:300px;overflow-y:auto">
            ${
              top5.length === 0
                ? '<div style="padding:20px;text-align:center;font-size:12.5px;color:var(--text-secondary)">Yeni bildiriminiz bulunmuyor.</div>'
                : top5
                    .map(
                      (n) => `
                <button type="button" class="dropdown-item" data-notif-id="${escapeHtml(n.id)}" data-notif-link="${escapeHtml(n.linkPage)}" style="padding:10px 14px;border-bottom:1px solid var(--border-hairline);border-radius:0;flex-direction:column;align-items:flex-start;gap:2px;background:${n.isRead ? 'transparent' : 'var(--accent-soft)'}">
                  <div style="display:flex;width:100%;justify-content:space-between;font-weight:600;font-size:12.5px">
                    <span>${escapeHtml(n.title)}</span>
                    <span class="tabular-nums" style="font-size:11px;color:var(--text-muted)">${formatTimeTr(n.createdAt)}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-secondary);white-space:normal">${escapeHtml(n.description)}</div>
                </button>
              `,
                    )
                    .join('')
            }
          </div>
          <div style="padding:8px;border-top:1px solid var(--border-hairline);text-align:center">
            <button type="button" class="btn btn-secondary btn-sm" id="drop-view-all-notifs" style="width:100%">Tüm Bildirimleri Gör</button>
          </div>
        `;
        bellDrop.querySelector('#drop-read-all')?.addEventListener('click', async () => {
          await apiRequest('/notifications/read-all', { method: 'POST' });
          clientState.unreadCount = 0;
          closeDrops();
          updateBellBadges();
        });
        bellDrop.querySelector('#drop-view-all-notifs')?.addEventListener('click', () => {
          closeDrops();
          navigateFn('notifications');
        });
        bellDrop.querySelectorAll('[data-notif-id]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-notif-id');
            const link = btn.getAttribute('data-notif-link');
            await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
            clientState.unreadCount = Math.max(0, clientState.unreadCount - 1);
            updateBellBadges();
            closeDrops();
            if (link) navigateFn(link);
          });
        });
      } catch {
        bellDrop.innerHTML = '<div style="padding:16px;color:var(--danger);font-size:12.5px">Bildirimler yüklenemedi.</div>';
      }
    }
  });

  userBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = userDrop.hidden;
    closeDrops();
    if (willOpen) userDrop.hidden = false;
  });

  root.querySelectorAll('[data-menu-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeDrops();
      navigateFn(btn.getAttribute('data-menu-nav'));
    });
  });

  document.addEventListener('click', closeDrops, { once: false });

  const viewport = root.querySelector('#page-viewport');
  const sidebarScroll = root.querySelector('.sidebar-scroll');
  if (sidebarScroll) sidebarScroll.scrollTop = sidebarScrollTop;
  if (focusedNav && window.matchMedia('(min-width: 781px)').matches) {
    Array.from(root.querySelectorAll('[data-nav]'))
      .find((button) => button.getAttribute('data-nav') === focusedNav)
      ?.focus({ preventScroll: true });
  }
  if (viewport && typeof renderPageContent === 'function') {
    renderPageContent(viewport);
  }
}

export function updateBellBadges() {
  const bellBtn = document.getElementById('topbar-bell-btn');
  const existingTop = document.getElementById('topbar-bell-badge');
  if (clientState.unreadCount > 0) {
    if (existingTop) {
      existingTop.textContent = String(clientState.unreadCount);
    } else if (bellBtn) {
      const span = document.createElement('span');
      span.id = 'topbar-bell-badge';
      span.style.cssText =
        'position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:var(--danger);color:#fff;font-size:10.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center';
      span.textContent = String(clientState.unreadCount);
      bellBtn.appendChild(span);
    }
  } else {
    existingTop?.remove();
  }

  const sideBadge = document.getElementById('sidebar-notif-badge');
  if (sideBadge) {
    if (clientState.unreadCount > 0) {
      sideBadge.textContent = String(clientState.unreadCount);
      sideBadge.style.display = 'inline-block';
    } else {
      sideBadge.style.display = 'none';
    }
  }
}
