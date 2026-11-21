import { apiRequest } from '../api.js';
import { renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { clientState } from '../store.js';
import { escapeHtml, formatCurrencyTry, formatDateTimeTr, formatTimeTr } from '../utils.js';

function animateCounters(container) {
  container.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = Number(el.getAttribute('data-count-to'));
    if (!Number.isFinite(target)) return;
    if (clientState.settings?.animationIntensity === 'reduced') {
      el.textContent = target.toLocaleString('tr-TR');
      return;
    }
    const start = performance.now();
    const dur = 380;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('tr-TR');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export async function renderDashboardPage(viewport, navigateFn) {
  viewport.innerHTML = `
    <div class="kpi-grid">
      ${[1, 2, 3, 4].map(() => '<div class="kpi-card"><div class="skeleton" style="height:16px;width:55%"></div><div class="skeleton" style="height:30px;width:40%"></div></div>').join('')}
    </div>
  `;

  let filters = { employeeId: 'all', team: 'all', datePreset: 'all', status: 'Tümü' };

  const loadAndRender = async () => {
    try {
      const qs = new URLSearchParams(filters).toString();
      const data = await apiRequest(`/dashboard?${qs}`);
      const role = data.role;

      if (role === 'Super Admin') {
        const ov = data.superAdminOverview;
        const adm = data.adminStats;
        const totalOps = Math.max(1, ov.filteredOpsCount);

        viewport.innerHTML = `
          <div class="page-header">
            <div>
              <h2 class="page-title">Yönetim Genel Bakış</h2>
              <p class="page-desc">Kurum genelindeki operasyonlar, personel durumu ve FTD metrikleri.</p>
            </div>
            <div class="toolbar">
              <select class="select" id="sa-filter-emp" style="width:170px" aria-label="Personel Filtresi">
                <option value="all">Tüm Personel</option>
                ${ov.employees.map((e) => `<option value="${escapeHtml(e.id)}" ${filters.employeeId === e.id ? 'selected' : ''}>${escapeHtml(e.displayName)}</option>`).join('')}
              </select>
              <select class="select" id="sa-filter-team" style="width:140px" aria-label="Takım Filtresi">
                <option value="all">Tüm Takımlar</option>
                ${ov.teams.map((t) => `<option value="${escapeHtml(t)}" ${filters.team === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
              <select class="select" id="sa-filter-date" style="width:130px" aria-label="Tarih Filtresi">
                <option value="all" ${filters.datePreset === 'all' ? 'selected' : ''}>Tüm Tarihler</option>
                <option value="today" ${filters.datePreset === 'today' ? 'selected' : ''}>Bugün</option>
                <option value="yesterday" ${filters.datePreset === 'yesterday' ? 'selected' : ''}>Dün</option>
                <option value="week" ${filters.datePreset === 'week' ? 'selected' : ''}>Bu Hafta</option>
                <option value="month" ${filters.datePreset === 'month' ? 'selected' : ''}>Bu Ay</option>
              </select>
              <select class="select" id="sa-filter-status" style="width:145px" aria-label="Durum Filtresi">
                <option value="Tümü" ${filters.status === 'Tümü' ? 'selected' : ''}>Tüm Durumlar</option>
                <option value="Bekliyor" ${filters.status === 'Bekliyor' ? 'selected' : ''}>Bekliyor</option>
                <option value="İşleme Alındı" ${filters.status === 'İşleme Alındı' ? 'selected' : ''}>İşleme Alındı</option>
                <option value="Tamamlandı" ${filters.status === 'Tamamlandı' ? 'selected' : ''}>Tamamlandı</option>
                <option value="Reddedildi" ${filters.status === 'Reddedildi' ? 'selected' : ''}>Reddedildi</option>
              </select>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card anim-stagger">
              <div class="kpi-top"><span>Filtrelenen İşlem</span><span class="kpi-icon-box">${icon('bolt')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${ov.filteredOpsCount}">0</div>
              <div class="kpi-meta">${ov.filteredCompletedCount} tamamlandı · ${ov.filteredPendingCount} bekliyor</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:40ms">
              <div class="kpi-top"><span>Online / Aktif Personel</span><span class="kpi-icon-box">${icon('users')}</span></div>
              <div class="kpi-value tabular-nums"><span data-count-to="${adm.onlineStaff}">0</span> <span style="font-size:15px;color:var(--text-secondary)">/ ${ov.activeEmployees}</span></div>
              <div class="kpi-meta">${adm.onBreakStaff} molada · ${adm.overdueBreaks} geciken mola</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:80ms">
              <div class="kpi-top"><span>Toplam Üye Kaydı</span><span class="kpi-icon-box">${icon('shield-user')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${ov.totalMembers}">0</div>
              <div class="kpi-meta">Aktif CRM portföyü</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:120ms">
              <div class="kpi-top"><span>FTD Hacmi</span><span class="kpi-icon-box">${icon('wallet')}</span></div>
              <div class="kpi-value tabular-nums">${formatCurrencyTry(ov.ftdStats.totalAmount)}</div>
              <div class="kpi-meta">${ov.ftdStats.approvedCount} onaylı · ${ov.ftdStats.pendingCount} onay bekliyor</div>
            </div>
          </div>

          <div class="grid-2" style="margin-top:16px">
            <div class="card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Son Filtrelenen İşlemler</h3>
                  <p class="card-subtitle">Detay ve zaman çizelgesi için Tüm İşlemler sayfasını açın.</p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="dash-go-all-ops">Tüm İşlemler</button>
              </div>
              ${
                ov.recentFilteredOps.length === 0
                  ? `<div class="empty-state">${renderEmptyStateGraphic()}<span>Seçili filtreye uygun işlem bulunamadı.</span></div>`
                  : `
                <div class="table-wrap" style="border:none">
                  <table class="data-table">
                    <thead><tr><th>Menecer</th><th>Üye</th><th>İşlem</th><th>Durum</th><th>Saat</th></tr></thead>
                    <tbody>
                      ${ov.recentFilteredOps
                        .map(
                          (op) => `
                        <tr>
                          <td>${escapeHtml(op.managerName)}</td>
                          <td style="font-weight:600">${escapeHtml(op.memberUsername)}</td>
                          <td>${escapeHtml(op.operationType)}</td>
                          <td><span class="status-tag ${op.status === 'Tamamlandı' ? 'status-completed' : op.status === 'İşleme Alındı' ? 'status-processing' : op.status === 'Reddedildi' ? 'status-rejected' : 'status-waiting'}">${escapeHtml(op.status)}</span></td>
                          <td class="tabular-nums">${formatTimeTr(op.createdAt)}</td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
              }
            </div>

            <div class="card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Admin İşlem Dağılımı ve Yanıt Süresi</h3>
                  <p class="card-subtitle">Operasyon sonuçlandırma performansı</p>
                </div>
              </div>
              ${
                ov.adminPerformance.length === 0
                  ? '<div style="padding:24px;color:var(--text-secondary);font-size:13px">Henüz sonuçlandırılmış işlem verisi yok.</div>'
                  : `
                <div style="display:flex;flex-direction:column;gap:14px">
                  ${ov.adminPerformance
                    .map((ap) => {
                      const pct = Math.round((ap.totalHandled / totalOps) * 100);
                      return `
                        <div>
                          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">
                            <strong>${escapeHtml(ap.adminName)}</strong>
                            <span class="tabular-nums" style="color:var(--text-secondary)">${ap.completedCount} tamam · ${ap.rejectedCount} red · Ort. ${ap.avgResponseSeconds} sn</span>
                          </div>
                          <div class="progress-track"><div class="progress-fill" style="width:${Math.max(8, pct)}%"></div></div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              `
              }
              <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--border-hairline)">
                <strong style="font-size:12.5px;color:var(--text-secondary);display:block;margin-bottom:8px">Son Sistem Aktiviteleri</strong>
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${data.recentActivities
                    .slice(0, 4)
                    .map(
                      (a) => `
                    <div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px">
                      <span><strong>${escapeHtml(a.actorName)}</strong> · ${escapeHtml(a.details)}</span>
                      <span class="tabular-nums" style="color:var(--text-muted);flex-shrink:0">${formatTimeTr(a.createdAt)}</span>
                    </div>
                  `,
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>
        `;

        viewport.querySelector('#sa-filter-emp')?.addEventListener('change', (e) => {
          filters.employeeId = e.target.value;
          loadAndRender();
        });
        viewport.querySelector('#sa-filter-team')?.addEventListener('change', (e) => {
          filters.team = e.target.value;
          loadAndRender();
        });
        viewport.querySelector('#sa-filter-date')?.addEventListener('change', (e) => {
          filters.datePreset = e.target.value;
          loadAndRender();
        });
        viewport.querySelector('#sa-filter-status')?.addEventListener('change', (e) => {
          filters.status = e.target.value;
          loadAndRender();
        });
        viewport.querySelector('#dash-go-all-ops')?.addEventListener('click', () => navigateFn('all-operations'));
      } else if (role === 'İşlem Admini') {
        const adm = data.adminStats;
        viewport.innerHTML = `
          <div class="page-header">
            <div>
              <h2 class="page-title">Operasyon Admin Merkezi</h2>
              <p class="page-desc">Canlı işlem kuyruğu, personel mola durumu ve bekleyen FTD onayları.</p>
            </div>
            <div class="toolbar">
              <button type="button" class="btn btn-primary" id="adm-go-ops-chat">${icon('bolt')} İşlem Chat'e Git</button>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card anim-stagger">
              <div class="kpi-top"><span>Bekleyen İşlemler</span><span class="kpi-icon-box">${icon('bolt')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${adm.pendingOps}">0</div>
              <div class="kpi-meta">${adm.inProgressOps} talep işlemde</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:40ms">
              <div class="kpi-top"><span>Tamamlanan İşlemler</span><span class="kpi-icon-box">${icon('check-circle')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${adm.completedOps}">0</div>
              <div class="kpi-meta">Toplam sonuçlanan</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:80ms">
              <div class="kpi-top"><span>Online / Moladaki Personel</span><span class="kpi-icon-box">${icon('clock')}</span></div>
              <div class="kpi-value tabular-nums"><span data-count-to="${adm.onlineStaff}">0</span> <span style="font-size:15px;color:var(--text-secondary)">· ${adm.onBreakStaff} molada</span></div>
              <div class="kpi-meta" style="color:${adm.overdueBreaks > 0 ? 'var(--danger)' : 'var(--text-secondary)'}">${adm.overdueBreaks} geciken mola</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:120ms">
              <div class="kpi-top"><span>FTD Onay Bekleyen</span><span class="kpi-icon-box">${icon('wallet')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${adm.ftdPending}">0</div>
              <div class="kpi-meta">Onay bekleyen kayıt</div>
            </div>
          </div>

          <div class="grid-2" style="margin-top:16px">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Son Aktiviteler</h3>
                <button type="button" class="btn btn-secondary btn-sm" id="adm-go-breaks">Mola Kontrolü</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px">
                ${data.recentActivities
                  .map(
                    (a) => `
                  <div style="display:flex;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px solid var(--border-hairline);font-size:13px">
                    <span><strong>${escapeHtml(a.actorName)}</strong> — ${escapeHtml(a.details)}</span>
                    <span class="tabular-nums" style="color:var(--text-muted);flex-shrink:0">${formatTimeTr(a.createdAt)}</span>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Son Duyurular & Bildirimler</h3>
                <button type="button" class="btn btn-secondary btn-sm" id="adm-go-ftd">FTD Onayları</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px">
                ${data.myAnnouncements
                  .map(
                    (a) => `
                  <div style="padding:10px 12px;border-radius:var(--radius-md);background:var(--bg-elevated)">
                    <div style="font-weight:600;font-size:13px">${escapeHtml(a.title)}</div>
                    <div class="meta-line" style="margin-top:3px"><span>${escapeHtml(a.priority)}</span><span>·</span><span>${formatDateTimeTr(a.publishedAt)}</span></div>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `;
        viewport.querySelector('#adm-go-ops-chat')?.addEventListener('click', () => navigateFn('operations-chat'));
        viewport.querySelector('#adm-go-breaks')?.addEventListener('click', () => navigateFn('break-control'));
        viewport.querySelector('#adm-go-ftd')?.addEventListener('click', () => navigateFn('ftd-approvals'));
      } else {
        // Menecer / Takım Lideri Dashboard
        const ms = data.managerStats;
        viewport.innerHTML = `
          <div class="page-header">
            <div>
              <h2 class="page-title">Hoş geldiniz, ${escapeHtml(clientState.user.displayName)}</h2>
              <p class="page-desc">Üyeleriniz, bekleyen işlemleriniz, bugünkü hatırlatıcılar ve mola durumunuz.</p>
            </div>
            <div class="toolbar">
              <button type="button" class="btn btn-secondary" id="mgr-go-members">${icon('users')} Üyelerim</button>
              <button type="button" class="btn btn-primary" id="mgr-go-ops">${icon('bolt')} İşlem Talebi Gönder</button>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card anim-stagger">
              <div class="kpi-top"><span>Toplam Üyelerim</span><span class="kpi-icon-box">${icon('users')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${ms.totalMembers}">0</div>
              <div class="kpi-meta">Aktif portföy</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:40ms">
              <div class="kpi-top"><span>Bekleyen / Tamamlanan İşlem</span><span class="kpi-icon-box">${icon('bolt')}</span></div>
              <div class="kpi-value tabular-nums"><span data-count-to="${ms.pendingOps}">0</span> <span style="font-size:15px;color:var(--text-secondary)">/ ${ms.completedOps}</span></div>
              <div class="kpi-meta">Anlık operasyon takibi</div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:80ms">
              <div class="kpi-top"><span>Bugünkü Hatırlatıcılar · Mola</span><span class="kpi-icon-box">${icon('clock')}</span></div>
              <div class="kpi-value tabular-nums" data-count-to="${ms.todayReminders}">0</div>
              <div class="kpi-meta">Mola Durumu: <strong>${escapeHtml(ms.breakStatus)}</strong></div>
            </div>
            <div class="kpi-card anim-stagger" style="animation-delay:120ms">
              <div class="kpi-top"><span>FTD Sonuçlarım</span><span class="kpi-icon-box">${icon('wallet')}</span></div>
              <div class="kpi-value tabular-nums">${formatCurrencyTry(ms.ftdTotalAmount)}</div>
              <div class="kpi-meta">${ms.ftdApprovedCount} onaylı / ${ms.ftdCount} toplam kayıt</div>
            </div>
          </div>

          <div class="grid-2" style="margin-top:16px">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Son Duyurular</h3>
                <button type="button" class="btn btn-secondary btn-sm" id="mgr-go-ann">Tümünü Gör</button>
              </div>
              ${
                data.myAnnouncements.length === 0
                  ? '<div style="color:var(--text-secondary);font-size:13px">Henüz duyuru yok.</div>'
                  : `
                <div style="display:flex;flex-direction:column;gap:10px">
                  ${data.myAnnouncements
                    .map(
                      (a) => `
                    <div style="padding:12px;border-radius:var(--radius-md);background:var(--bg-elevated)">
                      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
                        <strong style="font-size:13.5px">${escapeHtml(a.title)}</strong>
                        <span class="status-tag ${a.acknowledged ? 'status-completed' : 'status-waiting'}">${a.acknowledged ? 'Okundu' : 'Onay Bekliyor'}</span>
                      </div>
                      <p style="margin:6px 0 0;font-size:12.5px;color:var(--text-secondary)">${escapeHtml(a.content.slice(0, 120))}${a.content.length > 120 ? '…' : ''}</p>
                    </div>
                  `,
                    )
                    .join('')}
                </div>
              `
              }
            </div>

            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Son Bildirimler</h3>
                <button type="button" class="btn btn-secondary btn-sm" id="mgr-go-notifs">Bildirim Merkezi</button>
              </div>
              ${
                data.myNotifications.length === 0
                  ? '<div style="color:var(--text-secondary);font-size:13px">Yeni bildiriminiz yok.</div>'
                  : `
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${data.myNotifications
                    .map(
                      (n) => `
                    <div style="padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--border-hairline);background:${n.isRead ? 'transparent' : 'var(--accent-soft)'}">
                      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600">
                        <span>${escapeHtml(n.title)}</span>
                        <span class="tabular-nums" style="font-size:11.5px;color:var(--text-muted)">${formatTimeTr(n.createdAt)}</span>
                      </div>
                      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${escapeHtml(n.description)}</div>
                    </div>
                  `,
                    )
                    .join('')}
                </div>
              `
              }
            </div>
          </div>
        `;
        viewport.querySelector('#mgr-go-members')?.addEventListener('click', () => navigateFn('members'));
        viewport.querySelector('#mgr-go-ops')?.addEventListener('click', () => navigateFn('operations-chat'));
        viewport.querySelector('#mgr-go-ann')?.addEventListener('click', () => navigateFn('announcements'));
        viewport.querySelector('#mgr-go-notifs')?.addEventListener('click', () => navigateFn('notifications'));
      }

      animateCounters(viewport);
    } catch (err) {
      viewport.innerHTML = `<div class="alert-banner">${escapeHtml(err.message)}</div>`;
    }
  };

  await loadAndRender();
}
