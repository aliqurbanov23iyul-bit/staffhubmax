import { apiRequest } from '../api.js';
import { closeModal, openModal } from '../components/layout.js';
import { renderBreakRing, renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { playNotificationSound } from '../sounds.js';
import { clientState } from '../store.js';
import { escapeHtml, formatMmSs } from '../utils.js';

const formatTimeTr = (value) => value ? new Intl.DateTimeFormat('tr-TR', {timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';

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

  let selectedUserId = '';
  let draftRows = [{ time: '13:00', duration: '15' }];
  const presets = [
    { label: '13:00', times: ['13:00', '14:15', '15:45', '17:00'] },
    { label: '13:15', times: ['13:15', '14:45', '16:15', '17:30'] },
    { label: '13:30', times: ['13:30', '15:00', '16:30', '17:45'] },
  ];
  const renderPlanRows = () => {
    const host = viewport.querySelector('#break-plan-rows');
    if (!host) return;
    host.innerHTML = draftRows.map((row, index) => `
      <div class="break-plan-row">
        <span class="break-plan-index">${index + 1}</span>
        <div class="field"><label for="bp-time-${index}" class="field-label">Saat</label><input id="bp-time-${index}" type="time" class="input" required value="${escapeHtml(row.time)}" data-plan-time="${index}" /></div>
        <div class="field"><label for="bp-duration-${index}" class="field-label">Dakika</label><div class="break-duration-field"><input id="bp-duration-${index}" class="input" type="number" min="5" max="120" step="1" required value="${escapeHtml(row.duration)}" data-plan-duration="${index}" /><div class="break-duration-presets"><button type="button" data-duration-pick="15" data-row="${index}" aria-label="${index + 1}. mola 15 dakika" class="${row.duration === '15' ? 'active' : ''}">15</button><button type="button" data-duration-pick="30" data-row="${index}" aria-label="${index + 1}. mola 30 dakika" class="${row.duration === '30' ? 'active' : ''}">30</button></div></div></div>
        <button type="button" class="btn-icon" data-remove-plan-row="${index}" aria-label="${index + 1}. mola satırını kaldır" ${draftRows.length === 1 ? 'disabled' : ''}>${icon('x')}</button>
      </div>`).join('');
    host.querySelectorAll('[data-plan-time]').forEach((input) => input.addEventListener('input', () => { draftRows[Number(input.dataset.planTime)].time = input.value; }));
    host.querySelectorAll('[data-plan-duration]').forEach((input) => input.addEventListener('input', () => {
      const index = Number(input.dataset.planDuration); draftRows[index].duration = input.value;
      host.querySelectorAll(`[data-duration-pick][data-row="${index}"]`).forEach((btn) => btn.classList.toggle('active', btn.dataset.durationPick === input.value));
    }));
    host.querySelectorAll('[data-duration-pick]').forEach((button) => button.addEventListener('click', () => { draftRows[Number(button.dataset.row)].duration = button.dataset.durationPick; renderPlanRows(); }));
    host.querySelectorAll('[data-remove-plan-row]').forEach((button) => button.addEventListener('click', () => { if (draftRows.length > 1) draftRows.splice(Number(button.dataset.removePlanRow), 1); renderPlanRows(); }));
    viewport.querySelector('#bp-save').textContent = draftRows.length > 1 ? `${draftRows.length} Molayı Kaydet` : 'Molayı Kaydet';
    viewport.querySelector('#bp-add-row').disabled = draftRows.length >= 12;
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
          const button = root.querySelector('button[type="submit"]');
          button.disabled = true;
          try {
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
          } catch (error) { showToast({title:'Mola Güncellenemedi',description:error.message,type:'danger'}); }
          finally { button.disabled = false; }
        });
      },
    });
  };

  const render = () => {
    if (isAdminControl) {
      const activeUsers = users.filter((user) => user.isActive);
      viewport.innerHTML = `
        <div class="page-header">
          <div><h2 class="page-title">Mola Kontrolü</h2><p class="page-desc">Personeli seçin, saat ve süreyi yazın. Tüm saatler İstanbul saatidir.</p></div>
          <div class="break-overview"><span><strong>${adminData.activeBreaks.length}</strong> molada</span><span class="${adminData.overdueBreaks.length ? 'is-overdue' : ''}"><strong>${adminData.overdueBreaks.length}</strong> geciken</span><span><strong>${adminData.sessions.length}</strong> planlı mola</span></div>
        </div>
        <section class="card break-planner" aria-labelledby="break-planner-title">
          <div class="card-header"><div><h3 class="card-title" id="break-planner-title">Mola Ekle</h3><p class="card-subtitle">Tek bir mola ya da günlük programı birlikte ekleyin.</p></div><span class="break-timezone">İstanbul · UTC+3</span></div>
          <form id="break-plan-form">
            <div class="break-plan-top">
              <div class="field"><label class="field-label" for="bp-user">Personel</label><select id="bp-user" class="select" required><option value="">Personel seçin…</option>${activeUsers.map((user) => `<option value="${escapeHtml(user.id)}" ${selectedUserId === user.id ? 'selected' : ''}>${escapeHtml(user.displayName)}</option>`).join('')}</select></div>
              <div class="field"><span class="field-label">Hızlı program · 15 / 30 / 15 / 15 dk</span><div class="break-program-presets">${presets.map((preset, index) => `<button type="button" class="btn btn-secondary btn-sm" data-break-preset="${index}" title="${preset.times.join(' · ')}">${preset.label} başlangıç</button>`).join('')}</div></div>
            </div>
            <div id="break-plan-rows"></div>
            <div class="break-plan-footer"><button type="button" class="btn btn-ghost btn-sm" id="bp-add-row">${icon('plus')} Saat Satırı Ekle</button><button type="submit" class="btn btn-primary" id="bp-save">Molayı Kaydet</button></div>
            <p class="break-plan-note">Program her gün uygulanır. Mevcut molaların üzerine eklenir; çakışan saatler kaydedilmez.</p>
          </form>
        </section>
        <div class="break-schedule-heading"><h3 class="card-title">Personel Mola Programları</h3><input id="break-person-search" type="search" class="input input-sm" placeholder="Personel ara…" aria-label="Mola programında personel ara" /></div>
        <div class="break-person-list">
          ${activeUsers.map((user) => {
            const sessions = adminData.sessions.filter((session) => session.userId === user.id).sort((a,b) => a.scheduledTime.localeCompare(b.scheduledTime));
            return `<section class="card break-person" data-person-name="${escapeHtml(user.displayName.toLocaleLowerCase('tr'))}">
              <div class="break-person-header"><div><h3>${escapeHtml(user.displayName)}</h3><span>${escapeHtml(user.team)} · ${sessions.length} mola · ${sessions.reduce((sum, item) => sum + item.plannedMinutes, 0)} dk</span></div><button type="button" class="btn btn-secondary btn-sm" data-person-add-break="${escapeHtml(user.id)}">${icon('plus')} Mola Ekle</button></div>
              ${sessions.length ? `<div class="break-person-sessions">${sessions.map((session) => {
                const timing = computeLiveTiming(session);
                const active = ['Molada','Gecikti'].includes(session.status);
                return `<div class="break-schedule-line" data-live-break="${escapeHtml(session.id)}">
                  <div class="break-schedule-time"><strong class="tabular-nums">${escapeHtml(session.scheduledTime)}</strong><span>${session.plannedMinutes} dk${session.extraMinutes ? ` +${session.extraMinutes}` : ''}</span></div>
                  <span class="break-schedule-status ${timing.isOverdue ? 'is-overdue' : ''}">${escapeHtml(timing.status)}${active ? ` <span class="break-countdown tabular-nums">${timing.isOverdue ? '+' + formatMmSs(timing.overdueSeconds) : formatMmSs(timing.remainingSeconds)}</span>` : ''}</span>
                  <div class="break-schedule-actions">${active ? `<button type="button" class="btn btn-secondary btn-sm" data-extend-break="${escapeHtml(session.id)}">+5 dk</button><button type="button" class="btn btn-danger btn-sm" data-admin-end-break="${escapeHtml(session.id)}">Bitir</button>` : ''}<button type="button" class="btn btn-ghost btn-sm" data-edit-break="${escapeHtml(session.id)}" ${session.status === 'Tamamlandı' ? 'disabled' : ''}>Düzenle</button>${session.status === 'Planlandı' ? `<button type="button" class="btn-icon" data-del-break="${escapeHtml(session.id)}" aria-label="${escapeHtml(user.displayName)} ${escapeHtml(session.scheduledTime)} molasını sil">${icon('trash')}</button>` : ''}</div>
                </div>`;
              }).join('')}</div>` : '<div class="break-person-empty">Henüz mola eklenmedi.</div>'}
            </section>`;
          }).join('') || '<div class="card empty-state">Önce Personel Yönetimi bölümünden bir personel ekleyin.</div>'}
        </div><p id="break-no-match" class="break-person-empty" hidden>Eşleşen personel bulunamadı.</p>
      `;
      renderPlanRows();
      viewport.querySelector('#bp-user').addEventListener('change', (event) => { selectedUserId = event.target.value; });
      viewport.querySelectorAll('[data-break-preset]').forEach((button) => button.addEventListener('click', () => {
        draftRows = presets[Number(button.dataset.breakPreset)].times.map((time, index) => ({time, duration: index === 1 ? '30' : '15'})); renderPlanRows();
      }));
      viewport.querySelector('#bp-add-row').addEventListener('click', () => {
        if (draftRows.length >= 12) return;
        draftRows.push({time:'', duration:'15'}); renderPlanRows(); viewport.querySelector(`#bp-time-${draftRows.length - 1}`).focus();
      });
      viewport.querySelector('#break-plan-form').addEventListener('submit', async (event) => {
        event.preventDefault(); const button = viewport.querySelector('#bp-save'); button.disabled = true;
        try {
          const result = await apiRequest('/breaks/schedules/batch', {method:'POST', body:{userId:selectedUserId, breaks:draftRows.map((row) => ({scheduledTime:row.time,durationMinutes:Number(row.duration)}))}});
          showToast({title: `${result.schedules.length} Mola Eklendi`,type:'success'});
          draftRows = [{time:'13:00',duration:'15'}]; await loadData();
        } catch (error) { showToast({title:'Mola Eklenemedi',description:error.message,type:'danger'}); }
        finally { const current = viewport.querySelector('#bp-save'); if (current) current.disabled = false; }
      });
      viewport.querySelectorAll('[data-person-add-break]').forEach((button) => button.addEventListener('click', () => {
        selectedUserId = button.dataset.personAddBreak; viewport.querySelector('#bp-user').value = selectedUserId;
        viewport.querySelector('.break-planner').scrollIntoView({block:'start',behavior:'smooth'}); viewport.querySelector('#bp-time-0').focus({preventScroll:true});
      }));
      viewport.querySelector('#break-person-search').addEventListener('input', (event) => {
        const query = event.target.value.trim().toLocaleLowerCase('tr'); let visible = 0;
        viewport.querySelectorAll('[data-person-name]').forEach((card) => { card.hidden = !card.dataset.personName.includes(query); if (!card.hidden) visible++; });
        viewport.querySelector('#break-no-match').hidden = visible > 0;
      });
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
    if (ev.detail?.event === 'sync:refresh') { if (!viewport.querySelector('#break-plan-form')?.contains(document.activeElement)) loadData().catch(() => {}); return; }
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
