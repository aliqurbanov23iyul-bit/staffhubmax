import { apiRequest } from '../api.js';
import { closeDrawer, closeModal, openDrawer, openModal } from '../components/layout.js';
import { renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { hasClientPermission } from '../store.js';
import { escapeHtml, formatDateTimeTr, formatDateTr, formatTimeTr } from '../utils.js';

const MEMBER_STATUSES = ['Yeni', 'Takipte', 'Aranacak', 'VIP', 'Ulaşılamadı', 'Pasif'];

export async function renderMembersPage(viewport, options = {}) {
  const canInspectAll = hasClientPermission('members.inspect_all');
  let members = [];
  let templates = [];
  let reminders = [];
  let staffUsers = [];
  let expandedCommentMemberId = null;
  let selectedIds = new Set();
  let filters = {
    search: '',
    status: 'Tümü',
    sort: 'newest',
    archived: false,
    ownerId: options.ownerId || 'all',
  };

  const loadData = async () => {
    const qs = new URLSearchParams({
      search: filters.search,
      status: filters.status,
      sort: filters.sort,
      archived: String(filters.archived),
      ownerId: filters.ownerId,
    }).toString();

    const [memRes, tplRes, remRes, usrRes] = await Promise.all([
      apiRequest(`/members?${qs}`),
      apiRequest('/comment-templates'),
      apiRequest('/reminders'),
      canInspectAll ? apiRequest('/users') : Promise.resolve({ users: [] }),
    ]);

    members = memRes.members || [];
    templates = tplRes.templates || [];
    reminders = remRes.reminders || [];
    staffUsers = usrRes.users || [];
    render();
  };

  const openReminderModal = (member = null) => {
    const defaultDt = new Date(Date.now() + 60 * 60_000);
    const localIso = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);

    openModal({
      title: member ? `${member.username} için Hatırlatıcı` : 'Yeni Hatırlatıcı Kur',
      bodyHtml: `
        <form id="reminder-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label class="field-label" for="rem-title">Hatırlatıcı Notu</label>
            <input id="rem-title" class="input" type="text" value="${member ? `${escapeHtml(member.username)} geri arama` : ''}" placeholder="Örn: Akşam tekrar aranacak" required />
          </div>
          <div class="field">
            <label class="field-label" for="rem-due">Tarih ve Saat</label>
            <input id="rem-due" class="input" type="datetime-local" value="${localIso}" required />
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
            <button type="button" class="btn btn-secondary" id="rem-cancel">İptal</button>
            <button type="submit" class="btn btn-primary">Hatırlatıcı Kaydet</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#rem-cancel')?.addEventListener('click', closeModal);
        root.querySelector('#reminder-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = root.querySelector('#rem-title').value.trim();
          const dueAt = root.querySelector('#rem-due').value;
          try {
            await apiRequest('/reminders', {
              method: 'POST',
              body: { title, dueAt, memberId: member?.id || null },
            });
            closeModal();
            showToast({ title: 'Hatırlatıcı Eklendi', description: title, type: 'success' });
            await loadData();
          } catch (err) {
            showToast({ title: 'Hata', description: err.message, type: 'danger' });
          }
        });
      },
    });
  };

  const openCommentHistoryDrawer = async (member) => {
    try {
      const data = await apiRequest(`/members/${member.id}/comments`);
      openDrawer({
        title: `${member.username} — Detay ve Yorum Geçmişi`,
        subtitle: `Sorumlu: ${member.ownerName} · Durum: ${member.status}`,
        bodyHtml: `
          <div style="display:flex;flex-direction:column;gap:16px">
            <form id="member-detail-form" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-bottom:14px;border-bottom:1px solid var(--border-hairline)">
              <div class="field">
                <label class="field-label" for="md-status">Üye Durumu</label>
                <select id="md-status" class="select">
                  ${MEMBER_STATUSES.map((s) => `<option value="${s}" ${member.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="md-realname">Ad Soyad (Opsiyonel)</label>
                <input id="md-realname" class="input" value="${escapeHtml(member.realName || '')}" placeholder="Opsiyonel" />
              </div>
              <div class="field">
                <label class="field-label" for="md-phone">Telefon (Opsiyonel)</label>
                <input id="md-phone" class="input" value="${escapeHtml(member.phone || '')}" placeholder="Opsiyonel" />
              </div>
              <div class="field">
                <label class="field-label" for="md-email">E-posta (Opsiyonel)</label>
                <input id="md-email" class="input" value="${escapeHtml(member.email || '')}" placeholder="Opsiyonel" />
              </div>
              <div style="grid-column:1/-1;display:flex;justify-content:flex-end">
                <button type="submit" class="btn btn-secondary btn-sm">Bilgileri Güncelle</button>
              </div>
            </form>

            <div>
              <strong style="font-size:13px;display:block;margin-bottom:10px">Tüm Yorum Geçmişi (${data.comments.length})</strong>
              ${
                data.comments.length === 0
                  ? '<div style="font-size:13px;color:var(--text-secondary)">Henüz yorum kaydedilmemiş.</div>'
                  : `
                <div style="display:flex;flex-direction:column;gap:10px">
                  ${data.comments
                    .map(
                      (c) => `
                    <div style="padding:10px 12px;border-radius:var(--radius-md);background:var(--bg-elevated)">
                      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px">
                        <strong>${escapeHtml(c.authorName)}</strong>
                        <span class="tabular-nums">${formatDateTimeTr(c.createdAt)}</span>
                      </div>
                      <div style="font-size:13px">${escapeHtml(c.content)}</div>
                    </div>
                  `,
                    )
                    .join('')}
                </div>
              `
              }
            </div>
          </div>
        `,
        onMount: (root) => {
          root.querySelector('#member-detail-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
              await apiRequest(`/members/${member.id}`, {
                method: 'PATCH',
                body: {
                  status: root.querySelector('#md-status').value,
                  realName: root.querySelector('#md-realname').value,
                  phone: root.querySelector('#md-phone').value,
                  email: root.querySelector('#md-email').value,
                },
              });
              showToast({ title: 'Üye Güncellendi', type: 'success' });
              closeDrawer();
              await loadData();
            } catch (err) {
              showToast({ title: 'Hata', description: err.message, type: 'danger' });
            }
          });
        },
      });
    } catch (err) {
      showToast({ title: 'Hata', description: err.message, type: 'danger' });
    }
  };

  const render = () => {
    const activeReminders = reminders.filter((r) => !r.isCompleted);

    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Üyelerim — Hızlı CRM</h2>
          <p class="page-desc">Sadece kullanıcı adı ile anında üye ekleyin, satır içinden Enter ile yorum kaydedin.</p>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-secondary btn-sm" id="crm-new-reminder-btn">${icon('alarm')} Hatırlatıcı Kur (${activeReminders.length})</button>
          <button type="button" class="btn btn-secondary btn-sm" id="crm-toggle-archive-btn">${filters.archived ? 'Aktif Üyeler' : 'Arşiv'}</button>
        </div>
      </div>

      <!-- Instant Username-Only Add Form -->
      <form class="crm-quick-add" id="crm-quick-add-form">
        <div style="flex:1;min-width:200px">
          <label for="crm-add-username" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden">Üye Kullanıcı Adı</label>
          <input
            id="crm-add-username"
            type="text"
            class="input"
            placeholder="Üye kullanıcı adı yazın (Örn: Ali3213)…"
            autocomplete="off"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" id="crm-add-submit-btn">${icon('plus')} Üye Ekle</button>
      </form>

      <!-- Filter & Bulk Bar -->
      <div class="toolbar" style="margin-bottom:12px;justify-content:space-between">
        <div class="toolbar">
          <input id="crm-search" class="input input-sm" style="width:220px" placeholder="Üye veya yorum ara…" value="${escapeHtml(filters.search)}" />
          <select id="crm-status-filter" class="select input-sm" style="width:140px" aria-label="Durum filtresi">
            <option value="Tümü" ${filters.status === 'Tümü' ? 'selected' : ''}>Tüm Durumlar</option>
            ${MEMBER_STATUSES.map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <select id="crm-sort" class="select input-sm" style="width:165px" aria-label="Sıralama">
            <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>En Yeni Eklenen</option>
            <option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>En Eski Eklenen</option>
            <option value="last_comment" ${filters.sort === 'last_comment' ? 'selected' : ''}>Son Yorum Tarihi</option>
          </select>
          ${
            canInspectAll && staffUsers.length > 0
              ? `
            <select id="crm-owner-filter" class="select input-sm" style="width:170px" aria-label="Personel Filtresi">
              <option value="all">Tüm Personel Üyeleri</option>
              ${staffUsers.map((u) => `<option value="${escapeHtml(u.id)}" ${filters.ownerId === u.id ? 'selected' : ''}>${escapeHtml(u.displayName)}</option>`).join('')}
            </select>
          `
              : ''
          }
        </div>

        ${
          selectedIds.size > 0
            ? `
          <div class="toolbar">
            <span style="font-size:12.5px;color:var(--text-secondary)">${selectedIds.size} seçili</span>
            <button type="button" class="btn btn-secondary btn-sm" id="crm-bulk-pin">Sabitle</button>
            <button type="button" class="btn btn-secondary btn-sm" id="crm-bulk-archive">${filters.archived ? 'Arşivden Çıkar' : 'Arşivle'}</button>
          </div>
        `
            : ''
        }
      </div>

      ${
        activeReminders.length > 0
          ? `
        <div class="alert-banner info" style="margin-bottom:12px;padding:10px 14px">
          <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;flex-wrap:wrap">
            ${icon('alarm')}
            <strong>Aktif Hatırlatıcılar:</strong>
            ${activeReminders
              .slice(0, 3)
              .map(
                (r) => `
              <span style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-card);padding:3px 8px;border-radius:6px;border:1px solid var(--border-hairline)">
                <span>${escapeHtml(r.title)} (${formatTimeTr(r.dueAt)})</span>
                <button type="button" class="btn-ghost" data-done-rem="${escapeHtml(r.id)}" style="border:none;padding:0 3px;color:var(--success)" aria-label="Hatırlatıcıyı tamamla">✓</button>
              </span>
            `,
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        members.length === 0
          ? `<div class="card empty-state">${renderEmptyStateGraphic()}<div>Henüz eşleşen üye kaydı bulunmuyor.</div></div>`
          : `
        <div class="crm-list" data-testid="crm-member-list">
          ${members
            .map((m) => {
              const isExpanded = expandedCommentMemberId === m.id;
              return `
              <div class="crm-row" data-member-id="${escapeHtml(m.id)}">
                <div class="crm-row-main">
                  <input type="checkbox" class="crm-check" data-id="${escapeHtml(m.id)}" ${selectedIds.has(m.id) ? 'checked' : ''} aria-label="${escapeHtml(m.username)} seç" />

                  <div style="min-width:0">
                    <div style="display:flex;align-items:center;gap:6px">
                      ${m.isPinned ? `<span style="color:var(--accent-secondary)" title="Sabitlenmiş üye">${icon('pin')}</span>` : ''}
                      <button type="button" class="btn-ghost" data-open-history="${escapeHtml(m.id)}" style="border:none;padding:0;font-weight:700;font-size:13.5px;color:var(--text-primary);text-align:left">
                        ${escapeHtml(m.username)}
                      </button>
                      ${m.hasDuplicateAcrossSystem ? `<span style="font-size:11px;color:var(--warning);font-weight:600" title="Başka personelde de kayıtlı">Çift Kayıt</span>` : ''}
                    </div>
                    ${canInspectAll ? `<div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(m.ownerName)}</div>` : ''}
                  </div>

                  <div class="crm-row-date-col tabular-nums" style="font-size:12.5px;color:var(--text-secondary)">
                    ${formatDateTr(m.createdAt)}
                  </div>

                  <div class="crm-row-comment-col" style="min-width:0">
                    <div style="font-size:13px;color:${m.latestComment ? 'var(--text-primary)' : 'var(--text-muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      ${escapeHtml(m.latestComment || 'Henüz yorum eklenmedi')}
                    </div>
                    ${m.latestCommentAt ? `<div class="tabular-nums" style="font-size:11px;color:var(--text-muted)">Son yorum: ${formatDateTimeTr(m.latestCommentAt)}</div>` : ''}
                  </div>

                  <div>
                    <select class="select input-sm crm-inline-status" data-id="${escapeHtml(m.id)}" aria-label="${escapeHtml(m.username)} durumu">
                      ${MEMBER_STATUSES.map((s) => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                  </div>

                  <div class="crm-row-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-toggle-comment="${escapeHtml(m.id)}">
                      ${icon('comment')} Yorum Ekle
                    </button>
                    <button type="button" class="btn-icon" style="width:32px;height:32px" data-add-reminder="${escapeHtml(m.id)}" title="Hatırlatıcı Ekle" aria-label="${escapeHtml(m.username)} için hatırlatıcı ekle">
                      ${icon('alarm')}
                    </button>
                    <button type="button" class="btn-icon" style="width:32px;height:32px" data-toggle-pin="${escapeHtml(m.id)}" title="${m.isPinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}" aria-label="${escapeHtml(m.username)} sabitle">
                      ${icon('pin')}
                    </button>
                    <button type="button" class="btn-icon" style="width:32px;height:32px" data-open-history="${escapeHtml(m.id)}" title="Detay ve Yorum Geçmişi" aria-label="${escapeHtml(m.username)} detayları">
                      ${icon('more')}
                    </button>
                  </div>
                </div>

                ${
                  isExpanded
                    ? `
                  <div class="crm-inline-editor">
                    ${
                      templates.length > 0
                        ? `
                      <div class="template-chips">
                        ${templates
                          .map(
                            (t) => `<button type="button" class="template-insert-btn" data-insert-tpl="${escapeHtml(t.text)}">${escapeHtml(t.text)}</button>`,
                          )
                          .join('')}
                      </div>
                    `
                        : ''
                    }
                    <div style="display:flex;gap:8px;align-items:flex-end">
                      <textarea
                        id="inline-comment-input-${escapeHtml(m.id)}"
                        class="textarea"
                        rows="2"
                        style="flex:1;min-height:46px;resize:vertical"
                        placeholder="Yorum yazın… (Enter: Kaydet, Shift+Enter: Yeni satır)"
                      ></textarea>
                      <button type="button" class="btn btn-primary btn-sm" data-save-comment="${escapeHtml(m.id)}">Kaydet</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-cancel-comment="${escapeHtml(m.id)}">İptal</button>
                    </div>
                  </div>
                `
                    : ''
                }
              </div>
            `;
            })
            .join('')}
        </div>
      `
      }
    `;

    // Quick Add Member
    viewport.querySelector('#crm-quick-add-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = viewport.querySelector('#crm-add-username');
      const username = input.value.trim();
      if (!username) return;

      const btn = viewport.querySelector('#crm-add-submit-btn');
      btn.disabled = true;
      try {
        const res = await apiRequest('/members', { method: 'POST', body: { username } });
        input.value = '';
        showToast({
          title: 'Üye Eklendi',
          description: res.duplicateWarning || `${res.member.username} listeye eklendi.`,
          type: res.duplicateWarning ? 'warning' : 'success',
        });
        await loadData();
      } catch (err) {
        showToast({ title: 'Eklenemedi', description: err.message, type: 'danger' });
        btn.disabled = false;
      }
    });

    // Search & Filters
    let searchTimer = null;
    viewport.querySelector('#crm-search')?.addEventListener('input', (e) => {
      filters.search = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadData, 200);
    });
    viewport.querySelector('#crm-status-filter')?.addEventListener('change', (e) => {
      filters.status = e.target.value;
      loadData();
    });
    viewport.querySelector('#crm-sort')?.addEventListener('change', (e) => {
      filters.sort = e.target.value;
      loadData();
    });
    viewport.querySelector('#crm-owner-filter')?.addEventListener('change', (e) => {
      filters.ownerId = e.target.value;
      loadData();
    });
    viewport.querySelector('#crm-toggle-archive-btn')?.addEventListener('click', () => {
      filters.archived = !filters.archived;
      selectedIds.clear();
      loadData();
    });
    viewport.querySelector('#crm-new-reminder-btn')?.addEventListener('click', () => openReminderModal());

    // Reminders complete
    viewport.querySelectorAll('[data-done-rem]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/reminders/${btn.getAttribute('data-done-rem')}`, {
          method: 'PATCH',
          body: { isCompleted: true },
        });
        await loadData();
      });
    });

    // Checkboxes & Bulk
    viewport.querySelectorAll('.crm-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-id');
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        render();
      });
    });
    viewport.querySelector('#crm-bulk-pin')?.addEventListener('click', async () => {
      await apiRequest('/members/bulk', {
        method: 'POST',
        body: { ids: Array.from(selectedIds), action: 'pin' },
      });
      selectedIds.clear();
      await loadData();
    });
    viewport.querySelector('#crm-bulk-archive')?.addEventListener('click', async () => {
      await apiRequest('/members/bulk', {
        method: 'POST',
        body: { ids: Array.from(selectedIds), action: filters.archived ? 'unarchive' : 'archive' },
      });
      selectedIds.clear();
      await loadData();
    });

    // Inline status
    viewport.querySelectorAll('.crm-inline-status').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await apiRequest(`/members/${sel.getAttribute('data-id')}`, {
          method: 'PATCH',
          body: { status: sel.value },
        });
        showToast({ title: 'Durum Güncellendi', type: 'success' });
      });
    });

    // Pin toggle
    viewport.querySelectorAll('[data-toggle-pin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-toggle-pin');
        const m = members.find((x) => x.id === id);
        if (!m) return;
        await apiRequest(`/members/${id}`, {
          method: 'PATCH',
          body: { isPinned: !m.isPinned },
        });
        await loadData();
      });
    });

    // Open reminder for member
    viewport.querySelectorAll('[data-add-reminder]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = members.find((x) => x.id === btn.getAttribute('data-add-reminder'));
        if (m) openReminderModal(m);
      });
    });

    // Open history drawer
    viewport.querySelectorAll('[data-open-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = members.find((x) => x.id === btn.getAttribute('data-open-history'));
        if (m) openCommentHistoryDrawer(m);
      });
    });

    // Inline Comment Editor
    viewport.querySelectorAll('[data-toggle-comment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-comment');
        expandedCommentMemberId = expandedCommentMemberId === id ? null : id;
        render();
        if (expandedCommentMemberId) {
          viewport.querySelector(`#inline-comment-input-${expandedCommentMemberId}`)?.focus();
        }
      });
    });

    if (expandedCommentMemberId) {
      const mid = expandedCommentMemberId;
      const textarea = viewport.querySelector(`#inline-comment-input-${mid}`);
      const saveComment = async () => {
        const content = textarea.value.trim();
        if (!content) {
          showToast({ title: 'Uyarı', description: 'Yorum metni boş olamaz.', type: 'warning' });
          return;
        }
        try {
          await apiRequest(`/members/${mid}/comments`, {
            method: 'POST',
            body: { content },
          });
          expandedCommentMemberId = null;
          showToast({ title: 'Yorum Kaydedildi', type: 'success' });
          await loadData();
        } catch (err) {
          showToast({ title: 'Hata', description: err.message, type: 'danger' });
        }
      };

      viewport.querySelectorAll('[data-insert-tpl]').forEach((tBtn) => {
        tBtn.addEventListener('click', () => {
          const tplText = tBtn.getAttribute('data-insert-tpl');
          textarea.value = textarea.value ? `${textarea.value} ${tplText}` : tplText;
          textarea.focus();
        });
      });

      textarea?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveComment();
        }
        if (e.key === 'Escape') {
          expandedCommentMemberId = null;
          render();
        }
      });

      viewport.querySelector(`[data-save-comment="${mid}"]`)?.addEventListener('click', saveComment);
      viewport.querySelector(`[data-cancel-comment="${mid}"]`)?.addEventListener('click', () => {
        expandedCommentMemberId = null;
        render();
      });
    }
  };

  const reminderEventHandler = () => openReminderModal();
  window.addEventListener('mb:open-reminder-modal', reminderEventHandler);

  await loadData();
  return () => window.removeEventListener('mb:open-reminder-modal', reminderEventHandler);
}
