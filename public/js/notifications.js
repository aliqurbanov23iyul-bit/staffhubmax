import { icon } from './icons.js';
import { playNotificationSound } from './sounds.js';
import { escapeHtml } from './utils.js';

export function showToast({ title, description = '', type = 'info', duration = 4200 }) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const colorMap = {
    success: 'var(--success)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
    info: 'var(--accent-secondary)',
  };
  const iconMap = {
    success: 'check-circle',
    danger: 'alert',
    warning: 'clock',
    info: 'bell',
  };

  const item = document.createElement('div');
  item.className = 'toast-item';
  item.innerHTML = `
    <span style="color:${colorMap[type] || colorMap.info};margin-top:1px">${icon(iconMap[type] || 'bell')}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;color:var(--text-primary)">${escapeHtml(title)}</div>
      ${description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${escapeHtml(description)}</div>` : ''}
    </div>
    <button type="button" class="btn-ghost" style="border:none;padding:2px;border-radius:4px" aria-label="Bildirimi kapat">${icon('x')}</button>
  `;

  const closeBtn = item.querySelector('button');
  const remove = () => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    item.style.transition = 'opacity 150ms, transform 150ms';
    setTimeout(() => item.remove(), 160);
  };
  closeBtn?.addEventListener('click', remove);
  root.appendChild(item);

  if (duration > 0) {
    setTimeout(remove, duration);
  }
}

export function triggerDesktopNotification(title, body, settings) {
  if (!settings?.desktopNotifications || settings?.quietMode) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

export function notifyUserEvent(notif, settings) {
  const soundKind =
    notif.type === 'operation_completed' || notif.type === 'ftd_approved'
      ? 'success'
      : notif.type === 'break_overdue' || notif.type === 'operation_rejected'
        ? 'alert'
        : notif.type === 'break_due'
          ? 'break'
          : 'default';

  const shouldNotify =
    !settings?.quietMode &&
    ((notif.type === 'chat' || notif.type === 'mention') ? settings?.notifyChat !== false :
     notif.type.startsWith('operation_') ? settings?.notifyOperations !== false :
     notif.type.startsWith('break_') ? settings?.notifyBreaks !== false :
     notif.type === 'announcement' ? settings?.notifyAnnouncements !== false : true);

  if (shouldNotify) {
    playNotificationSound(soundKind, settings);
    showToast({
      title: notif.title,
      description: notif.description,
      type:
        soundKind === 'success'
          ? 'success'
          : soundKind === 'alert'
            ? 'danger'
            : soundKind === 'break'
              ? 'warning'
              : 'info',
    });
    triggerDesktopNotification(notif.title, notif.description, settings);
  }

  const bellBtn = document.getElementById('topbar-bell-btn');
  if (bellBtn) {
    bellBtn.classList.remove('anim-bell-ring');
    void bellBtn.offsetWidth;
    bellBtn.classList.add('anim-bell-ring');
  }
}
