export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const yr = d.getFullYear();
  return `${day}.${mon}.${yr}`;
}

export function formatTimeTr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDateTimeTr(iso) {
  if (!iso) return '—';
  return `${formatDateTr(iso)} ${formatTimeTr(iso)}`;
}

export function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatCurrencyTry(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

export function getInitials(name) {
  const parts = String(name || 'P').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export function renderAvatar(userOrName, color = '#8B5CF6', avatarUrl = null, size = 34) {
  const name = typeof userOrName === 'string' ? userOrName : userOrName?.displayName || 'P';
  const bg = typeof userOrName === 'object' ? userOrName?.avatarColor || color : color;
  const imgUrl = typeof userOrName === 'object' ? userOrName?.avatarUrl || avatarUrl : avatarUrl;
  if (imgUrl) {
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:${escapeHtml(bg)}"><img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(name)}"/></span>`;
  }
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:${escapeHtml(bg)}">${escapeHtml(getInitials(name))}</span>`;
}
