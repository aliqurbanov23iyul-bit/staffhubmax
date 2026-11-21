import { apiRequest } from '../api.js';
import { openDrawer } from '../components/layout.js';
import { renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { escapeHtml, formatDateTr, formatTimeTr } from '../utils.js';

export async function renderAllOperationsPage(viewport) {
  let users = [];
  let operations = [];
  let adminPerformance = [];
  const filters = {
    managerId: 'all',
    adminId: 'all',
    memberUsername: '',
    operationType: '',
    status: 'Tümü',
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    timeFrom: '',
    timeTo: '',
    sort: 'newest',
  };

  const loadUsers = async () => {
    const res = await apiRequest('/users');
    users = res.users || [];
  };

  const loadData = async () => {
    const qs = new URLSearchParams(filters).toString();
    const res = await apiRequest(`/operations/all?${qs}`);
    operations = res.operations || [];
    adminPerformance = res.adminPerformance || [];
    render();
  };

  const openOpDetailDrawer = async (opId) => {
    try {
      const res = await apiRequest(`/operations/${opId}/history`);
      const op = res.operation;
      const history = res.history || [];

      openDrawer({
        title: `İşlem Detayı — ${op.memberUsername}`,
        subtitle: `${op.operationType} · Talep: ${formatDateTr(op.createdAt)} ${formatTimeTr(op.createdAt)}`,
        bodyHtml: `
          <div style="display:flex;flex-direction:column;gap:18px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border-radius:var(--radius-md);background:var(--bg-elevated)">
              <div><div style="font-size:11.5px;color:var(--text-secondary)">Menecer</div><strong>${escapeHtml(op.managerName)}</strong></div>
              <div><div style="font-size:11.5px;color:var(--text-secondary)">Durum</div><strong>${escapeHtml(op.status)}</strong></div>
              <div><div style="font-size:11.5px;color:var(--text-secondary)">İşleme Alan Admin</div><strong>${escapeHtml(op.claimedByAdminName || '—')}</strong></div>
              <div><div style="font-size:11.5px;color:var(--text-secondary)">Sonuçlandıran Admin</div><strong>${escapeHtml(op.resolvedByAdminName || '—')}</strong></div>
            </div>

            ${
              op.rejectionReason
                ? `<div class="ops-msg-reason"><strong>Reddetme Nedeni:</strong> ${escapeHtml(op.rejectionReason)}</div>`
                : ''
            }

            <div>
              <strong style="font-size:13px;display:block;margin-bottom:12px">İşlem Zaman Çizelgesi</strong>
              <div class="timeline-list">
                ${history
                  .map(
                    (h) => `
                  <div class="timeline-item">
                    <span class="timeline-node"></span>
                    <div>
                      <div style="font-size:13px;font-weight:600">
                        <span class="tabular-nums">${formatTimeTr(h.createdAt)}</span> — ${escapeHtml(h.note)}
                      </div>
                      <div style="font-size:11.5px;color:var(--text-secondary)">${formatDateTr(h.createdAt)} · ${escapeHtml(h.status)}</div>
                    </div>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `,
      });
    } catch (err) {
      showToast({ title: 'Hata', description: err.message, type: 'danger' });
    }
  };

  const render = () => {
    const managers = users.filter((u) => ['Menecer', 'Takım Lideri', 'Super Admin'].includes(u.role));
    const admins = users.filter((u) => ['İşlem Admini', 'Super Admin'].includes(u.role));

    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Tüm İşlemler — Super Admin Denetimi</h2>
          <p class="page-desc">Kurum genelindeki tüm operasyon taleplerini çoklu filtrelerle inceleyin ve admin performansını izleyin.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="all-ops-reset">Filtreleri Sıfırla</button>
      </div>

      <!-- Admin Performance Summary -->
      ${
        adminPerformance.length > 0
          ? `
        <div class="kpi-grid" style="margin-bottom:16px">
          ${adminPerformance
            .slice(0, 4)
            .map(
              (ap) => `
            <div class="kpi-card">
              <div class="kpi-top"><span>${escapeHtml(ap.adminName)}</span><span class="kpi-icon-box">${icon('bolt')}</span></div>
              <div class="kpi-value tabular-nums">${ap.completedCount} <span style="font-size:13px;color:var(--text-secondary)">tamamlandı</span></div>
              <div class="kpi-meta tabular-nums">${ap.inProgressCount} işlemde · ${ap.rejectedCount} red · Ort. ${ap.avgResponseSeconds} sn yanıt</div>
            </div>
          `,
            )
            .join('')}
        </div>
      `
          : ''
      }

      <!-- Multi-Filter Bar -->
      <div class="card" style="margin-bottom:16px;padding:14px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
          <div class="field">
            <label class="field-label" for="f-mgr">Menecer</label>
            <select id="f-mgr" class="select input-sm">
              <option value="all">Tümü</option>
              ${managers.map((u) => `<option value="${escapeHtml(u.id)}" ${filters.managerId === u.id ? 'selected' : ''}>${escapeHtml(u.displayName)}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="f-adm">İşlem Admini</label>
            <select id="f-adm" class="select input-sm">
              <option value="all">Tümü</option>
              ${admins.map((u) => `<option value="${escapeHtml(u.id)}" ${filters.adminId === u.id ? 'selected' : ''}>${escapeHtml(u.displayName)}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="f-member">Üye Kullanıcı Adı</label>
            <input id="f-member" class="input input-sm" placeholder="Örn: ali4133" value="${escapeHtml(filters.memberUsername)}" />
          </div>

          <div class="field">
            <label class="field-label" for="f-type">İşlem Türü</label>
            <input id="f-type" class="input input-sm" placeholder="Örn: Kayıp Bonusu" value="${escapeHtml(filters.operationType)}" />
          </div>

          <div class="field">
            <label class="field-label" for="f-status">Durum</label>
            <select id="f-status" class="select input-sm">
              <option value="Tümü" ${filters.status === 'Tümü' ? 'selected' : ''}>Tümü</option>
              <option value="Bekliyor" ${filters.status === 'Bekliyor' ? 'selected' : ''}>Bekliyor</option>
              <option value="İşleme Alındı" ${filters.status === 'İşleme Alındı' ? 'selected' : ''}>İşleme Alındı</option>
              <option value="Tamamlandı" ${filters.status === 'Tamamlandı' ? 'selected' : ''}>Tamamlandı</option>
              <option value="Reddedildi" ${filters.status === 'Reddedildi' ? 'selected' : ''}>Reddedildi</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="f-date">Tarih</label>
            <select id="f-date" class="select input-sm">
              <option value="all" ${filters.datePreset === 'all' ? 'selected' : ''}>Tümü</option>
              <option value="today" ${filters.datePreset === 'today' ? 'selected' : ''}>Bugün</option>
              <option value="yesterday" ${filters.datePreset === 'yesterday' ? 'selected' : ''}>Dün</option>
              <option value="week" ${filters.datePreset === 'week' ? 'selected' : ''}>Bu Hafta</option>
              <option value="month" ${filters.datePreset === 'month' ? 'selected' : ''}>Bu Ay</option>
              <option value="custom" ${filters.datePreset === 'custom' ? 'selected' : ''}>Özel Tarih Aralığı</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="f-sort">Sıralama</label>
            <select id="f-sort" class="select input-sm">
              <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>En Yeni Önce</option>
              <option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>En Eski Önce</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:flex-end">
          ${
            filters.datePreset === 'custom'
              ? `
            <div class="field" style="width:150px">
              <label class="field-label" for="f-dfrom">Başlangıç Tarihi</label>
              <input id="f-dfrom" type="date" class="input input-sm" value="${escapeHtml(filters.dateFrom)}" />
            </div>
            <div class="field" style="width:150px">
              <label class="field-label" for="f-dto">Bitiş Tarihi</label>
              <input id="f-dto" type="date" class="input input-sm" value="${escapeHtml(filters.dateTo)}" />
            </div>
          `
              : ''
          }
          <div class="field" style="width:130px">
            <label class="field-label" for="f-tfrom">Saat Başlangıç</label>
            <input id="f-tfrom" type="time" class="input input-sm" value="${escapeHtml(filters.timeFrom)}" />
          </div>
          <div class="field" style="width:130px">
            <label class="field-label" for="f-tto">Saat Bitiş</label>
            <input id="f-tto" type="time" class="input input-sm" value="${escapeHtml(filters.timeTo)}" />
          </div>
          <div style="margin-left:auto;font-size:12.5px;color:var(--text-secondary)">
            Toplam <strong class="tabular-nums">${operations.length}</strong> kayıt listeleniyor
          </div>
        </div>
      </div>

      ${
        operations.length === 0
          ? `<div class="card empty-state">${renderEmptyStateGraphic()}<div>Seçili filtrelere uygun işlem kaydı bulunamadı.</div></div>`
          : `
        <div class="table-wrap">
          <table class="data-table" data-testid="all-operations-table">
            <thead>
              <tr>
                <th>Menecer</th>
                <th>Üye</th>
                <th>İşlem Türü</th>
                <th>Talep Tarihi</th>
                <th>Talep Saati</th>
                <th>İşleme Alan Admin</th>
                <th>Sonuçlandıran Admin</th>
                <th>Durum</th>
                <th>Sonuçlanma Saati</th>
              </tr>
            </thead>
            <tbody>
              ${operations
                .map(
                  (op) => `
                <tr class="clickable-row" data-op-detail="${escapeHtml(op.id)}">
                  <td>${escapeHtml(op.managerName)}</td>
                  <td style="font-weight:600">${escapeHtml(op.memberUsername)}</td>
                  <td>${escapeHtml(op.operationType)}</td>
                  <td class="tabular-nums">${formatDateTr(op.createdAt)}</td>
                  <td class="tabular-nums">${formatTimeTr(op.createdAt)}</td>
                  <td>${escapeHtml(op.claimedByAdminName || '—')}</td>
                  <td>${escapeHtml(op.resolvedByAdminName || '—')}</td>
                  <td><span class="status-tag ${op.status === 'Tamamlandı' ? 'status-completed' : op.status === 'İşleme Alındı' ? 'status-processing' : op.status === 'Reddedildi' ? 'status-rejected' : 'status-waiting'}">${escapeHtml(op.status)}</span></td>
                  <td class="tabular-nums">${op.resolvedAt ? formatTimeTr(op.resolvedAt) : '—'}</td>
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

    const bind = (id, key, isInput = false) => {
      const el = viewport.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener(isInput ? 'input' : 'change', (e) => {
        filters[key] = e.target.value;
        loadData();
      });
    };

    bind('f-mgr', 'managerId');
    bind('f-adm', 'adminId');
    bind('f-member', 'memberUsername', true);
    bind('f-type', 'operationType', true);
    bind('f-status', 'status');
    bind('f-date', 'datePreset');
    bind('f-sort', 'sort');
    bind('f-dfrom', 'dateFrom');
    bind('f-dto', 'dateTo');
    bind('f-tfrom', 'timeFrom');
    bind('f-tto', 'timeTo');

    viewport.querySelector('#all-ops-reset')?.addEventListener('click', () => {
      Object.assign(filters, {
        managerId: 'all',
        adminId: 'all',
        memberUsername: '',
        operationType: '',
        status: 'Tümü',
        datePreset: 'all',
        dateFrom: '',
        dateTo: '',
        timeFrom: '',
        timeTo: '',
        sort: 'newest',
      });
      loadData();
    });

    viewport.querySelectorAll('[data-op-detail]').forEach((row) => {
      row.addEventListener('click', () => openOpDetailDrawer(row.getAttribute('data-op-detail')));
    });
  };

  await loadUsers();
  await loadData();
}
