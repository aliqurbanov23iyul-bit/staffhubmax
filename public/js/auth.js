import { apiRequest, setAuthToken } from './api.js';
import { renderBrandLogo, renderLoginIllustration } from './graphics.js';
import { icon } from './icons.js';
import { applyUserSettings, clientState, connectRealtimeWebSocket } from './store.js';

export function renderLoginPage(onSuccess) {
  const root = document.getElementById('app-root');
  if (!root) return;


  root.innerHTML = `
    <div class="login-page">
      <section class="login-visual-pane">
        <div style="display:flex;align-items:center;gap:12px">
          ${renderBrandLogo(36)}
          <div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:17px;letter-spacing:-0.01em">MAXBAHIS STAFF HUB</div>
            <div style="font-size:12.5px;color:var(--text-secondary)">Kurumsal Operasyon ve Personel Platformu</div>
          </div>
        </div>

        <div style="margin:auto 0;display:flex;flex-direction:column;gap:22px">
          <div>
            <h2 style="font-family:var(--font-display);font-size:30px;font-weight:700;line-height:1.2;margin:0 0 10px;text-wrap:balance">
              Tüm ekip, operasyonlar ve CRM tek merkezde.
            </h2>
            <p style="margin:0;color:var(--text-secondary);max-width:46ch;font-size:14.5px">
              Gerçek zamanlı İşlem Chat kuyruğu, hızlı üye takibi, kontrollü mola yönetimi ve şeffaf FTD onay akışı.
            </p>
          </div>
          ${renderLoginIllustration()}
        </div>

        <div class="meta-line">
          <span>Rol Tabanlı Erişim</span>
          <span aria-hidden="true">·</span>
          <span>Gerçek Zamanlı WebSocket</span>
          <span aria-hidden="true">·</span>
          <span>Personel Çalışma Alanı</span>
        </div>
      </section>

      <section class="login-form-pane">
        <div class="login-card anim-stagger">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
            ${renderBrandLogo(32)}
            <div>
              <h1 style="margin:0;font-family:var(--font-display);font-size:20px;font-weight:700">Personel Girişi</h1>
              <p style="margin:2px 0 0;font-size:12.5px;color:var(--text-secondary)">Hesap bilgilerinizle çalışma alanına bağlanın.</p>
            </div>
          </div>

          <div id="login-error-box" class="alert-banner" style="display:none;margin-bottom:14px;padding:10px 12px;font-size:12.5px"></div>

          <form id="login-form" style="display:flex;flex-direction:column;gap:14px">
            <div class="field">
              <label class="field-label" for="login-username">Kullanıcı Adı</label>
              <input
                id="login-username"
                name="username"
                type="text"
                class="input"
                placeholder="Kullanıcı adınızı girin"
                autocomplete="username"
                required
              />
            </div>

            <div class="field">
              <label class="field-label" for="login-password">Şifre</label>
              <div class="input-with-toggle">
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  class="input"
                  placeholder="Şifrenizi girin"
                  autocomplete="current-password"
                  required
                />
                <button type="button" class="input-toggle-btn" id="toggle-pw-vis" aria-label="Şifreyi göster veya gizle">
                  ${icon('eye')}
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary" id="login-submit-btn" style="width:100%;margin-top:4px;height:42px">
              Giriş Yap
            </button>
          </form>

        </div>
      </section>
    </div>
  `;

  const pwInput = root.querySelector('#login-password');
  const toggleBtn = root.querySelector('#toggle-pw-vis');
  toggleBtn?.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    toggleBtn.innerHTML = icon(isHidden ? 'eye-off' : 'eye');
  });

  const form = root.querySelector('#login-form');
  const errBox = root.querySelector('#login-error-box');
  const submitBtn = root.querySelector('#login-submit-btn');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    const username = root.querySelector('#login-username').value.trim();
    const password = root.querySelector('#login-password').value;

    if (!username || !password) {
      errBox.textContent = 'Lütfen kullanıcı adı ve şifrenizi girin.';
      errBox.style.display = 'flex';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="processing-spinner"></span> Giriş yapılıyor…';

    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setAuthToken(res.token);
      clientState.user = res.user;
      clientState.settings = res.settings;
      clientState.navItems = res.navItems;
      clientState.permissions = res.permissions;
      clientState.mode = res.mode;
      clientState.databaseConnected = res.databaseConnected;
      applyUserSettings(res.settings);
      connectRealtimeWebSocket();
      onSuccess();
    } catch (err) {
      errBox.textContent = err.message || 'Giriş başarısız.';
      errBox.style.display = 'flex';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Giriş Yap';
    }
  });
}
