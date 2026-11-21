import { apiRequest } from '../api.js';
import { closeDrawer, closeModal, openDrawer, openModal } from '../components/layout.js';
import { renderAnimatedCheckmark, renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { hasClientPermission } from '../store.js';
import { escapeHtml, formatDateTimeTr } from '../utils.js';

export async function renderAnnouncementsPage(viewport, { manageMode = false } = {}) {
  const canManage = hasClientPermission('announcements.manage');
  let announcements = [];

  const loadData = async () => {
    const res = await apiRequest('/announcements');
    announcements = res.announcements || [];
    render();
  };

  const openPublishModal = () => {
    openModal({
      title: 'Yeni Duyuru Yayınla',
      bodyHtml: `
        <form id="ann-create-form" style="display:flex;flex-direction:column;gap:12px">
          <div class="field">
            <label class="field-label" for="ann-title">Başlık</label>
            <input id="ann-title" class="input" placeholder="Duyuru başlığı" required />
          </div>
          <div class="field">
            <label class="field-label" for="ann-content">İçerik</label>
            <textarea id="ann-content" class="textarea" rows="4" placeholder="Duyuru metnini yazın…" required></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field">
              <label class="field-label" for="ann-priority">Öncelik</label>
              <select id="ann-priority" class="select">
                <option value="Normal">Normal</option>
                <option value="Önemli">Önemli</option>
                <option value="Acil">Acil</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="ann-audience">Hedef Kitle</label>
              <select id="ann-audience" class="select">
                <option value="Tümü">Tüm Personel</option>
                <option value="Menecer">Menecer</option>
                <option value="Takım Lideri">Takım Lideri</option>
                <option value="İşlem Admini">İşlem Admini</option>
                <option value="VIP Ekip">VIP Ekip</option>
                <option value="Standart Ekip">Standart Ekip</option>
              </select>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">
            <button type="button" class="btn btn-secondary" id="ann-cancel">İptal</button>
            <button type="submit" class="btn btn-primary">Yayınla</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#ann-cancel')?.addEventListener('click', closeModal);
        root.querySelector('#ann-create-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await apiRequest('/announcements', {
              method: 'POST',
              body: {
                title: root.querySelector('#ann-title').value.trim(),
                content: root.querySelector('#ann-content').value.trim(),
                priority: root.querySelector('#ann-priority').value,
                targetAudience: root.querySelector('#ann-audience').value,
              },
            });
            closeModal();
            showToast({ title: 'Duyuru Yayınlandı', type: 'success' });
            await loadData();
          } catch (err) {
            showToast({ title: 'Hata', description: err.message, type: 'danger' });
          }
        });
      },
    });
  };

  const openTrackingDrawer = (ann) => {
    openDrawer({
      title: 'Okunma Takibi',
      subtitle: `${ann.title} · %${ann.ackPercentage} onay`,
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:18px">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
              <strong>Onay Oranı</strong>
              <span class="tabular-nums">${ann.ackCount} / ${ann.totalTarget} (%${ann.ackPercentage})</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${ann.ackPercentage}%"></div></div>
          </div>

          <div>
            <strong style="font-size:13px;display:block;margin-bottom:8px;color:var(--success)">Okuyanlar (${ann.acks?.length || 0})</strong>
            ${
              (ann.acks?.length || 0) === 0
                ? '<div style="font-size:12.5px;color:var(--text-secondary)">Henüz okuyan yok.</div>'
                : `
              <div style="display:flex;flex-direction:column;gap:6px">
                ${ann.acks
                  .map(
                    (a) => `
                  <div style="display:flex;justify-content:space-between;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-elevated);font-size:12.5px">
                    <span>${escapeHtml(a.userName)}</span>
                    <span class="tabular-nums" style="color:var(--text-secondary)">${formatDateTimeTr(a.acknowledgedAt)}</span>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            `
            }
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:13px;color:var(--warning)">Okumayanlar (${ann.unreadUsers?.length || 0})</strong>
              ${
                (ann.unreadUsers?.length || 0) > 0
                  ? `<button type="button" class="btn btn-secondary btn-sm" id="ann-remind-unread">Hatırlatma Gönder</button>`
                  : ''
              }
            </div>
            ${
              (ann.unreadUsers?.length || 0) === 0
                ? '<div style="font-size:12.5px;color:var(--text-secondary)">Hedef kitlenin tamamı duyuruyu onayladı.</div>'
                : `
              <div style="display:flex;flex-direction:column;gap:6px">
                ${ann.unreadUsers
                  .map(
                    (u) => `
                  <div style="display:flex;justify-content:space-between;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-elevated);font-size:12.5px">
                    <span>${escapeHtml(u.displayName)}</span>
                    <span style="color:var(--text-muted)">${escapeHtml(u.role)}</span>
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
        root.querySelector('#ann-remind-unread')?.addEventListener('click', async () => {
          const res = await apiRequest(`/announcements/${ann.id}/remind`, { method: 'POST' });
          showToast({
            title: 'Hatırlatma Gönderildi',
            description: `${res.remindedCount} personele bildirim iletildi.`,
            type: 'success',
          });
          closeDrawer();
        });
      },
    });
  };

  const render = () => {
    viewport.innerHTML = `
      <div class="page-header">
        <div>
          <h2 class="page-title">${manageMode ? 'Duyuru Yönetimi' : 'Duyurular'}</h2>
          <p class="page-desc">Kurum içi duyuruları takip edin ve okuma onaylarını yönetin.</p>
        </div>
        ${
          canManage
            ? `<button type="button" class="btn btn-primary" id="open-ann-modal-btn">${icon('plus')} Yeni Duyuru Yayınla</button>`
            : ''
        }
      </div>

      ${
        announcements.length === 0
          ? `<div class="card empty-state">${renderEmptyStateGraphic()}<div>Henüz yayınlanmış duyuru bulunmuyor.</div></div>`
          : `
        <div style="display:flex;flex-direction:column;gap:14px">
          ${announcements
            .map((a, idx) => {
              const prioCls =
                a.priority === 'Acil'
                  ? 'status-rejected'
                  : a.priority === 'Önemli'
                    ? 'status-waiting'
                    : 'status-neutral';
              return `
              <article class="card anim-stagger" style="animation-delay:${idx * 45}ms">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
                  <div>
                    <div class="meta-line" style="margin-bottom:5px">
                      <span class="status-tag ${prioCls}">${escapeHtml(a.priority)}</span>
                      <span>Hedef: ${escapeHtml(a.targetAudience)}</span>
                      <span aria-hidden="true">·</span>
                      <span>${escapeHtml(a.authorName)}</span>
                      <span aria-hidden="true">·</span>
                      <span class="tabular-nums">${formatDateTimeTr(a.publishedAt)}</span>
                    </div>
                    <h3 style="margin:0;font-family:var(--font-display);font-size:16.5px;font-weight:700">${escapeHtml(a.title)}</h3>
                  </div>

                  <div style="display:flex;align-items:center;gap:8px">
                    ${
                      canManage
                        ? `<button type="button" class="btn btn-secondary btn-sm" data-track-ann="${escapeHtml(a.id)}">Okunma Takibi (%${a.ackPercentage})</button>`
                        : ''
                    }
                    ${
                      a.acknowledgedByMe
                        ? `<span class="status-tag status-completed">${renderAnimatedCheckmark(16)} Okundu</span>`
                        : `<button type="button" class="btn btn-primary btn-sm" data-ack-ann="${escapeHtml(a.id)}">Duyuruyu Okudum</button>`
                    }
                  </div>
                </div>

                <p style="margin:12px 0 0;color:var(--text-secondary);line-height:1.6">${escapeHtml(a.content)}</p>

                ${
                  canManage
                    ? `
                  <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-hairline)">
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px">
                      <span>Onay Durumu (${a.ackCount}/${a.totalTarget})</span>
                      <span class="tabular-nums">%${a.ackPercentage}</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:${a.ackPercentage}%"></div></div>
                  </div>
                `
                    : ''
                }
              </article>
            `;
            })
            .join('')}
        </div>
      `
      }
    `;

    viewport.querySelector('#open-ann-modal-btn')?.addEventListener('click', openPublishModal);
    viewport.querySelectorAll('[data-ack-ann]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/announcements/${btn.getAttribute('data-ack-ann')}/acknowledge`, {
          method: 'POST',
        });
        showToast({ title: 'Duyuru Onaylandı', type: 'success' });
        await loadData();
      });
    });
    viewport.querySelectorAll('[data-track-ann]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ann = announcements.find((a) => a.id === btn.getAttribute('data-track-ann'));
        if (ann) openTrackingDrawer(ann);
      });
    });
  };

  const wsHandler = (ev) => {
    if (ev.detail?.event === 'sync:refresh') { loadData().catch(() => {}); return; }
    const { event } = ev.detail || {};
    if (event === 'announcement:created' || event === 'announcement:acknowledged') loadData();
  };

  window.addEventListener('mb:ws', wsHandler);
  await loadData();
  return () => window.removeEventListener('mb:ws', wsHandler);
}
