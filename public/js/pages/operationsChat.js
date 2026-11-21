import { apiRequest } from '../api.js';
import { closeModal, openModal } from '../components/layout.js';
import { renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { playNotificationSound } from '../sounds.js';
import { clientState, hasClientPermission } from '../store.js';
import { escapeHtml, formatTimeTr } from '../utils.js';

export async function renderOperationsChatPage(viewport) {
  const canProcess = hasClientPermission('operations.process');
  const canCreate =
    hasClientPermission('operations.create') || clientState.user?.role === 'Super Admin';
  let operations = [];
  let activeFilter = 'all';
  let draft = '';

  const loadOps = async () => {
    const res = await apiRequest('/operations/chat');
    operations = res.operations || [];
    render();
  };

  const renderStatusBadge = (op) => {
    if (op.status === 'Bekliyor') {
      return `<span class="status-tag status-waiting">Bekliyor</span>`;
    }
    if (op.status === 'İşleme Alındı') {
      return `<span class="status-tag status-processing">İşlemde</span>`;
    }
    if (op.status === 'Tamamlandı') {
      return `<span class="status-tag status-completed">${icon('check')} Tamamlandı</span>`;
    }
    return `<span class="status-tag status-rejected">Reddedildi</span>`;
  };

  const openRejectModal = (op) => {
    openModal({
      title: `İşlemi Reddet — ${op.memberUsername}`,
      bodyHtml: `
        <form id="reject-op-form" style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:13px;color:var(--text-secondary)">Talep: <strong>${escapeHtml(op.rawMessage)}</strong></div>
          <div class="field">
            <label class="field-label" for="reject-reason-input">Reddetme Nedeni (Zorunlu)</label>
            <textarea id="reject-reason-input" class="textarea" rows="3" placeholder="Reddetme nedenini yazın…" required></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button type="button" class="btn btn-secondary" id="reject-cancel">Vazgeç</button>
            <button type="submit" class="btn btn-danger">Reddet ve Bildir</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#reject-cancel')?.addEventListener('click', closeModal);
        root.querySelector('#reject-op-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const reason = root.querySelector('#reject-reason-input').value.trim();
          if (!reason) return;
          try {
            await apiRequest(`/operations/${op.id}/reject`, {
              method: 'POST',
              body: { reason },
            });
            closeModal();
            showToast({ title: 'İşlem Reddedildi', type: 'warning' });
          } catch (err) {
            showToast({ title: 'Hata', description: err.message, type: 'danger' });
          }
        });
      },
    });
  };

  const render = () => {
    const previousFeed = viewport.querySelector('#ops-chat-feed');
    const previousTop = previousFeed?.scrollTop || 0;
    const followLatest = !previousFeed || previousFeed.scrollHeight - previousFeed.clientHeight - previousTop < 60;
    const inputFocused = document.activeElement?.id === 'ops-chat-input';
    draft = viewport.querySelector('#ops-chat-input')?.value ?? draft;
    const visibleOps = operations.filter((op) => activeFilter === 'all' ||
      (activeFilter === 'open' ? ['Bekliyor', 'İşleme Alındı'].includes(op.status) : ['Tamamlandı', 'Reddedildi'].includes(op.status)));
    viewport.innerHTML = `
      <div class="ops-chat-shell">
        <div class="ops-chat-header">
          <div>
            <h2 class="ops-chat-title">İşlem Chat</h2>
            <p class="ops-chat-subtitle">${canProcess ? 'Talepleri tek bir akıştan yönetin.' : 'Taleplerinizi gönderin ve takip edin.'}</p>
          </div>
          <span class="ops-queue-count">${operations.filter((o) => o.status === 'Bekliyor').length} bekleyen talep</span>
        </div>

        <div class="ops-filter-bar" role="group" aria-label="Talep filtresi">
          ${[['all', 'Tümü'], ['open', 'Açık Talepler'], ['closed', 'Sonuçlanan']].map(([id, label]) => `<button type="button" class="ops-filter ${activeFilter === id ? 'active' : ''}" data-ops-filter="${id}" aria-pressed="${activeFilter === id}">${label}</button>`).join('')}
        </div>

        <div class="ops-chat-feed" id="ops-chat-feed" data-testid="ops-chat-feed">
          ${
            visibleOps.length === 0
              ? `<div class="empty-state">${renderEmptyStateGraphic()}<div>Bu görünümde talep bulunmuyor.</div></div>`
              : visibleOps
                  .map((op) => {
                    const rowClass =
                      op.status === 'İşleme Alındı'
                        ? 'is-processing'
                        : op.status === 'Tamamlandı'
                          ? 'is-completed'
                          : op.status === 'Reddedildi'
                            ? 'is-rejected'
                            : '';
                    const isMyClaim =
                      op.claimedByAdminId === clientState.user?.id ||
                      clientState.user?.role === 'Super Admin';

                    return `
                    <div class="ops-msg-row ${rowClass}" data-op-id="${escapeHtml(op.id)}">
                      <div class="ops-msg-body">
                        <div class="ops-msg-heading">
                          <span class="ops-msg-author">${escapeHtml(op.managerName)}</span>
                          <time class="ops-msg-time" datetime="${escapeHtml(op.createdAt)}">${formatTimeTr(op.createdAt)}</time>
                          ${renderStatusBadge(op)}
                        </div>
                        <div class="ops-msg-text">${escapeHtml(op.rawMessage)}</div>
                        ${op.resolvedByAdminName || op.claimedByAdminName ? `<div class="ops-msg-handler">${escapeHtml(op.resolvedByAdminName || op.claimedByAdminName)}${op.resolvedAt ? ` · ${formatTimeTr(op.resolvedAt)}` : ''}</div>` : ''}
                        ${
                          op.status === 'Reddedildi' && op.rejectionReason
                            ? `<div class="ops-msg-reason">Reddetme Nedeni: ${escapeHtml(op.rejectionReason)}</div>`
                            : ''
                        }
                      </div>

                      <div class="ops-msg-actions">
                        ${
                          canProcess && op.status === 'Bekliyor'
                            ? `<button type="button" class="btn btn-info btn-sm" data-claim-op="${escapeHtml(op.id)}">İşleme Al</button>`
                            : ''
                        }
                        ${
                          canProcess && op.status === 'İşleme Alındı' && isMyClaim
                            ? `
                              <button type="button" class="btn btn-success btn-sm" data-complete-op="${escapeHtml(op.id)}">Tamamlandı</button>
                              <button type="button" class="btn btn-danger btn-sm" data-reject-op="${escapeHtml(op.id)}">Reddet</button>
                            `
                            : ''
                        }
                      </div>
                    </div>
                  `;
                  })
                  .join('')
          }
        </div>

        ${
          canCreate
            ? `
          <form class="chat-composer ops-composer" id="ops-chat-form">
            <input
              id="ops-chat-input"
              type="text"
              class="input"
              placeholder="Kullanıcı adı ve talebinizi yazın…"
              aria-label="İşlem talebi"
              value="${escapeHtml(draft)}"
              autocomplete="off"
              required
            />
            <button type="submit" class="btn btn-primary" id="ops-chat-send">${icon('send')} Gönder</button>
          </form>
        `
            : ''
        }
      </div>
    `;

    const feed = viewport.querySelector('#ops-chat-feed');
    if (feed) feed.scrollTop = followLatest ? feed.scrollHeight : previousTop;
    if (inputFocused) viewport.querySelector('#ops-chat-input')?.focus();
    viewport.querySelectorAll('[data-ops-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { activeFilter = btn.dataset.opsFilter; render(); });
    });

    viewport.querySelector('#ops-chat-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = viewport.querySelector('#ops-chat-input');
      const message = input.value.trim();
      if (!message) return;
      const send = viewport.querySelector('#ops-chat-send');
      send.disabled = true;
      try {
        await apiRequest('/operations', { method: 'POST', body: { message } });
        draft = '';
        const currentInput = viewport.querySelector('#ops-chat-input');
        if (currentInput && currentInput.value.trim() === message) currentInput.value = '';
        await loadOps();
        viewport.querySelector('#ops-chat-input')?.focus();
      } catch (err) {
        showToast({ title: 'Gönderilemedi', description: err.message, type: 'danger' });
      } finally {
        const currentSend = viewport.querySelector('#ops-chat-send');
        if (currentSend) currentSend.disabled = false;
      }
    });

    viewport.querySelectorAll('[data-claim-op]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-claim-op');
        btn.disabled = true;
        try {
          await apiRequest(`/operations/${id}/claim`, { method: 'POST' });
        } catch (err) {
          showToast({ title: 'Alınamadı', description: err.message, type: 'danger' });
          await loadOps();
        }
      });
    });

    viewport.querySelectorAll('[data-complete-op]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-complete-op');
        btn.disabled = true;
        try {
          await apiRequest(`/operations/${id}/complete`, { method: 'POST' });
          playNotificationSound('success', clientState.settings);
        } catch (err) {
          showToast({ title: 'Hata', description: err.message, type: 'danger' });
          btn.disabled = false;
        }
      });
    });

    viewport.querySelectorAll('[data-reject-op]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = operations.find((o) => o.id === btn.getAttribute('data-reject-op'));
        if (op) openRejectModal(op);
      });
    });
  };

  const wsHandler = (ev) => {
    const { event, payload } = ev.detail || {};
    if (event === 'sync:refresh') { loadOps().catch(() => {}); return; }
    if (event === 'operation:created' && payload) {
      if (!canProcess && !hasClientPermission('operations.inspect_all') && payload.managerId !== clientState.user?.id) {
        return;
      }
      if (!operations.some((o) => o.id === payload.id)) {
        operations.push(payload);
        render();
      }
    } else if (event === 'operation:updated' && payload) {
      const idx = operations.findIndex((o) => o.id === payload.id);
      if (idx !== -1) {
        operations[idx] = payload;
        render();
      }
    }
  };

  window.addEventListener('mb:ws', wsHandler);
  await loadOps();
  return () => window.removeEventListener('mb:ws', wsHandler);
}
