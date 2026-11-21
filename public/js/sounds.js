let audioCtx = null;

export const SOUND_STYLES = [
  { id: 'classic', name: 'Klasik', description: 'Mevcut bildirim melodileri' },
  { id: 'chime', name: 'Kristal', description: 'Yumuşak, parlak çan tonları' },
  { id: 'pulse', name: 'Minimal', description: 'Kısa ve sakin çift vuruş' },
];

export function getSoundStyle(settings) {
  try { return localStorage.getItem(`mb-sound-style:${settings?.userId || 'default'}`) || 'classic'; }
  catch { return 'classic'; }
}

export function setSoundStyle(style, settings) {
  if (!SOUND_STYLES.some((item) => item.id === style)) return;
  try { localStorage.setItem(`mb-sound-style:${settings?.userId || 'default'}`, style); } catch {}
}

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playNotificationSound(kind = 'default', settings = null) {
  if (settings) {
    if (!settings.soundEnabled || settings.quietMode || settings.notificationVolume <= 0) {
      return;
    }
  }
  const ctx = getCtx();
  if (!ctx) return;

  const vol = settings ? Math.max(0.02, (settings.notificationVolume / 100) * 0.18) : 0.12;
  const now = ctx.currentTime;

  const playTone = (freq, startOffset, duration, type = 'sine') => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0.001, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(vol, now + startOffset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.02);
  };

  const style = getSoundStyle(settings);
  if (style === 'chime') {
    const root = kind === 'alert' ? 440 : kind === 'success' ? 783.99 : kind === 'break' ? 659.25 : 880;
    playTone(root, 0, 0.3);
    playTone(root * 1.5, 0.12, 0.35);
    playTone(root * 2, 0.24, 0.38);
  } else if (style === 'pulse') {
    const root = kind === 'alert' ? 330 : kind === 'success' ? 660 : kind === 'break' ? 550 : 520;
    playTone(root, 0, 0.09);
    playTone(root * 1.25, 0.13, 0.13);
  } else if (kind === 'success') {
    playTone(587.33, 0, 0.14, 'triangle');
    playTone(880, 0.11, 0.22, 'triangle');
  } else if (kind === 'alert') {
    playTone(520, 0, 0.16, 'sawtooth');
    playTone(440, 0.18, 0.24, 'sawtooth');
  } else if (kind === 'break') {
    playTone(659.25, 0, 0.18, 'sine');
    playTone(783.99, 0.16, 0.18, 'sine');
    playTone(1046.5, 0.32, 0.28, 'sine');
  } else {
    playTone(740, 0, 0.15, 'sine');
    playTone(987.77, 0.1, 0.18, 'sine');
  }
}
