import { apiRequest } from '../api.js';
import { renderAnimatedCheckmark, renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { playNotificationSound } from '../sounds.js';
import { clientState, hasClientPermission } from '../store.js';
import { escapeHtml, formatCurrencyTry, formatDateTimeTr } from '../utils.js';

export async function renderFtdPage(viewport, { isApprovalView = false } = {}) {
  const canApprove = hasClientPermission('ftd.approve');
  const canCreate = hasClientPermission('ftd.create') || clientState.user?.role === 'Super Admin';
  const showGroupedAdmin = isApprovalView || canApprove;

  let data = { entries: [], grouped: [], stats: { totalCount: 0, approvedCount: 0, pendingCount: 0, totalAmount: 0 } };
  let users = [];
  let recentlyApprovedId = null;
  const filters = { managerId: 'all', date: '', status: 'Tümü', memberUsername: '' };

  const loadData = async () => {
    const qs = new URLSearchParams(filters).toString();
    const [ftdRes, usrRes] = await Promise.all([
      apiRequest(`/ftd?${qs}`),
      showGroupedAdmin ? apiRequest('/users') : Promise.resolve({ users: [] }),
    ]);
    data = ftdRes;
    users = usrRes.users || [];
    render();
  };

  const render = () => {
    const stats = data.stats;
    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">${showGroupedAdmin ? 'FTD Onayları ve Takibi' : 'FTD Tablosu'}</h2>
          <p class="page-desc">İlk Yatırım (FTD) kayıtları. Manuel girilen FTD kayıtları yetkili entegrasyon olmadan otomatik doğrulanmış sayılmaz.</p>
        </div>
      </div>

      <div class="kpi-grid ftd-kpis" style="margin-bottom:16px">
        <div class="kpi-card">
          <div class="kpi-top"><span>Toplam FTD Sayısı</span><span class="kpi-icon-box">${icon('wallet')}</span></div>
          <div class="kpi-value tabular-nums">${stats.totalCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-top"><span>Onaylanan FTD</span><span class="kpi-icon-box">${icon('check-circle')}</span></div>
          <div class="kpi-value tabular-nums" style="color:var(--success)">${stats.approvedCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-top"><span>Onay Bekleyen FTD</span><span class="kpi-icon-box">${icon('clock')}</span></div>
          <div class="kpi-value tabular-nums" style="color:var(--warning)">${stats.pendingCount}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-top"><span>Toplam FTD Tutarı</span><span class="kpi-icon-box">${icon('chart')}</span></div>
          <div class="kpi-value tabular-nums">${formatCurrencyTry(stats.totalAmount)}</div>
        </div>
      </div>

      ${
        canCreate && !isApprovalView
          ? `
        <form id="ftd-add-form" class="crm-quick-add" style="flex-wrap:wrap">
          <div style="flex:1;min-width:180px">
            <label for="ftd-member-input" style="position:absolute;width:1px;height:1px;overflow:hidden">Üye Kullanıcı Adı</label>
            <input id="ftd-member-input" class="input" placeholder="Üye kullanıcı adı (Örn: ali4133)" required />
          </div>
          <div style="width:160px">
            <label for="ftd-amount-input" style="position:absolute;width:1px;height:1px;overflow:hidden">FTD Tutarı (₺)</label>
            <input id="ftd-amount-input" type="number" step="0.01" min="1" class="input" placeholder="Tutar (₺)" required />
          </div>
          <button type="submit" class="btn btn-primary">${icon('plus')} FTD Ekle</button>
        </form>
      `
          : ''
      }

      <div class="toolbar" style="margin-bottom:14px">
        <input id="ftd-f-member" class="input input-sm" style="width:180px" placeholder="Üye ara…" value="${escapeHtml(filters.memberUsername)}" />
        <select id="ftd-f-status" class="select input-sm" style="width:150px" aria-label="FTD Durum Filtresi">
          <option value="Tümü" ${filters.status === 'Tümü' ? 'selected' : ''}>Tüm Durumlar</option>
          <option value="Onay Bekliyor" ${filters.status === 'Onay Bekliyor' ? 'selected' : ''}>Onay Bekliyor</option>
          <option value="Onaylandı" ${filters.status === 'Onaylandı' ? 'selected' : ''}>Onaylandı</option>
        </select>
        <input id="ftd-f-date" type="date" class="input input-sm" style="width:150px" value="${escapeHtml(filters.date)}" aria-label="Tarih filtresi" />
        ${
          showGroupedAdmin && users.length > 0
            ? `
          <select id="ftd-f-mgr" class="select input-sm" style="width:170px" aria-label="Menecer Filtresi">
            <option value="all">Tüm Menecerler</option>
            ${users.map((u) => `<option value="${escapeHtml(u.id)}" ${filters.managerId === u.id ? 'selected' : ''}>${escapeHtml(u.displayName)}</option>`).join('')}
          </select>
        `
            : ''
        }
      </div>

      ${
        data.entries.length === 0
          ? `<div class="card empty-state">${renderEmptyStateGraphic()}<div>Henüz eşleşen FTD kaydı bulunmuyor.</div></div>`
          : showGroupedAdmin
            ? `
          <div class="ftd-board" aria-label="Menecerlere göre FTD onay tablosu">
            ${data.grouped.map((group) => `
              <section class="ftd-sheet" aria-label="${escapeHtml(group.managerName)} FTD kayıtları">
                <header class="ftd-sheet-header">
                  <h3>${escapeHtml(group.managerName)}</h3>
                  <div class="ftd-sheet-summary"><span>${group.entries.length} kayıt</span><strong>${formatCurrencyTry(group.totalAmount)}</strong></div>
                  <span class="ftd-sheet-pending">${group.pendingCount} onay bekliyor</span>
                </header>
                <table class="ftd-sheet-table">
                  <thead><tr><th scope="col">Tarih / Kullanıcı</th><th scope="col">FTD / Onay</th></tr></thead>
                  <tbody>
                    ${[...group.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((entry) => `
                      <tr class="${entry.status === 'Onaylandı' ? 'ftd-approved' : 'ftd-pending'}">
                        <td><time class="ftd-entry-date" datetime="${escapeHtml(entry.createdAt)}">${formatDateTimeTr(entry.createdAt)}</time><strong class="ftd-entry-user">${escapeHtml(entry.memberUsername)}</strong></td>
                        <td><strong class="ftd-entry-amount tabular-nums">${formatCurrencyTry(entry.amount)}</strong>
                          ${entry.status === 'Onaylandı'
                            ? `<span class="ftd-entry-approved">${recentlyApprovedId === entry.id ? renderAnimatedCheckmark(14) : icon('check')} Onaylandı</span><span class="ftd-entry-approver">${escapeHtml(entry.approvedByAdminName || '')}</span>`
                            : canApprove ? `<button type="button" class="btn btn-success btn-sm" data-approve-ftd="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.memberUsername)} FTD kaydını onayla">${icon('check')} Onayla</button>` : '<span class="ftd-entry-waiting">Onay bekliyor</span>'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot><tr><th scope="row">Toplam</th><td class="tabular-nums">${formatCurrencyTry(group.totalAmount)}</td></tr></tfoot>
                </table>
              </section>
            `).join('')}
          </div>
        `
            : `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Üye Kullanıcı Adı</th><th>FTD Tutarı</th><th>Tarih</th><th>Durum</th><th>Onaylayan</th></tr></thead>
              <tbody>
                ${data.entries
                  .map(
                    (e) => `
                  <tr>
                    <td style="font-weight:600">${escapeHtml(e.memberUsername)}</td>
                    <td class="tabular-nums" style="font-weight:700">${formatCurrencyTry(e.amount)}</td>
                    <td class="tabular-nums">${formatDateTimeTr(e.createdAt)}</td>
                    <td><span class="status-tag ${e.status === 'Onaylandı' ? 'status-completed' : 'status-waiting'}">${escapeHtml(e.status)}</span></td>
                    <td>${escapeHtml(e.approvedByAdminName || '—')}</td>
                  </tr>
                `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
      }
    `;

    viewport.querySelector('#ftd-add-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberUsername = viewport.querySelector('#ftd-member-input').value.trim();
      const amount = Number(viewport.querySelector('#ftd-amount-input').value);
      try {
        await apiRequest('/ftd', { method: 'POST', body: { memberUsername, amount } });
        showToast({ title: 'FTD Kaydı Eklendi', description: `${memberUsername} — ${formatCurrencyTry(amount)}`, type: 'success' });
        await loadData();
      } catch (err) {
        showToast({ title: 'Eklenemedi', description: err.message, type: 'danger' });
      }
    });

    viewport.querySelectorAll('[data-approve-ftd]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-approve-ftd');
        btn.disabled = true;
        try {
          await apiRequest(`/ftd/${id}/approve`, { method: 'POST' });
          recentlyApprovedId = id;
          playNotificationSound('success', clientState.settings);
          showToast({ title: 'FTD Onaylandı', type: 'success' });
          await loadData();
        } catch (err) {
          showToast({ title: 'Onaylanamadı', description: err.message, type: 'danger' });
          btn.disabled = false;
        }
      });
    });

    let timer = null;
    viewport.querySelector('#ftd-f-member')?.addEventListener('input', (e) => {
      filters.memberUsername = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(loadData, 200);
    });
    viewport.querySelector('#ftd-f-status')?.addEventListener('change', (e) => {
      filters.status = e.target.value;
      loadData();
    });
    viewport.querySelector('#ftd-f-date')?.addEventListener('change', (e) => {
      filters.date = e.target.value;
      loadData();
    });
    viewport.querySelector('#ftd-f-mgr')?.addEventListener('change', (e) => {
      filters.managerId = e.target.value;
      loadData();
    });
  };

  const wsHandler = (ev) => {
    const { event } = ev.detail || {};
    if (event === 'sync:refresh') { loadData().catch(() => {}); return; }
    if (event === 'ftd:created' || event === 'ftd:approved') loadData();
  };

  window.addEventListener('mb:ws', wsHandler);
  await loadData();
  return () => window.removeEventListener('mb:ws', wsHandler);
}
