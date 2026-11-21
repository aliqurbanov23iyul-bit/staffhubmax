import { apiRequest } from '../api.js';
import { closeModal, openModal } from '../components/layout.js';
import { renderBreakRing, renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { playNotificationSound } from '../sounds.js';
import { clientState } from '../store.js';
import { escapeHtml, formatMmSs, formatTimeTr } from '../utils.js';

export async function renderBreaksPage(viewport, { isAdminControl = false } = {}) {
  let myBreaks = [];
  let serverOffsetMs = 0;
  let adminData = { sessions: [], activeBreaks: [], overdueBreaks: [] };
  let users = [];
  let ticker = null;
  let dueNotifiedIds = new Set();

  const loadData = async () => {
    if (isAdminControl) {
      const [ctrlRes, usrRes] = await Promise.all([
        apiRequest('/breaks/control'),
        apiRequest('/users'),
      ]);
      adminData = ctrlRes;
      users = usrRes.users || [];
      serverOffsetMs = new Date(ctrlRes.serverTime).getTime() - Date.now();
    } else {
      const res = await apiRequest('/breaks/my');
      myBreaks = res.breaks || [];
      serverOffsetMs = new Date(res.serverTime).getTime() - Date.now();
      for (const b of myBreaks) {
        if (b.timing.status === 'Mola Saati Geldi' && !dueNotifiedIds.has(b.id)) {
          dueNotifiedIds.add(b.id);
          playNotificationSound('break', clientState.settings);
          showToast({
            title: 'Mola Saatiniz Geldi',
            description: `${b.breakNumber}. Mola (${b.scheduledTime}) için hazırsanız Molaya Çık butonuna basın.`,
            type: 'warning',
          });
        }
      }
    }
    render();
  };

  const computeLiveTiming = (b) => {
    const nowMs = Date.now() + serverOffsetMs;
    const totalSec = Math.max(1, (b.plannedMinutes + b.extraMinutes) * 60);
    if (b.status === 'Tamamlandı') {
      return b.timing;
    }
    if (b.status === 'Molada' || b.status === 'Gecikti') {
      const startMs = b.startedAt ? new Date(b.startedAt).getTime() : nowMs;
      const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      const remaining = Math.max(0, totalSec - elapsed);
      const overdue = Math.max(0, elapsed - totalSec);
      return {
        status: overdue > 0 ? 'Gecikti' : 'Molada',
        totalAllowedSeconds: totalSec,
        elapsedSeconds: elapsed,
        remainingSeconds: remaining,
        overdueSeconds: overdue,
        overdueMinutes: overdue > 0 ? Math.max(1, Math.floor(overdue / 60)) : 0,
        isOverdue: overdue > 0,
      };
    }
    return b.timing;
  };

  const updateTickersInPlace = () => {
    viewport.querySelectorAll('[data-live-break]').forEach((el) => {
      const id = el.getAttribute('data-live-break');
      const list = isAdminControl ? adminData.sessions : myBreaks;
      const b = list.find((item) => item.id === id);
      if (!b || (b.status !== 'Molada' && b.status !== 'Gecikti')) return;
      const t = computeLiveTiming(b);
      const cdEl = el.querySelector('.break-countdown');
      if (cdEl) {
        cdEl.textContent = t.isOverdue
          ? `+${formatMmSs(t.overdueSeconds)}`
          : formatMmSs(t.remainingSeconds);
        cdEl.style.color = t.isOverdue ? 'var(--danger)' : 'var(--text-primary)';
      }
      const ringHost = el.querySelector('[data-break-ring]');
      if (ringHost) {
        const pct = t.isOverdue
          ? 100
          : Math.round((t.remainingSeconds / t.totalAllowedSeconds) * 100);
        ringHost.innerHTML = renderBreakRing(pct, t.isOverdue);
      }
    });
  };

  const openAddBreakModal = () => {
    openModal({
      title: 'Yeni Mola Planı Ekle',
      bodyHtml: `
        <form id="add-break-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label class="field-label" for="ab-user">Personel</label>
            <select id="ab-user" class="select" required>
              ${users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName)} (${escapeHtml(u.role)})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="ab-time">Mola Saati (SS:DD)</label>
            <input id="ab-time" type="time" class="input" value="15:00" required />
          </div>
          <div class="field">
            <label class="field-label" for="ab-dur">Süre (Dakika)</label>
            <input id="ab-dur" type="number" class="input" min="5" max="120" value="15" required />
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
            <button type="button" class="btn btn-secondary" id="ab-cancel">İptal</button>
            <button type="submit" class="btn btn-primary">Mola Ekle</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#ab-cancel')?.addEventListener('click', closeModal);
        root.querySelector('#add-break-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await apiRequest('/breaks/schedules', {
              method: 'POST',
              body: {
                userId: root.querySelector('#ab-user').value,
                scheduledTime: root.querySelector('#ab-time').value,
                durationMinutes: Number(root.querySelector('#ab-dur').value),
              },
            });
            closeModal();
            showToast({ title: 'Mola Planlandı', type: 'success' });
            await loadData();
          } catch (err) {
            showToast({ title: 'Hata', description: err.message, type: 'danger' });
          }
        });
      },
    });
  };

  const openEditBreakModal = (session) => {
    openModal({
      title: `${session.userName} — ${session.breakNumber}. Mola Düzenle`,
      bodyHtml: `
        <form id="edit-break-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label class="field-label" for="eb-time">Planlanan Saat</label>
            <input id="eb-time" type="time" class="input" value="${escapeHtml(session.scheduledTime)}" required />
          </div>
          <div class="field">
            <label class="field-label" for="eb-dur">Planlanan Süre (Dakika)</label>
            <input id="eb-dur" type="number" class="input" min="5" max="120" value="${session.plannedMinutes}" required />
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button type="button" class="btn btn-secondary" id="eb-cancel">İptal</button>
            <button type="submit" class="btn btn-primary">Güncelle</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#eb-cancel')?.addEventListener('click', closeModal);
        root.querySelector('#edit-break-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await apiRequest(`/breaks/schedules/${session.id}`, {
            method: 'PATCH',
            body: {
              scheduledTime: root.querySelector('#eb-time').value,
              durationMinutes: Number(root.querySelector('#eb-dur').value),
            },
          });
          closeModal();
          showToast({ title: 'Mola Güncellendi', type: 'success' });
          await loadData();
        });
      },
    });
  };

  const render = () => {
    if (isAdminControl) {
      viewport.innerHTML = `
        <div class="page-header">
          <div>
            <h2 class="page-title">Mola Kontrolü — Yönetim</h2>
            <p class="page-desc">Aktif molalar, süre aşımları ve personel mola programlarını yönetin.</p>
          </div>
          <button type="button" class="btn btn-primary" id="admin-add-break-btn">${icon('plus')} Yeni Mola Ekle</button>
        </div>

        ${
          adminData.overdueBreaks.length > 0
            ? `
          <div class="alert-banner">
            <div>
              <strong>MOLA SÜRESİ AŞILDI</strong>
              ${adminData.overdueBreaks
                .map(
                  (ob) => `
                <div style="font-size:13px;margin-top:4px">
                  Personel: <strong>${escapeHtml(ob.userName)}</strong> · Planlanan Süre: ${ob.plannedMinutes + ob.extraMinutes} Dakika ·
                  Geçen Süre: ${Math.floor(ob.timing.elapsedSeconds / 60)} Dakika ·
                  <strong>Gecikme: ${ob.timing.overdueMinutes} Dakika</strong>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }

        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi-card">
            <div class="kpi-top"><span>Aktif Moladaki Personel</span><span class="kpi-icon-box">${icon('clock')}</span></div>
            <div class="kpi-value tabular-nums">${adminData.activeBreaks.length}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-top"><span>Geciken Molalar</span><span class="kpi-icon-box" style="color:var(--danger);background:var(--danger-soft)">${icon('alert')}</span></div>
            <div class="kpi-value tabular-nums" style="color:${adminData.overdueBreaks.length > 0 ? 'var(--danger)' : 'var(--text-primary)'}">${adminData.overdueBreaks.length}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-top"><span>Bugünkü Toplam Mola Planı</span><span class="kpi-icon-box">${icon('timer')}</span></div>
            <div class="kpi-value tabular-nums">${adminData.sessions.length}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-top"><span>Tamamlanan Molalar</span><span class="kpi-icon-box">${icon('check-circle')}</span></div>
            <div class="kpi-value tabular-nums">${adminData.sessions.filter((s) => s.status === 'Tamamlandı').length}</div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Mola</th>
                <th>Planlanan Saat</th>
                <th>Süre</th>
                <th>Durum</th>
                <th>Başlangıç / Bitiş</th>
                <th style="text-align:right">Kontrol</th>
              </tr>
            </thead>
            <tbody>
              ${adminData.sessions
                .map((s) => {
                  const t = computeLiveTiming(s);
                  const badgeClass =
                    t.status === 'Tamamlandı'
                      ? 'status-completed'
                      : t.status === 'Gecikti'
                        ? 'status-rejected'
                        : t.status === 'Molada'
                          ? 'status-processing'
                          : 'status-neutral';
                  return `
                  <tr data-live-break="${escapeHtml(s.id)}">
                    <td><strong>${escapeHtml(s.userName)}</strong><div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(s.team)}</div></td>
                    <td>${s.breakNumber}. Mola</td>
                    <td class="tabular-nums">${escapeHtml(s.scheduledTime)}</td>
                    <td class="tabular-nums">${s.plannedMinutes} dk ${s.extraMinutes > 0 ? `(+${s.extraMinutes} dk)` : ''}</td>
                    <td>
                      <span class="status-tag ${badgeClass}">${escapeHtml(t.status)}</span>
                      ${s.status === 'Molada' || s.status === 'Gecikti' ? `<span class="break-countdown tabular-nums" style="font-size:13px;margin-left:8px">${t.isOverdue ? `+${formatMmSs(t.overdueSeconds)}` : formatMmSs(t.remainingSeconds)}</span>` : ''}
                    </td>
                    <td class="tabular-nums">${s.startedAt ? formatTimeTr(s.startedAt) : '—'} / ${s.endedAt ? formatTimeTr(s.endedAt) : '—'}</td>
                    <td style="text-align:right">
                      <div style="display:inline-flex;gap:6px">
                        <button type="button" class="btn btn-secondary btn-sm" data-extend-break="${escapeHtml(s.id)}">+5 Dk</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-edit-break="${escapeHtml(s.id)}">Düzenle</button>
                        ${s.status === 'Molada' || s.status === 'Gecikti' ? `<button type="button" class="btn btn-danger btn-sm" data-admin-end-break="${escapeHtml(s.id)}">Bitir</button>` : ''}
                        ${s.status === 'Planlandı' ? `<button type="button" class="btn btn-ghost btn-sm" data-del-break="${escapeHtml(s.id)}" aria-label="Sil">${icon('trash')}</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;

      viewport.querySelector('#admin-add-break-btn')?.addEventListener('click', openAddBreakModal);
      viewport.querySelectorAll('[data-extend-break]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiRequest(`/breaks/${btn.getAttribute('data-extend-break')}/extend`, {
            method: 'POST',
            body: { minutes: 5 },
          });
          showToast({ title: '+5 Dakika Eklendi', type: 'success' });
          await loadData();
        });
      });
      viewport.querySelectorAll('[data-edit-break]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const s = adminData.sessions.find((x) => x.id === btn.getAttribute('data-edit-break'));
          if (s) openEditBreakModal(s);
        });
      });
      viewport.querySelectorAll('[data-admin-end-break]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiRequest(`/breaks/${btn.getAttribute('data-admin-end-break')}/end`, {
            method: 'POST',
          });
          await loadData();
        });
      });
      viewport.querySelectorAll('[data-del-break]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiRequest(`/breaks/schedules/${btn.getAttribute('data-del-break')}`, {
            method: 'DELETE',
          });
          await loadData();
        });
      });
      return;
    }

    // Manager Four-Card Break Management View
    const activeBreak = myBreaks.find((b) => b.status === 'Molada' || b.status === 'Gecikti');
    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Mola Yönetimi</h2>
          <p class="page-desc">Planlanan mola kartlarınızdan molaya çıkabilir, canlı geri sayımı takip edebilirsiniz.</p>
        </div>
      </div>

      ${
        myBreaks.length === 0
          ? `<div class="card empty-state">${renderEmptyStateGraphic()}<div>Bugün için tanımlanmış mola programınız bulunmuyor.</div></div>`
          : `
        <div class="break-grid" data-testid="break-cards-grid">
          ${myBreaks
            .map((b, idx) => {
              const t = computeLiveTiming(b);
              const isActive = b.status === 'Molada' || b.status === 'Gecikti';
              const isDue = t.status === 'Mola Saati Geldi';
              const cardCls = t.isOverdue
                ? 'is-overdue'
                : isActive
                  ? 'is-active'
                  : isDue
                    ? 'is-due'
                    : '';
              const statusCls =
                t.status === 'Tamamlandı'
                  ? 'status-completed'
                  : t.status === 'Gecikti'
                    ? 'status-rejected'
                    : t.status === 'Molada'
                      ? 'status-processing'
                      : isDue
                        ? 'status-waiting'
                        : 'status-neutral';
              const isCompleted = b.status === 'Tamamlandı';
              const ringPct = isActive
                ? t.isOverdue
                  ? 100
                  : Math.round((t.remainingSeconds / t.totalAllowedSeconds) * 100)
                : isCompleted
                  ? 100
                  : 0;

              return `
              <div class="break-card anim-stagger ${cardCls}" style="animation-delay:${idx * 50}ms" data-live-break="${escapeHtml(b.id)}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
                  <div>
                    <div style="font-family:var(--font-display);font-weight:700;font-size:15.5px">${b.breakNumber}. Mola</div>
                    <div class="meta-line" style="margin-top:3px">
                      <span class="tabular-nums">${escapeHtml(b.scheduledTime)}</span>
                      <span aria-hidden="true">·</span>
                      <span class="tabular-nums">${b.plannedMinutes + b.extraMinutes} Dakika</span>
                    </div>
                  </div>
                  <div data-break-ring>${renderBreakRing(ringPct, t.isOverdue, isCompleted)}</div>
                </div>

                <div>
                  <span class="status-tag ${statusCls}">${escapeHtml(t.status)}</span>
                  ${isDue ? '<div style="margin-top:6px;font-size:12.5px;font-weight:600;color:var(--warning)">Mola saatiniz geldi</div>' : ''}
                </div>

                <div style="margin-top:auto">
                  ${
                    isActive
                      ? `
                    <div style="margin-bottom:10px">
                      <div style="font-size:11.5px;color:${t.isOverdue ? 'var(--danger)' : 'var(--text-secondary)'}">${t.isOverdue ? 'Süre Aşımı' : 'Kalan Süre'}</div>
                      <div class="break-countdown" style="color:${t.isOverdue ? 'var(--danger)' : 'var(--text-primary)'}">
                        ${t.isOverdue ? `+${formatMmSs(t.overdueSeconds)}` : formatMmSs(t.remainingSeconds)}
                      </div>
                    </div>
                    <button type="button" class="btn btn-danger" style="width:100%" data-end-break="${escapeHtml(b.id)}">Molayı Bitir</button>
                  `
                      : b.status === 'Tamamlandı'
                        ? `<div class="tabular-nums" style="font-size:12.5px;color:var(--text-secondary)">${formatTimeTr(b.startedAt)} — ${formatTimeTr(b.endedAt)} arası kullanıldı.</div>`
                        : `<button type="button" class="btn ${isDue ? 'btn-primary' : 'btn-secondary'}" style="width:100%" data-start-break="${escapeHtml(b.id)}" ${activeBreak ? 'disabled' : ''}>Molaya Çık</button>`
                  }
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `
      }
    `;

    viewport.querySelectorAll('[data-start-break]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/breaks/${btn.getAttribute('data-start-break')}/start`, {
            method: 'POST',
          });
          showToast({ title: 'Molaya Çıkıldı', description: 'Geri sayım başlatıldı.', type: 'info' });
          await loadData();
        } catch (err) {
          showToast({ title: 'Başlatılamadı', description: err.message, type: 'danger' });
        }
      });
    });

    viewport.querySelectorAll('[data-end-break]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/breaks/${btn.getAttribute('data-end-break')}/end`, {
            method: 'POST',
          });
          showToast({ title: 'Mola Tamamlandı', type: 'success' });
          await loadData();
        } catch (err) {
          showToast({ title: 'Hata', description: err.message, type: 'danger' });
        }
      });
    });
  };

  const wsHandler = (ev) => {
    if (ev.detail?.event === 'sync:refresh') { loadData().catch(() => {}); return; }
    const { event } = ev.detail || {};
    if (event === 'break:updated' || event === 'break:overdue') {
      loadData();
    }
  };

  window.addEventListener('mb:ws', wsHandler);
  await loadData();
  ticker = setInterval(updateTickersInPlace, 1000);

  return () => {
    clearInterval(ticker);
    window.removeEventListener('mb:ws', wsHandler);
  };
}
