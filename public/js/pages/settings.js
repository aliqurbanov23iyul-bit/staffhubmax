import { apiRequest } from '../api.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { playNotificationSound, SOUND_STYLES, getSoundStyle, setSoundStyle } from '../sounds.js';
import { applyUserSettings, clientState } from '../store.js';
import { escapeHtml, formatDateTimeTr, renderAvatar } from '../utils.js';

const THEME_PRESETS = [
  { id: 'mor-neon', name: 'Mor Neon', color: '#8B5CF6' },
  { id: 'ocean-blue', name: 'Ocean Blue', color: '#3B82F6' },
  { id: 'emerald', name: 'Emerald', color: '#10B981' },
  { id: 'rose', name: 'Rose', color: '#EC4899' },
  { id: 'amber', name: 'Amber', color: '#F59E0B' },
  { id: 'midnight', name: 'Midnight', color: '#6366F1' },
];

export async function renderSettingsPage(viewport) {
  let activeTab = 'appearance';
  let templates = [];
  let meData = await apiRequest('/auth/me');
  clientState.settings = meData.settings;
  clientState.activeSessions = meData.activeSessions || [];
  const tplRes = await apiRequest('/comment-templates');
  templates = tplRes.templates || [];

  const saveSettingsPatch = async (patch) => {
    const res = await apiRequest('/settings', { method: 'PATCH', body: patch });
    clientState.settings = res.settings;
    clientState.user = res.user;
    applyUserSettings(res.settings);
    return res;
  };

  const render = () => {
    const s = clientState.settings;
    const u = clientState.user;

    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Ayarlar</h2>
          <p class="page-desc">Hesap güvenliği, canlı tema özelleştirmesi, bildirim tercihleri ve hazır yorum şablonları.</p>
        </div>
        <div class="segmented" role="tablist">
          <button type="button" class="segmented-btn ${activeTab === 'appearance' ? 'active' : ''}" data-stab="appearance">Görünüm</button>
          <button type="button" class="segmented-btn ${activeTab === 'account' ? 'active' : ''}" data-stab="account">Hesap & Güvenlik</button>
          <button type="button" class="segmented-btn ${activeTab === 'notifications' ? 'active' : ''}" data-stab="notifications">Bildirimler</button>
          <button type="button" class="segmented-btn ${activeTab === 'templates' ? 'active' : ''}" data-stab="templates">Hazır Yorumlar</button>
          <button type="button" class="segmented-btn ${activeTab === 'shortcuts' ? 'active' : ''}" data-stab="shortcuts">Kısayollar</button>
        </div>
      </div>

      <div id="settings-tab-body"></div>
    `;

    viewport.querySelectorAll('[data-stab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-stab');
        render();
      });
    });

    const body = viewport.querySelector('#settings-tab-body');

    if (activeTab === 'appearance') {
      body.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Tema Modu ve Renk Paletleri</h3></div>
            <div style="display:flex;flex-direction:column;gap:16px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                  <strong>Renk Modu</strong>
                  <div style="font-size:12px;color:var(--text-secondary)">Karanlık veya aydınlık arayüz arasında geçiş yapın.</div>
                </div>
                <div class="segmented">
                  <button type="button" class="segmented-btn ${s.themeMode === 'dark' ? 'active' : ''}" data-theme-mode="dark">Karanlık</button>
                  <button type="button" class="segmented-btn ${s.themeMode === 'light' ? 'active' : ''}" data-theme-mode="light">Aydınlık</button>
                </div>
              </div>

              <div>
                <strong style="display:block;margin-bottom:8px">Hazır Tema Paketleri (Canlı Önizleme)</strong>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
                  ${THEME_PRESETS.map(
                    (p) => `
                    <button type="button" class="demo-role-btn" data-preset-pick="${p.id}" style="border-color:${s.themePreset === p.id ? p.color : 'var(--border-hairline)'};display:flex;align-items:center;gap:8px">
                      <span style="width:14px;height:14px;border-radius:4px;background:${p.color};flex-shrink:0"></span>
                      <span style="font-weight:600">${p.name}</span>
                    </button>
                  `,
                  ).join('')}
                </div>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                  <strong>Özel Vurgu Rengi</strong>
                  <div style="font-size:12px;color:var(--text-secondary)">Arayüz vurgu tonunu özelleştirin.</div>
                </div>
                <input type="color" id="custom-accent-picker" value="${escapeHtml(s.customAccentColor || '#8B5CF6')}" style="width:44px;height:32px;border:none;background:transparent;cursor:pointer" aria-label="Özel vurgu rengi" />
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Düzen, Tipografi ve Hareket</h3></div>
            <div style="display:flex;flex-direction:column;gap:14px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label for="set-font-size"><strong>Yazı Boyutu</strong></label>
                <select id="set-font-size" class="select input-sm" style="width:150px">
                  <option value="compact" ${s.fontSize === 'compact' ? 'selected' : ''}>Kompakt</option>
                  <option value="normal" ${s.fontSize === 'normal' ? 'selected' : ''}>Normal</option>
                  <option value="large" ${s.fontSize === 'large' ? 'selected' : ''}>Büyük</option>
                </select>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label for="set-sidebar-w"><strong>Kenar Çubuğu Genişliği</strong></label>
                <select id="set-sidebar-w" class="select input-sm" style="width:150px">
                  <option value="narrow" ${s.sidebarWidth === 'narrow' ? 'selected' : ''}>Dar (220px)</option>
                  <option value="normal" ${s.sidebarWidth === 'normal' ? 'selected' : ''}>Standart (252px)</option>
                  <option value="wide" ${s.sidebarWidth === 'wide' ? 'selected' : ''}>Geniş (280px)</option>
                </select>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label for="set-anim"><strong>Animasyon Yoğunluğu</strong></label>
                <select id="set-anim" class="select input-sm" style="width:150px">
                  <option value="full" ${s.animationIntensity === 'full' ? 'selected' : ''}>Tam</option>
                  <option value="subtle" ${s.animationIntensity === 'subtle' ? 'selected' : ''}>Hafif</option>
                  <option value="reduced" ${s.animationIntensity === 'reduced' ? 'selected' : ''}>Azaltılmış</option>
                </select>
              </div>
              <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">
                <span><strong>Sıkıştırılmış (Compact) Mod</strong></span>
                <input type="checkbox" id="set-compact" ${s.compactMode ? 'checked' : ''} />
              </label>
              <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">
                <span><strong>Arka Plan Işık Efektleri</strong></span>
                <input type="checkbox" id="set-bg-fx" ${s.backgroundEffects ? 'checked' : ''} />
              </label>
            </div>
          </div>
        </div>
      `;

      body.querySelectorAll('[data-theme-mode]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await saveSettingsPatch({ themeMode: btn.getAttribute('data-theme-mode') });
          render();
          showToast({ title: 'Tema Modu Güncellendi', type: 'success' });
        });
      });

      body.querySelectorAll('[data-preset-pick]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const presetId = btn.getAttribute('data-preset-pick');
          const presetObj = THEME_PRESETS.find((x) => x.id === presetId);
          await saveSettingsPatch({ themePreset: presetId, customAccentColor: presetObj.color });
          render();
          showToast({ title: `${presetObj.name} Teması Uygulandı`, type: 'success' });
        });
      });

      body.querySelector('#custom-accent-picker')?.addEventListener('change', async (e) => {
        await saveSettingsPatch({ customAccentColor: e.target.value });
      });
      body.querySelector('#set-font-size')?.addEventListener('change', (e) =>
        saveSettingsPatch({ fontSize: e.target.value }),
      );
      body.querySelector('#set-sidebar-w')?.addEventListener('change', (e) =>
        saveSettingsPatch({ sidebarWidth: e.target.value }),
      );
      body.querySelector('#set-anim')?.addEventListener('change', (e) =>
        saveSettingsPatch({ animationIntensity: e.target.value }),
      );
      body.querySelector('#set-compact')?.addEventListener('change', (e) =>
        saveSettingsPatch({ compactMode: e.target.checked }),
      );
      body.querySelector('#set-bg-fx')?.addEventListener('change', (e) =>
        saveSettingsPatch({ backgroundEffects: e.target.checked }),
      );
    } else if (activeTab === 'account') {
      body.innerHTML = `
        <div class="grid-2">
          <div class="card">
            <div class="card-header"><h3 class="card-title">Hesap Profili</h3></div>
            <form id="acct-profile-form" style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;align-items:center;gap:14px">
                ${renderAvatar(u, u.avatarColor, u.avatarUrl, 52)}
                <div>
                  <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                    Profil Resmi Yükle
                    <input type="file" id="acct-avatar-file" accept="image/*" style="display:none" />
                  </label>
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="acct-display-name">Görünen Ad</label>
                <input id="acct-display-name" class="input" value="${escapeHtml(u.displayName)}" required />
              </div>
              <div style="display:flex;justify-content:flex-end">
                <button type="submit" class="btn btn-primary btn-sm">Profili Kaydet</button>
              </div>
            </form>

            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-hairline)">
              <strong style="font-size:13px;display:block;margin-bottom:8px">Aktif Oturumlar (${clientState.activeSessions.length})</strong>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${clientState.activeSessions
                  .map(
                    (sess) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-elevated);font-size:12px">
                    <div style="min-width:0">
                      <div style="font-weight:600">${sess.isCurrent ? 'Mevcut Oturum' : 'Diğer Oturum'} · ${escapeHtml(sess.ipAddress)}</div>
                      <div style="color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px">${escapeHtml(sess.userAgent)}</div>
                    </div>
                    ${!sess.isCurrent ? `<button type="button" class="btn btn-danger btn-sm" data-kill-sess="${escapeHtml(sess.id)}">Sonlandır</button>` : '<span class="status-tag status-completed">Aktif</span>'}
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Şifre Değiştirme</h3></div>
            <form id="change-pw-form" style="display:flex;flex-direction:column;gap:12px">
              <div class="field">
                <label class="field-label" for="cp-current">Mevcut Şifre</label>
                <input id="cp-current" type="password" class="input" required />
              </div>
              <div class="field">
                <label class="field-label" for="cp-new">Yeni Şifre</label>
                <input id="cp-new" type="password" class="input" placeholder="En az 8 karakter, harf ve rakam" required />
              </div>
              <div class="field">
                <label class="field-label" for="cp-confirm">Yeni Şifre Tekrar</label>
                <input id="cp-confirm" type="password" class="input" required />
              </div>
              <div style="display:flex;justify-content:flex-end;margin-top:4px">
                <button type="submit" class="btn btn-primary">Şifreyi Güncelle</button>
              </div>
            </form>
          </div>
        </div>
      `;

      body.querySelector('#acct-avatar-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file || file.size > 150_000) {
          showToast({ title: 'Uyarı', description: 'Lütfen 150 KB altında bir görsel seçin.', type: 'warning' });
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          await saveSettingsPatch({ avatarUrl: String(reader.result) });
          showToast({ title: 'Profil Resmi Güncellendi', type: 'success' });
          render();
        };
        reader.readAsDataURL(file);
      });

      body.querySelector('#acct-profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const displayName = body.querySelector('#acct-display-name').value.trim();
        await saveSettingsPatch({ displayName });
        showToast({ title: 'Profil Kaydedildi', type: 'success' });
        render();
      });

      body.querySelectorAll('[data-kill-sess]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await apiRequest(`/auth/sessions/${btn.getAttribute('data-kill-sess')}`, { method: 'DELETE' });
          meData = await apiRequest('/auth/me');
          clientState.activeSessions = meData.activeSessions || [];
          render();
        });
      });

      body.querySelector('#change-pw-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await apiRequest('/auth/change-password', {
            method: 'POST',
            body: {
              currentPassword: body.querySelector('#cp-current').value,
              newPassword: body.querySelector('#cp-new').value,
              confirmPassword: body.querySelector('#cp-confirm').value,
            },
          });
          body.querySelector('#change-pw-form').reset();
          showToast({ title: 'Şifreniz Güncellendi', type: 'success' });
        } catch (err) {
          showToast({ title: 'Şifre Değiştirilemedi', description: err.message, type: 'danger' });
        }
      });
    } else if (activeTab === 'notifications') {
      body.innerHTML = `
        <div class="card notification-preferences">
          <div class="card-header">
            <h3 class="card-title">Bildirim ve Ses Tercihleri</h3>
            <button type="button" class="btn btn-secondary btn-sm" id="test-sound-btn">Sesi Test Et</button>
          </div>
          <div class="preference-list">
            <div class="preference-row sound-style-row">
              <label for="notification-sound-style"><strong>Bildirim Melodisi</strong><small>Bu tarayıcıdaki hesabınız için kaydedilir.</small></label>
              <select id="notification-sound-style" class="select" style="width:160px" aria-label="Bildirim melodisi">
                ${SOUND_STYLES.map((item) => `<option value="${item.id}" ${getSoundStyle(s) === item.id ? 'selected' : ''}>${item.name}</option>`).join('')}
              </select>
            </div>
            <label class="preference-row">
              <span><strong>Bildirim Sesleri</strong></span>
              <input type="checkbox" id="nb-sound" ${s.soundEnabled ? 'checked' : ''} />
            </label>
            <div class="preference-row">
              <label for="nb-vol"><strong>Ses Seviyesi</strong><small>Bildirimlerin ses yüksekliği</small></label>
              <div class="volume-control">
                <input id="nb-vol" type="range" min="0" max="100" value="${s.notificationVolume}" style="--range-progress:${s.notificationVolume}%" />
                <output for="nb-vol" id="nb-vol-val" class="volume-value tabular-nums">${s.notificationVolume}%</output>
              </div>
            </div>
            <label class="preference-row">
              <span><strong>Chat Bildirimleri</strong></span>
              <input type="checkbox" id="nb-chat" ${s.notifyChat ? 'checked' : ''} />
            </label>
            <label class="preference-row">
              <span><strong>Operasyon Bildirimleri</strong></span>
              <input type="checkbox" id="nb-ops" ${s.notifyOperations ? 'checked' : ''} />
            </label>
            <label class="preference-row">
              <span><strong>Mola Bildirimleri</strong></span>
              <input type="checkbox" id="nb-breaks" ${s.notifyBreaks ? 'checked' : ''} />
            </label>
            <label class="preference-row">
              <span><strong>Duyuru Bildirimleri</strong></span>
              <input type="checkbox" id="nb-ann" ${s.notifyAnnouncements ? 'checked' : ''} />
            </label>
            <label class="preference-row">
              <span><strong>Sessiz Mod</strong><small>Tüm ses ve masaüstü uyarılarını sustur.</small></span>
              <input type="checkbox" id="nb-quiet" ${s.quietMode ? 'checked' : ''} />
            </label>
            <label class="preference-row">
              <span><strong>Tarayıcı Masaüstü Bildirimleri</strong></span>
              <input type="checkbox" id="nb-desktop" ${s.desktopNotifications ? 'checked' : ''} />
            </label>
          </div>
        </div>
      `;

      body.querySelector('#test-sound-btn')?.addEventListener('click', () => {
        playNotificationSound('success', clientState.settings);
      });
      body.querySelector('#notification-sound-style')?.addEventListener('change', (e) => {
        setSoundStyle(e.target.value, clientState.settings);
        playNotificationSound('default', clientState.settings);
      });
      body.querySelector('#nb-sound')?.addEventListener('change', (e) => saveSettingsPatch({ soundEnabled: e.target.checked }));
      body.querySelector('#nb-vol')?.addEventListener('input', (e) => {
        e.target.style.setProperty('--range-progress', `${e.target.value}%`);
        body.querySelector('#nb-vol-val').textContent = `${e.target.value}%`;
      });
      body.querySelector('#nb-vol')?.addEventListener('change', (e) => saveSettingsPatch({ notificationVolume: Number(e.target.value) }));
      body.querySelector('#nb-chat')?.addEventListener('change', (e) => saveSettingsPatch({ notifyChat: e.target.checked }));
      body.querySelector('#nb-ops')?.addEventListener('change', (e) => saveSettingsPatch({ notifyOperations: e.target.checked }));
      body.querySelector('#nb-breaks')?.addEventListener('change', (e) => saveSettingsPatch({ notifyBreaks: e.target.checked }));
      body.querySelector('#nb-ann')?.addEventListener('change', (e) => saveSettingsPatch({ notifyAnnouncements: e.target.checked }));
      body.querySelector('#nb-quiet')?.addEventListener('change', (e) => saveSettingsPatch({ quietMode: e.target.checked }));
      body.querySelector('#nb-desktop')?.addEventListener('change', async (e) => {
        if (e.target.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        await saveSettingsPatch({ desktopNotifications: e.target.checked });
      });
    } else if (activeTab === 'templates') {
      body.innerHTML = `
        <div class="card" style="max-width:700px">
          <div class="card-header">
            <div>
              <h3 class="card-title">Hazır Yorum Şablonları</h3>
              <p class="card-subtitle">Üyelerim CRM satır içi editöründe tek tıkla eklenecek şablonlarınızı yönetin.</p>
            </div>
          </div>

          <form id="tpl-add-form" style="display:flex;gap:8px;margin-bottom:16px">
            <input id="tpl-new-text" class="input" placeholder="Yeni hazır yorum şablonu…" required />
            <button type="submit" class="btn btn-primary">Ekle</button>
          </form>

          <div style="display:flex;flex-direction:column;gap:8px">
            ${templates
              .map(
                (t, idx) => `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius-md);background:var(--bg-elevated)">
                <input class="input input-sm tpl-edit-input" data-id="${escapeHtml(t.id)}" value="${escapeHtml(t.text)}" style="flex:1" />
                <button type="button" class="btn btn-secondary btn-sm" data-tpl-up="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn btn-secondary btn-sm" data-tpl-down="${idx}" ${idx === templates.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn btn-danger btn-sm" data-tpl-del="${escapeHtml(t.id)}" aria-label="Sil">${icon('trash')}</button>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      `;

      body.querySelector('#tpl-add-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = body.querySelector('#tpl-new-text').value.trim();
        if (!text) return;
        const res = await apiRequest('/comment-templates', { method: 'POST', body: { text } });
        templates.push(res.template);
        showToast({ title: 'Şablon Eklendi', type: 'success' });
        render();
      });

      body.querySelectorAll('.tpl-edit-input').forEach((inp) => {
        inp.addEventListener('change', async () => {
          const id = inp.getAttribute('data-id');
          await apiRequest(`/comment-templates/${id}`, { method: 'PATCH', body: { text: inp.value } });
          const target = templates.find((t) => t.id === id);
          if (target) target.text = inp.value;
          showToast({ title: 'Şablon Güncellendi', type: 'success' });
        });
      });

      body.querySelectorAll('[data-tpl-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-tpl-del');
          await apiRequest(`/comment-templates/${id}`, { method: 'DELETE' });
          templates = templates.filter((t) => t.id !== id);
          render();
        });
      });

      const reorder = async (fromIdx, toIdx) => {
        const copy = [...templates];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, moved);
        const res = await apiRequest('/comment-templates/reorder', {
          method: 'POST',
          body: { orderedIds: copy.map((t) => t.id) },
        });
        templates = res.templates;
        render();
      };
      body.querySelectorAll('[data-tpl-up]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-tpl-up'));
          reorder(idx, idx - 1);
        });
      });
      body.querySelectorAll('[data-tpl-down]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-tpl-down'));
          reorder(idx, idx + 1);
        });
      });
    } else {
      body.innerHTML = `
        <div class="card" style="max-width:600px">
          <div class="card-header"><h3 class="card-title">Klavye Kısayolları</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:13.5px">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-hairline)">
              <span>Hızlı Komut Paletini Aç</span><span class="kbd-hint">Ctrl + K</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-hairline)">
              <span>Üyelerim Satır İçi Yorum Kaydet</span><span class="kbd-hint">Enter</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-hairline)">
              <span>Yorum Editöründe Yeni Satır</span><span class="kbd-hint">Shift + Enter</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0">
              <span>Açık Pencere / Paneli Kapat</span><span class="kbd-hint">Esc</span>
            </div>
          </div>
        </div>
      `;
    }
  };

  render();
}

export async function renderProfilePage(viewport, navigateFn) {
  const res = await apiRequest('/auth/me');
  const u = res.user;
  viewport.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">Profilim</h2>
        <p class="page-desc">Kurumsal personel kimlik bilgileriniz ve erişim rolünüz.</p>
      </div>
      <button type="button" class="btn btn-primary" id="prof-go-settings">Ayarları Düzenle</button>
    </div>

    <div class="card" style="max-width:620px;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;align-items:center;gap:16px">
        ${renderAvatar(u, u.avatarColor, u.avatarUrl, 64)}
        <div>
          <h3 style="margin:0;font-family:var(--font-display);font-size:20px">${escapeHtml(u.displayName)}</h3>
          <div class="meta-line" style="margin-top:4px">
            <span>${escapeHtml(u.role)}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(u.team)}</span>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:14px;border-top:1px solid var(--border-hairline);font-size:13px">
        <div><div style="color:var(--text-secondary)">Kullanıcı Adı</div><strong>${escapeHtml(u.username)}</strong></div>
        <div><div style="color:var(--text-secondary)">Son Giriş</div><strong class="tabular-nums">${u.lastLoginAt ? formatDateTimeTr(u.lastLoginAt) : '—'}</strong></div>
        <div><div style="color:var(--text-secondary)">Hesap Durumu</div><strong>${u.isActive ? 'Aktif' : 'Pasif'}</strong></div>
        <div><div style="color:var(--text-secondary)">Çalışma Modu</div><strong>${res.databaseConnected ? 'PostgreSQL' : 'Bağlantı yok'}</strong></div>
      </div>
    </div>
  `;
  viewport.querySelector('#prof-go-settings')?.addEventListener('click', () => navigateFn('settings'));
}

export async function renderNotificationsPage(viewport, navigateFn) {
  let filter = 'all';
  const load = async () => {
    const res = await apiRequest('/notifications');
    clientState.notifications = res.notifications || [];
    clientState.unreadCount = res.unreadCount || 0;
    const list =
      filter === 'unread'
        ? clientState.notifications.filter((n) => !n.isRead)
        : clientState.notifications;

    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">Bildirimler</h2>
          <p class="page-desc">Operasyon, mola, FTD, duyuru ve bahsetme bildirimleri.</p>
        </div>
        <div class="toolbar">
          <div class="segmented">
            <button type="button" class="segmented-btn ${filter === 'all' ? 'active' : ''}" data-nf="all">Tümü</button>
            <button type="button" class="segmented-btn ${filter === 'unread' ? 'active' : ''}" data-nf="unread">Okunmamış (${clientState.unreadCount})</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="notif-mark-all">Tümünü Okundu İşaretle</button>
        </div>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        ${
          list.length === 0
            ? '<div style="padding:36px;text-align:center;color:var(--text-secondary)">Gösterilecek bildirim bulunmuyor.</div>'
            : list
                .map(
                  (n) => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--border-hairline);background:${n.isRead ? 'transparent' : 'var(--accent-soft)'}">
                <div>
                  <div style="font-weight:600;font-size:13.5px">${escapeHtml(n.title)}</div>
                  <div style="font-size:12.5px;color:var(--text-secondary);margin-top:2px">${escapeHtml(n.description)}</div>
                  <div class="tabular-nums" style="font-size:11.5px;color:var(--text-muted);margin-top:4px">${formatDateTimeTr(n.createdAt)}</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-open-n="${escapeHtml(n.id)}" data-link="${escapeHtml(n.linkPage)}">Aç</button>
              </div>
            `,
                )
                .join('')
        }
      </div>
    `;

    viewport.querySelectorAll('[data-nf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.getAttribute('data-nf');
        load();
      });
    });
    viewport.querySelector('#notif-mark-all')?.addEventListener('click', async () => {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      await load();
    });
    viewport.querySelectorAll('[data-open-n]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/notifications/${btn.getAttribute('data-open-n')}/read`, { method: 'POST' });
        navigateFn(btn.getAttribute('data-link'));
      });
    });
  };
  await load();
}
