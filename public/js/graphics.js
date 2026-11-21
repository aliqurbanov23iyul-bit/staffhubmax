export function renderBrandLogo(size = 30) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="mbHubGrad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stop-color="#8B5CF6"/>
          <stop offset="1" stop-color="#6366F1"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#mbHubGrad)"/>
      <rect x="2.75" y="2.75" width="34.5" height="34.5" rx="9.25" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>
      <path d="M11 27V13L20 21.5L29 13V27" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="20" cy="11.5" r="2" fill="#E9D5FF"/>
    </svg>
  `;
}

export function renderLoginIllustration() {
  return `
    <svg viewBox="0 0 460 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:440px;height:auto;" aria-hidden="true">
      <defs>
        <linearGradient id="cardGrad1" x1="0" y1="0" x2="460" y2="300" gradientUnits="userSpaceOnUse">
          <stop stop-color="#8B5CF6" stop-opacity="0.28"/>
          <stop offset="1" stop-color="#3B82F6" stop-opacity="0.06"/>
        </linearGradient>
      </defs>
      <rect x="24" y="24" width="412" height="252" rx="18" fill="#141422" stroke="rgba(255,255,255,0.1)"/>
      <rect x="24" y="24" width="112" height="252" rx="18" fill="#10101A"/>
      <rect x="40" y="46" width="80" height="10" rx="5" fill="#8B5CF6"/>
      <rect x="40" y="74" width="68" height="8" rx="4" fill="rgba(255,255,255,0.14)"/>
      <rect x="40" y="94" width="76" height="8" rx="4" fill="rgba(255,255,255,0.08)"/>
      <rect x="40" y="114" width="60" height="8" rx="4" fill="rgba(255,255,255,0.08)"/>
      <rect x="40" y="134" width="72" height="8" rx="4" fill="rgba(255,255,255,0.08)"/>
      <rect x="156" y="44" width="122" height="72" rx="12" fill="url(#cardGrad1)" stroke="rgba(167,139,250,0.28)"/>
      <rect x="292" y="44" width="124" height="72" rx="12" fill="#1C1C2D" stroke="rgba(255,255,255,0.08)"/>
      <rect x="172" y="60" width="54" height="8" rx="4" fill="rgba(255,255,255,0.28)"/>
      <rect x="172" y="80" width="78" height="14" rx="5" fill="#F8FAFC"/>
      <rect x="308" y="60" width="64" height="8" rx="4" fill="rgba(255,255,255,0.22)"/>
      <rect x="308" y="80" width="56" height="14" rx="5" fill="#22C55E"/>
      <rect x="156" y="132" width="260" height="122" rx="12" fill="#191928" stroke="rgba(255,255,255,0.08)"/>
      <circle cx="184" cy="166" r="12" fill="#8B5CF6" fill-opacity="0.25" stroke="#8B5CF6"/>
      <rect x="208" y="158" width="130" height="8" rx="4" fill="rgba(255,255,255,0.72)"/>
      <rect x="208" y="172" width="84" height="6" rx="3" fill="rgba(148,163,184,0.5)"/>
      <rect x="356" y="158" width="44" height="18" rx="6" fill="rgba(34,197,94,0.18)"/>
      <circle cx="184" cy="214" r="12" fill="#3B82F6" fill-opacity="0.25" stroke="#3B82F6"/>
      <rect x="208" y="206" width="112" height="8" rx="4" fill="rgba(255,255,255,0.62)"/>
      <rect x="208" y="220" width="70" height="6" rx="3" fill="rgba(148,163,184,0.45)"/>
      <rect x="356" y="206" width="44" height="18" rx="6" fill="rgba(139,92,246,0.22)"/>
    </svg>
  `;
}

export function renderEmptyStateGraphic(kind = 'default') {
  return `
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="8" y="12" width="56" height="48" rx="12" fill="rgba(139,92,246,0.1)" stroke="rgba(167,139,250,0.28)" stroke-width="1.5"/>
      <path d="M22 30H50M22 40H40" stroke="#A78BFA" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="50" cy="48" r="9" fill="#191925" stroke="#8B5CF6" stroke-width="1.5"/>
      ${
        kind === 'error'
          ? '<path d="M47 45L53 51M53 45L47 51" stroke="#EF4444" stroke-width="1.8" stroke-linecap="round"/>'
          : '<path d="M47 48H53M50 45V51" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round"/>'
      }
    </svg>
  `;
}

export function renderAnimatedCheckmark(size = 48) {
  return `
    <svg class="check-draw" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="rgba(34,197,94,0.14)" stroke="#22C55E" stroke-width="2"/>
      <path d="M15 24.5L21 30.5L33 18.5" stroke="#22C55E" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

export function renderBreakRing(progressPct, isOverdue = false, isCompleted = false) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, progressPct));
  const offset = circ - (clamped / 100) * circ;
  const stroke = isOverdue ? '#EF4444' : isCompleted ? '#22C55E' : '#8B5CF6';
  return `
    <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="5"/>
      ${
        clamped > 0
          ? `<circle cx="30" cy="30" r="${r}" fill="none" stroke="${stroke}" stroke-width="5"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 30 30)" style="transition:stroke-dashoffset 0.5s ease"/>`
          : ''
      }
    </svg>
  `;
}
