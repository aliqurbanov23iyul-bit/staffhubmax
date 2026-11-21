import { apiRequest } from '../api.js';
import { closeModal, openDrawer, openModal } from '../components/layout.js';
import { renderAnimatedCheckmark } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { clientState, hasClientPermission } from '../store.js';
import { copyTextToClipboard, escapeHtml, formatCurrencyTry, formatDateTimeTr, renderAvatar } from '../utils.js';

export async function renderStaffManagementPage(viewport) {
  const canManage = hasClientPermission('staff.manage');
  let users = [];

  const loadUsers = async () => {
    const res = await apiRequest('/users');
    users = res.users || [];
    render();
  };

  const showTempPasswordModal = (user, temporaryPassword, isReset = false) => {
    openModal({
      title: isReset ? 'Yeni Geçici Şifre Oluşturuldu' : 'Hesap Başarıyla Oluşturuldu',
      bodyHtml: `
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px">
          ${renderAnimatedCheckmark(52)}
          <div style="font-size:14px;color:var(--text-secondary)">
            <strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.role)}) için geçici şifre yalnızca bir kez görüntülenmektedir.
          </div>
          <div style="width:100%;padding:14px;border-radius:var(--radius-md);background:var(--bg-elevated);border:1px solid var(--border-strong);text-align:left;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;font-size:13px">
              <span style="color:var(--text-secondary)">Kullanıcı Adı:</span>
              <strong class="tabular-nums">${escapeHtml(user.username)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px">
              <span style="color:var(--text-secondary)">Geçici Şifre:</span>
              <strong class="tabular-nums" style="color:var(--accent-secondary)" data-testid="generated-temp-password">${escapeHtml(temporaryPassword)}</strong>
            </div>
          </div>
          <button type="button" class="btn btn-primary" id="copy-creds-btn" style="width:100%">
            ${icon('copy')} Bilgileri Kopyala
          </button>
        </div>
      `,
      onMount: (root) => {
        const copyBtn = root.querySelector('#copy-creds-btn');
        copyBtn?.addEventListener('click', async () => {
          const text = `Kullanıcı Adı: ${user.username}\nGeçici Şifre: ${temporaryPassword}`;
          await copyTextToClipboard(text);
          copyBtn.innerHTML = `${icon('check')} Kopyalandı!`;
          copyBtn.classList.remove('btn-primary');
          copyBtn.classList.add('btn-success');
          showToast({ title: 'Bilgiler Kopyalandı', description: 'Kullanıcı adı ve geçici şifre panoya kopyalandı.', type: 'success' });
        });
      },
    });
  };

  const openCreateAccountModal = () => {
    openModal({
      title: 'Yeni Hesap Oluştur',
      bodyHtml: `
        <form id="create-user-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label class="field-label" for="cu-username">Kullanıcı Adı (Zorunlu)</label>
            <input id="cu-username" class="input" placeholder="Personel kullanıcı adı" required />
          </div>
          <div class="field">
            <label class="field-label" for="cu-display">Görünen Ad (Opsiyonel)</label>
            <input id="cu-display" class="input" placeholder="Örn: Ayşe Yılmaz" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field">
              <label class="field-label" for="cu-role">Rol</label>
              <select id="cu-role" class="select">
                <option value="Menecer">Menecer</option>
                <option value="Takım Lideri">Takım Lideri</option>
                <option value="İşlem Admini">İşlem Admini</option>
                ${clientState.user?.role === 'Super Admin' ? '<option value="Super Admin">Super Admin</option>' : ''}
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="cu-team">Takım</label>
              <input id="cu-team" class="input" value="VIP Ekip" placeholder="VIP Ekip" />
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            Hesap oluşturulduğunda 14 karakterli kriptografik geçici şifre otomatik üretilir.
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
            <button type="button" class="btn btn-secondary" id="cu-cancel">İptal</button>
            <button type="submit" class="btn btn-primary" id="cu-submit">Hesap Oluştur</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#cu-cancel')?.addEventListener('click', closeModal);
        root.querySelector('#create-user-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = root.querySelector('#cu-submit');
          btn.disabled = true;
          try {
            const res = await apiRequest('/users', {
              method: 'POST',
              body: {
                username: root.querySelector('#cu-username').value.trim(),
                displayName: root.querySelector('#cu-display').value.trim(),
                role: root.querySelector('#cu-role').value,
                team: root.querySelector('#cu-team').value.trim(),
              },
            });
            closeModal();
            await loadUsers();
            showTempPasswordModal(res.user, res.temporaryPassword, false);
          } catch (err) {
            showToast({ title: 'Hesap Oluşturulamadı', description: err.message, type: 'danger' });
            btn.disabled = false;
          }
        });
      },
    });
  };

  const openInspectDrawer = async (userId, initialTab = 'members') => {
    try {
      const data = await apiRequest(`/users/${userId}/inspect`);
      const u = data.user;
      let activeTab = initialTab;

      const renderDrawerBody = (root) => {
        const tabs = [
          { id: 'members', label: `Üyeler (${data.members.length})` },
          { id: 'comments', label: `Yorumlar (${data.comments.length})` },
          { id: 'operations', label: `İşlemler (${data.operations.length})` },
          { id: 'breaks', label: `Molalar (${data.breaks.length})` },
          { id: 'ftd', label: `FTD (${data.ftdEntries.length})` },
          { id: 'activity', label: 'Aktivite' },
        ];

        let tabContent = '';
        if (activeTab === 'members') {
          tabContent =
            data.members.length === 0
              ? '<div style="color:var(--text-secondary)">Kayıtlı üye yok.</div>'
              : data.members
                  .map(
                    (m) => `
                  <div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-elevated);margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between"><strong>${escapeHtml(m.username)}</strong><span>${escapeHtml(m.status)}</span></div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:3px">${escapeHtml(m.latestComment || 'Yorum yok')}</div>
                  </div>
                `,
                  )
                  .join('');
        } else if (activeTab === 'comments') {
          tabContent =
            data.comments.length === 0
              ? '<div style="color:var(--text-secondary)">Yorum yok.</div>'
              : data.comments
                  .map(
                    (c) => `
                  <div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-elevated);margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)">
                      <span>${escapeHtml(c.authorName)}</span><span class="tabular-nums">${formatDateTimeTr(c.createdAt)}</span>
                    </div>
                    <div style="margin-top:3px;font-size:13px">${escapeHtml(c.content)}</div>
                  </div>
                `,
                  )
                  .join('');
        } else if (activeTab === 'operations') {
          tabContent =
            data.operations.length === 0
              ? '<div style="color:var(--text-secondary)">İşlem kaydı yok.</div>'
              : data.operations
                  .map(
                    (o) => `
                  <div style="padding:10px;border-radius:var(--radius-sm);background:var(--bg-elevated);margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between"><strong>${escapeHtml(o.memberUsername)}</strong><span>${escapeHtml(o.status)}</span></div>
                    <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(o.operationType)} · ${formatDateTimeTr(o.createdAt)}</div>
                  </div>
                `,
                  )
                  .join('');
        } else if (activeTab === 'breaks') {
          tabContent = data.breaks
            .map(
              (b) => `
            <div style="display:flex;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:var(--bg-elevated);margin-bottom:8px">
              <span>${b.breakNumber}. Mola (${escapeHtml(b.scheduledTime)} · ${b.plannedMinutes} dk)</span>
              <strong>${escapeHtml(b.timing.status)}</strong>
            </div>
          `,
            )
            .join('');
        } else if (activeTab === 'ftd') {
          tabContent =
            data.ftdEntries.length === 0
              ? '<div style="color:var(--text-secondary)">FTD kaydı yok.</div>'
              : data.ftdEntries
                  .map(
                    (f) => `
                  <div style="display:flex;justify-content:space-between;padding:10px;border-radius:var(--radius-sm);background:var(--bg-elevated);margin-bottom:8px">
                    <span><strong>${escapeHtml(f.memberUsername)}</strong> · ${formatCurrencyTry(f.amount)}</span>
                    <span>${escapeHtml(f.status)}</span>
                  </div>
                `,
                  )
                  .join('');
        } else {
          tabContent = data.activityHistory
            .map(
              (a) => `
            <div style="padding:8px 0;border-bottom:1px solid var(--border-hairline);font-size:12.5px">
              <div style="display:flex;justify-content:space-between"><strong>${escapeHtml(a.action)}</strong><span class="tabular-nums">${formatDateTimeTr(a.createdAt)}</span></div>
              <div style="color:var(--text-secondary)">${escapeHtml(a.details)}</div>
            </div>
          `,
            )
            .join('');
        }

        const body = root.querySelector('.modal-body');
        if (!body) return;
        body.innerHTML = `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
            ${tabs.map((t) => `<button type="button" class="segmented-btn ${activeTab === t.id ? 'active' : ''}" data-inspect-tab="${t.id}" style="background:${activeTab === t.id ? 'var(--accent-primary)' : 'var(--bg-elevated)'}">${escapeHtml(t.label)}</button>`).join('')}
          </div>
          <div>${tabContent}</div>
        `;
        body.querySelectorAll('[data-inspect-tab]').forEach((btn) => {
          btn.addEventListener('click', () => {
            activeTab = btn.getAttribute('data-inspect-tab');
            renderDrawerBody(root);
          });
        });
      };

      openDrawer({
        title: `${u.displayName} — Personel İnceleme`,
        subtitle: `${u.username} · ${u.role} · ${u.team}`,
        bodyHtml: '<div></div>',
        onMount: renderDrawerBody,
      });
    } catch (err) {
      showToast({ title: 'İnceleme Açılamadı', description: err.message, type: 'danger' });
    }
  };

  const render = () => {
    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Personel Yönetimi</h2>
          <p class="page-desc">Personel hesaplarını yönetin, yeni hesap oluşturun ve çalışma kayıtlarını inceleyin.</p>
        </div>
        ${
          canManage
            ? `<button type="button" class="btn btn-primary" id="new-account-btn">${icon('plus')} Yeni Hesap Oluştur</button>`
            : ''
        }
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Personel</th>
              <th>Kullanıcı Adı</th>
              <th>Rol</th>
              <th>Takım</th>
              <th>Durum</th>
              <th>Son Giriş</th>
              <th style="text-align:right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            ${users
              .map(
                (u) => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    ${renderAvatar(u, u.avatarColor, u.avatarUrl, 30)}
                    <div>
                      <div style="font-weight:600">${escapeHtml(u.displayName)}</div>
                      <div style="font-size:11px;color:${u.isOnline ? 'var(--success)' : 'var(--text-muted)'}">${u.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}</div>
                    </div>
                  </div>
                </td>
                <td class="tabular-nums">${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.role)}</td>
                <td>${escapeHtml(u.team)}</td>
                <td><span class="status-tag ${u.isActive ? 'status-completed' : 'status-rejected'}">${u.isActive ? 'Aktif' : 'Devre Dışı'}</span></td>
                <td class="tabular-nums">${u.lastLoginAt ? formatDateTimeTr(u.lastLoginAt) : 'Henüz yok'}</td>
                <td style="text-align:right">
                  <div style="display:inline-flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">
                    <button type="button" class="btn btn-secondary btn-sm" data-inspect-u="${escapeHtml(u.id)}" data-tab="members">İncele</button>
                    ${
                      canManage
                        ? `
                      <button type="button" class="btn btn-secondary btn-sm" data-reset-pw="${escapeHtml(u.id)}">Şifre Sıfırla</button>
                      <button type="button" class="btn ${u.isActive ? 'btn-danger' : 'btn-success'} btn-sm" data-toggle-active="${escapeHtml(u.id)}" data-next="${!u.isActive}">
                        ${u.isActive ? 'Devre Dışı' : 'Aktifleştir'}
                      </button>
                    `
                        : ''
                    }
                  </div>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    viewport.querySelector('#new-account-btn')?.addEventListener('click', openCreateAccountModal);
    viewport.querySelectorAll('[data-inspect-u]').forEach((btn) => {
      btn.addEventListener('click', () =>
        openInspectDrawer(btn.getAttribute('data-inspect-u'), btn.getAttribute('data-tab')),
      );
    });
    viewport.querySelectorAll('[data-reset-pw]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await apiRequest(`/users/${btn.getAttribute('data-reset-pw')}/reset-password`, {
            method: 'POST',
          });
          showTempPasswordModal(res.user, res.temporaryPassword, true);
        } catch (err) {
          showToast({ title: 'Hata', description: err.message, type: 'danger' });
        }
      });
    });
    viewport.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/users/${btn.getAttribute('data-toggle-active')}`, {
            method: 'PATCH',
            body: { isActive: btn.getAttribute('data-next') === 'true' },
          });
          showToast({ title: 'Hesap Durumu Güncellendi', type: 'success' });
          await loadUsers();
        } catch (err) {
          showToast({ title: 'Hata', description: err.message, type: 'danger' });
        }
      });
    });
  };

  await loadUsers();
}

export async function renderReportsPage(viewport) {
  const data = await apiRequest('/reports');
  const ob = data.operationBreakdown;

  viewport.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Raporlar</h2>
        <p class="page-desc">Takım hacimleri, operasyon dağılımları ve FTD özet raporları.</p>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card"><div class="kpi-top"><span>Toplam İşlem</span></div><div class="kpi-value tabular-nums">${ob.total}</div></div>
      <div class="kpi-card"><div class="kpi-top"><span>Tamamlanan</span></div><div class="kpi-value tabular-nums" style="color:var(--success)">${ob.completed}</div></div>
      <div class="kpi-card"><div class="kpi-top"><span>Reddedilen</span></div><div class="kpi-value tabular-nums" style="color:var(--danger)">${ob.rejected}</div></div>
      <div class="kpi-card"><div class="kpi-top"><span>Toplam FTD Tutarı</span></div><div class="kpi-value tabular-nums">${formatCurrencyTry(data.ftdStats.totalAmount)}</div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Takım Bazlı Özet</h3></div>
        <div class="table-wrap" style="border:none">
          <table class="data-table">
            <thead><tr><th>Takım</th><th>Üye Kaydı</th><th>İşlem Talebi</th><th>FTD Hacmi</th></tr></thead>
            <tbody>
              ${data.teamSummary
                .map(
                  (t) => `
                <tr>
                  <td><strong>${escapeHtml(t.team)}</strong></td>
                  <td class="tabular-nums">${t.members}</td>
                  <td class="tabular-nums">${t.operations}</td>
                  <td class="tabular-nums">${formatCurrencyTry(t.ftdAmount)}</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Admin İşlem Performansı</h3></div>
        <div class="table-wrap" style="border:none">
          <table class="data-table">
            <thead><tr><th>Admin</th><th>Tamamlanan</th><th>Reddedilen</th><th>Ort. Yanıt</th></tr></thead>
            <tbody>
              ${
                data.adminPerformance.length === 0
                  ? '<tr><td colspan="4">Veri yok.</td></tr>'
                  : data.adminPerformance
                      .map(
                        (a) => `
                    <tr>
                      <td><strong>${escapeHtml(a.adminName)}</strong></td>
                      <td class="tabular-nums">${a.completedCount}</td>
                      <td class="tabular-nums">${a.rejectedCount}</td>
                      <td class="tabular-nums">${a.avgResponseSeconds} sn</td>
                    </tr>
                  `,
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function renderAuditLogsPage(viewport) {
  let search = '';
  const load = async () => {
    const res = await apiRequest(`/audit-logs?search=${encodeURIComponent(search)}`);
    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Sistem Kayıtları</h2>
          <p class="page-desc">Kritik hesap, operasyon, mola, FTD ve yetki değişikliklerinin denetim günlüğü.</p>
        </div>
        <input id="audit-search" class="input input-sm" style="width:240px" placeholder="Kayıtlarda ara…" value="${escapeHtml(search)}" />
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Zaman</th><th>Personel</th><th>Rol</th><th>İşlem</th><th>Detay</th></tr></thead>
          <tbody>
            ${res.logs
              .map(
                (l) => `
              <tr>
                <td class="tabular-nums">${formatDateTimeTr(l.createdAt)}</td>
                <td><strong>${escapeHtml(l.actorName)}</strong></td>
                <td>${escapeHtml(l.actorRole)}</td>
                <td><span class="status-tag status-neutral">${escapeHtml(l.action)}</span></td>
                <td>${escapeHtml(l.details)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    let t = null;
    viewport.querySelector('#audit-search')?.addEventListener('input', (e) => {
      search = e.target.value;
      clearTimeout(t);
      t = setTimeout(load, 220);
    });
  };
  await load();
}

export async function renderPermissionsPage(viewport) {
  const data = await apiRequest('/permissions');
  let matrix = data.matrix;
  let activeRole = 'İşlem Admini';

  const render = () => {
    const editableRoles = data.roles.filter((r) => r !== 'Super Admin');
    const rolePerms = new Set(matrix[activeRole] || []);

    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Yetki Yönetimi</h2>
          <p class="page-desc">Roller arası modül ve hassas işlem yetkilerini yapılandırın.</p>
        </div>
        <div class="segmented">
          ${editableRoles.map((r) => `<button type="button" class="segmented-btn ${activeRole === r ? 'active' : ''}" data-perm-role="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(activeRole)} Yetki Matrisi</h3>
            <p class="card-subtitle">Super Admin tüm yetkilere kalıcı olarak sahiptir.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="save-perms-btn">Yetkileri Kaydet</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
          ${data.permissions
            .map(
              (p) => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-md);background:var(--bg-elevated);cursor:pointer">
              <input type="checkbox" class="perm-check" value="${escapeHtml(p.key)}" ${rolePerms.has(p.key) ? 'checked' : ''} />
              <div>
                <div style="font-weight:600;font-size:13px">${escapeHtml(p.label)}</div>
                <div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(p.group)}</div>
              </div>
            </label>
          `,
            )
            .join('')}
        </div>
      </div>
    `;

    viewport.querySelectorAll('[data-perm-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeRole = btn.getAttribute('data-perm-role');
        render();
      });
    });

    viewport.querySelector('#save-perms-btn')?.addEventListener('click', async () => {
      const checked = Array.from(viewport.querySelectorAll('.perm-check:checked')).map((el) => el.value);
      const res = await apiRequest('/permissions', {
        method: 'PATCH',
        body: { role: activeRole, permissions: checked },
      });
      matrix = res.matrix;
      showToast({ title: 'Yetkiler Güncellendi', description: `${activeRole} yetkileri kaydedildi.`, type: 'success' });
    });
  };

  render();
}
