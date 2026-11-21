import { apiRequest } from '../api.js';
import { renderEmptyStateGraphic } from '../graphics.js';
import { icon } from '../icons.js';
import { showToast } from '../notifications.js';
import { clientState, hasClientPermission } from '../store.js';
import { escapeHtml, formatTimeTr, renderAvatar } from '../utils.js';

const QUICK_EMOJIS = ['👍', '✅', '🔥', '💜', '⚡'];

export async function renderGeneralChatPage(viewport) {
  let channels = [];
  let staffPresence = [];
  let activeChannelId = 'ch_genel';
  let messages = [];
  let pinned = [];
  let unreadByChannel = {};
  let replyTo = null;
  let editingMsgId = null;
  let searchQuery = '';
  let typingUsers = new Map();
  let pendingAttachments = [];
  const canModerate = hasClientPermission('chat.moderate');
  const canMassMention = hasClientPermission('chat.mass_mention');

  const loadChannels = async () => {
    const res = await apiRequest('/chat/channels');
    channels = res.channels || [];
    staffPresence = res.staffPresence || [];
    if (!channels.some((c) => c.id === activeChannelId) && channels[0]) {
      activeChannelId = channels[0].id;
    }
  };

  const loadMessages = async () => {
    const qs = new URLSearchParams({
      channelId: activeChannelId,
      search: searchQuery,
    }).toString();
    const res = await apiRequest(`/chat/messages?${qs}`);
    messages = res.messages || [];
    pinned = res.pinned || [];
    unreadByChannel[activeChannelId] = 0;
    render();
  };

  const renderContentWithMentions = (text) => {
    const escaped = escapeHtml(text);
    return escaped.replace(
      /@([A-Za-z0-9_.\-çğıöşüÇĞİÖŞÜ]+)/g,
      '<span style="color:var(--accent-secondary);background:var(--accent-soft);padding:0 4px;border-radius:4px;font-weight:600">@$1</span>',
    );
  };

  const render = () => {
    const currentChannel = channels.find((c) => c.id === activeChannelId) || { name: 'genel', description: '' };
    const typingList = Array.from(typingUsers.values()).filter(Boolean);

    viewport.innerHTML = `
      <div class="chat-shell">
        <!-- Channels Sidebar -->
        <aside class="chat-channels-pane" aria-label="Chat Kanalları">
          <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);padding:4px 8px">KANALLAR</div>
          ${channels
            .map((ch) => {
              const unread = unreadByChannel[ch.id] || 0;
              return `
              <button type="button" class="chat-channel-btn ${ch.id === activeChannelId ? 'active' : ''}" data-channel-id="${escapeHtml(ch.id)}">
                <span># ${escapeHtml(ch.name)}</span>
                ${unread > 0 ? `<span class="nav-badge">${unread}</span>` : ''}
              </button>
            `;
            })
            .join('')}

          <div style="margin-top:auto;padding:10px;border-radius:var(--radius-md);background:var(--bg-elevated);font-size:11.5px;color:var(--text-secondary)">
            <div><strong>Etiketleme</strong></div>
            <div style="margin-top:3px">@kullanıcı adı ile ekip arkadaşlarını etiketleyin.${canMassMention ? ' @admins ve @everyone yetkiniz açık.' : ''}</div>
          </div>
        </aside>

        <!-- Chat Main -->
        <section class="chat-main-pane">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border-hairline);display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-elevated)">
            <div style="min-width:0">
              <div style="font-weight:700;font-size:14.5px"># ${escapeHtml(currentChannel.name)}</div>
              <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(currentChannel.description)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <input id="gc-search" class="input input-sm" style="width:180px" placeholder="Mesajlarda ara…" value="${escapeHtml(searchQuery)}" />
            </div>
          </div>

          ${
            pinned.length > 0
              ? `
            <div style="padding:8px 16px;background:var(--accent-soft);border-bottom:1px solid var(--border-hairline);display:flex;align-items:center;gap:8px;font-size:12.5px">
              ${icon('pin')}
              <strong style="flex-shrink:0">Sabitlenmiş:</strong>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pinned[pinned.length - 1].senderName)}: ${escapeHtml(pinned[pinned.length - 1].content)}</span>
            </div>
          `
              : ''
          }

          <div class="chat-messages-scroll" id="gc-feed" data-testid="general-chat-feed">
            ${
              messages.length === 0
                ? `<div class="empty-state">${renderEmptyStateGraphic()}<div>Bu kanalda henüz mesaj yok. İlk mesajı siz yazın.</div></div>`
                : messages
                    .map((m) => {
                      const isMine = m.senderId === clientState.user?.id;
                      const isEditing = editingMsgId === m.id;
                      return `
                      <div class="chat-msg" data-msg-id="${escapeHtml(m.id)}">
                        ${renderAvatar(m.senderName, m.senderAvatarColor, null, 34)}
                        <div style="flex:1;min-width:0">
                          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                            <div class="meta-line">
                              <strong style="color:var(--text-primary);font-size:13.5px">${escapeHtml(m.senderName)}</strong>
                              <span>${escapeHtml(m.senderRole)}</span>
                              <span aria-hidden="true">·</span>
                              <span class="tabular-nums">${formatTimeTr(m.createdAt)}</span>
                              ${m.isEdited ? '<span>(düzenlendi)</span>' : ''}
                              ${m.isPinned ? '<span style="color:var(--accent-secondary)">· Sabitli</span>' : ''}
                            </div>
                            <div class="chat-msg-actions">
                              ${QUICK_EMOJIS.slice(0, 3).map((em) => `<button type="button" class="btn-ghost btn-sm" style="height:24px;padding:0 5px;border:none" data-react-msg="${escapeHtml(m.id)}" data-emoji="${em}">${em}</button>`).join('')}
                              <button type="button" class="btn-ghost btn-sm" style="height:24px;padding:0 6px;border:none" data-reply-msg="${escapeHtml(m.id)}" aria-label="Yanıtla">${icon('reply')}</button>
                              ${canModerate ? `<button type="button" class="btn-ghost btn-sm" style="height:24px;padding:0 6px;border:none" data-pin-msg="${escapeHtml(m.id)}" aria-label="Sabitle">${icon('pin')}</button>` : ''}
                              ${isMine || canModerate ? `<button type="button" class="btn-ghost btn-sm" style="height:24px;padding:0 6px;border:none" data-edit-msg="${escapeHtml(m.id)}" aria-label="Düzenle">${icon('edit-note')}</button>` : ''}
                              ${isMine || canModerate ? `<button type="button" class="btn-ghost btn-sm" style="height:24px;padding:0 6px;border:none;color:var(--danger)" data-del-msg="${escapeHtml(m.id)}" aria-label="Sil">${icon('trash')}</button>` : ''}
                            </div>
                          </div>

                          ${
                            m.replyPreview
                              ? `<div style="margin:4px 0;padding:4px 8px;border-radius:5px;background:var(--bg-elevated);font-size:12px;color:var(--text-secondary)">Yanıt: ${escapeHtml(m.replyPreview)}</div>`
                              : ''
                          }

                          ${
                            isEditing
                              ? `
                            <div style="display:flex;gap:6px;margin-top:6px">
                              <input id="gc-edit-input" class="input input-sm" value="${escapeHtml(m.content)}" />
                              <button type="button" class="btn btn-primary btn-sm" data-save-edit="${escapeHtml(m.id)}">Kaydet</button>
                              <button type="button" class="btn btn-secondary btn-sm" id="gc-cancel-edit">İptal</button>
                            </div>
                          `
                              : `<div style="margin-top:3px;font-size:13.5px;word-break:break-word">${renderContentWithMentions(m.content)}</div>`
                          }

                          ${
                            m.attachments?.length > 0
                              ? `
                            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
                              ${m.attachments
                                .map((a) =>
                                  a.dataUrl
                                    ? `<img src="${escapeHtml(a.dataUrl)}" alt="${escapeHtml(a.name)}" style="max-width:220px;max-height:140px;border-radius:8px;border:1px solid var(--border-hairline)" />`
                                    : `<span style="padding:4px 8px;border-radius:6px;background:var(--bg-elevated);font-size:12px">${icon('paperclip')} ${escapeHtml(a.name)}</span>`,
                                )
                                .join('')}
                            </div>
                          `
                              : ''
                          }

                          ${
                            m.reactions?.length > 0
                              ? `
                            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">
                              ${m.reactions
                                .map((r) => {
                                  const mine = r.userIds.includes(clientState.user?.id);
                                  return `<button type="button" class="reaction-btn ${mine ? 'active' : ''}" data-react-msg="${escapeHtml(m.id)}" data-emoji="${escapeHtml(r.emoji)}">${escapeHtml(r.emoji)} <span class="tabular-nums">${r.userIds.length}</span></button>`;
                                })
                                .join('')}
                            </div>
                          `
                              : ''
                          }
                        </div>
                      </div>
                    `;
                    })
                    .join('')
            }
          </div>

          ${
            typingList.length > 0
              ? `<div style="padding:4px 16px;font-size:11.5px;color:var(--text-secondary)">${escapeHtml(typingList.join(', '))} yazıyor…</div>`
              : ''
          }

          ${
            replyTo
              ? `
            <div style="padding:6px 16px;background:var(--bg-elevated);border-top:1px solid var(--border-hairline);display:flex;justify-content:space-between;align-items:center;font-size:12px">
              <span><strong>${escapeHtml(replyTo.senderName)}</strong> mesajına yanıt veriliyor</span>
              <button type="button" class="btn-ghost" id="gc-cancel-reply" style="border:none">İptal</button>
            </div>
          `
              : ''
          }

          ${
            pendingAttachments.length > 0
              ? `
            <div style="padding:6px 16px;background:var(--bg-elevated);display:flex;gap:8px;flex-wrap:wrap;font-size:12px">
              ${pendingAttachments.map((a, idx) => `<span style="padding:3px 8px;border-radius:6px;background:var(--bg-card)">${escapeHtml(a.name)} <button type="button" class="btn-ghost" data-rm-att="${idx}" style="border:none;padding:0 3px">×</button></span>`).join('')}
            </div>
          `
              : ''
          }

          <form class="chat-composer" id="gc-form">
            <label class="btn-icon" title="Dosya ekle" style="cursor:pointer" aria-label="Dosya ekle">
              ${icon('paperclip')}
              <input type="file" id="gc-file-input" style="display:none" />
            </label>
            <input
              id="gc-input"
              type="text"
              class="input"
              placeholder="#${escapeHtml(currentChannel.name)} kanalına mesaj yazın… (@isim ile etiketleyin)"
              autocomplete="off"
            />
            <button type="submit" class="btn btn-primary">${icon('send')} Gönder</button>
          </form>
        </section>

        <!-- Online Presence Pane -->
        <aside class="chat-presence-pane" aria-label="Personel Durumu">
          <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);margin-bottom:10px">EKİP DURUMU</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${staffPresence
              .map(
                (u) => `
              <div style="display:flex;align-items:center;gap:8px;font-size:12.5px">
                <span class="presence-dot ${u.isOnline ? 'online' : 'offline'}"></span>
                <div style="min-width:0">
                  <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.displayName)}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(u.role)}</div>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        </aside>
      </div>
    `;

    const feed = viewport.querySelector('#gc-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;

    viewport.querySelectorAll('[data-channel-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeChannelId = btn.getAttribute('data-channel-id');
        loadMessages();
      });
    });

    let searchTimer = null;
    viewport.querySelector('#gc-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadMessages, 220);
    });

    viewport.querySelector('#gc-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.type.startsWith('image/') && file.size <= 250_000) {
        const reader = new FileReader();
        reader.onload = () => {
          pendingAttachments.push({
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: String(reader.result),
          });
          render();
        };
        reader.readAsDataURL(file);
      } else {
        pendingAttachments.push({ name: file.name, type: file.type, size: file.size });
        render();
      }
    });

    viewport.querySelectorAll('[data-rm-att]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingAttachments.splice(Number(btn.getAttribute('data-rm-att')), 1);
        render();
      });
    });

    viewport.querySelector('#gc-input')?.addEventListener('input', () => {
      if (clientState.ws && clientState.ws.readyState === 1) {
        clientState.ws.send(JSON.stringify({ type: 'chat:typing', channelId: activeChannelId }));
      }
    });

    viewport.querySelector('#gc-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = viewport.querySelector('#gc-input');
      const content = input.value.trim();
      if (!content && pendingAttachments.length === 0) return;
      try {
        await apiRequest('/chat/messages', {
          method: 'POST',
          body: {
            channelId: activeChannelId,
            content,
            replyToId: replyTo?.id || null,
            attachments: pendingAttachments,
          },
        });
        input.value = '';
        replyTo = null;
        pendingAttachments = [];
      } catch (err) {
        showToast({ title: 'Gönderilemedi', description: err.message, type: 'danger' });
      }
    });

    viewport.querySelector('#gc-cancel-reply')?.addEventListener('click', () => {
      replyTo = null;
      render();
    });

    viewport.querySelectorAll('[data-reply-msg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        replyTo = messages.find((m) => m.id === btn.getAttribute('data-reply-msg')) || null;
        render();
        viewport.querySelector('#gc-input')?.focus();
      });
    });

    viewport.querySelectorAll('[data-react-msg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/chat/messages/${btn.getAttribute('data-react-msg')}/react`, {
          method: 'POST',
          body: { emoji: btn.getAttribute('data-emoji') },
        });
      });
    });

    viewport.querySelectorAll('[data-pin-msg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/chat/messages/${btn.getAttribute('data-pin-msg')}/pin`, {
          method: 'POST',
        });
      });
    });

    viewport.querySelectorAll('[data-edit-msg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingMsgId = btn.getAttribute('data-edit-msg');
        render();
        viewport.querySelector('#gc-edit-input')?.focus();
      });
    });

    viewport.querySelector('#gc-cancel-edit')?.addEventListener('click', () => {
      editingMsgId = null;
      render();
    });

    viewport.querySelectorAll('[data-save-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const content = viewport.querySelector('#gc-edit-input').value.trim();
        if (!content) return;
        await apiRequest(`/chat/messages/${btn.getAttribute('data-save-edit')}`, {
          method: 'PATCH',
          body: { content },
        });
        editingMsgId = null;
      });
    });

    viewport.querySelectorAll('[data-del-msg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/chat/messages/${btn.getAttribute('data-del-msg')}`, {
          method: 'DELETE',
        });
      });
    });
  };

  const wsHandler = (ev) => {
    const { event, payload } = ev.detail || {};
    if (event === 'chat:message' && payload) {
      if (payload.channelId === activeChannelId) {
        if (!messages.some((m) => m.id === payload.id)) {
          messages.push(payload);
          render();
        }
      } else {
        unreadByChannel[payload.channelId] = (unreadByChannel[payload.channelId] || 0) + 1;
        render();
      }
    } else if (event === 'chat:updated' && payload) {
      const idx = messages.findIndex((m) => m.id === payload.id);
      if (idx !== -1) {
        messages[idx] = payload;
        pinned = messages.filter((m) => m.isPinned);
        render();
      }
    } else if (event === 'chat:deleted' && payload) {
      messages = messages.filter((m) => m.id !== payload.id);
      pinned = messages.filter((m) => m.isPinned);
      render();
    } else if (event === 'chat:reaction' && payload) {
      const msg = messages.find((m) => m.id === payload.id);
      if (msg) {
        msg.reactions = payload.reactions;
        render();
      }
    } else if (event === 'chat:typing' && payload) {
      if (payload.channelId === activeChannelId && payload.userId !== clientState.user?.id) {
        typingUsers.set(payload.userId, payload.displayName);
        setTimeout(() => {
          typingUsers.delete(payload.userId);
          render();
        }, 2500);
        render();
      }
    } else if (event === 'presence:update') {
      loadChannels().then(render);
    }
  };

  window.addEventListener('mb:ws', wsHandler);
  await loadChannels();
  await loadMessages();
  return () => window.removeEventListener('mb:ws', wsHandler);
}
