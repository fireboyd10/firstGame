export const icons = {
  flag: '<path d="M5 21V3m0 1c5-4 8 4 14 0v10c-6 4-9-4-14 0"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  restart: '<path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/>',
  cross: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M5 13H3v8h18v-8h-2"/>',
  spark: '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm0 2H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5m-4 1v6m-5 1h10"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
export function icon(name: keyof typeof icons, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

// Original geometric artwork; no downloaded images or fonts.
export function heroArt(): string {
  return `<svg class="hero-art" viewBox="0 0 440 270" fill="none" aria-hidden="true">
    <defs><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#e5c6d8" opacity=".13"/></pattern></defs>
    <rect width="440" height="270" fill="url(#dots)"/>
    <ellipse cx="226" cy="247" rx="139" ry="12" fill="#0c090f" opacity=".6"/>
    <path d="M44 148C13 51 167 10 266 38c113 33 160 110 101 164" stroke="#987c91" stroke-dasharray="3 7" opacity=".4"/>
    <g class="art-card art-red" transform="rotate(-14 158 144)">
      <rect x="80" y="43" width="163" height="192" rx="22" fill="#0b080f" stroke="#0b080f" stroke-width="7"/>
      <rect x="76" y="37" width="163" height="192" rx="22" fill="#fa5167"/>
      <path d="M93 58h14m-7-7v14M207 201h14m-7-7v14" stroke="#521d35" stroke-width="2"/>
      <path d="M118 92c0-35 78-36 78 0v49c0 41-78 39-78 0V92Z" fill="#55233d"/>
      <path d="m121 99 25 4m21 0 25-4" stroke="#ffa0aa" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="139" cy="116" rx="7" ry="11" fill="#fff2d9"/><ellipse cx="178" cy="116" rx="7" ry="11" fill="#fff2d9"/>
      <path d="m158 118-5 18h10m-18 21 25-6" stroke="#ffa0aa" stroke-width="3" stroke-linecap="round"/>
      <path d="M130 70 117 50l24 10m39 9 16-20-1 33" fill="#55233d"/>
      <text x="157" y="207" text-anchor="middle" fill="#40192e" font-family="Arial,sans-serif" font-weight="900" font-size="13" letter-spacing="3">RED FLAG</text>
    </g>
    <g class="art-card art-green" transform="rotate(13 279 139)">
      <rect x="210" y="57" width="157" height="181" rx="22" fill="#0b080f" stroke="#0b080f" stroke-width="7"/>
      <rect x="205" y="48" width="157" height="181" rx="22" fill="#99e5bf"/>
      <path d="M222 69h14m-7-7v14M332 203h14m-7-7v14" stroke="#215744" stroke-width="2"/>
      <path d="M250 94c-6-23 18-28 24-16 10-17 34-6 25 10 24-3 31 24 9 31l7 33c3 40-69 41-70 1l-1-39c-22 0-17-24 6-20Z" fill="#255344"/>
      <path d="M254 118q8-12 16 0m15 0q8-12 16 0" stroke="#e5ffdc" stroke-width="4" stroke-linecap="round"/>
      <path d="m278 126-4 11h8m-23 10q18 28 37-2" stroke="#e5ffdc" stroke-width="3" stroke-linecap="round"/>
      <circle cx="250" cy="139" r="6" fill="#ee9caf"/><circle cx="307" cy="137" r="6" fill="#ee9caf"/>
      <text x="284" y="208" text-anchor="middle" fill="#214938" font-family="Arial,sans-serif" font-weight="900" font-size="12" letter-spacing="2">GREEN FLAG</text>
    </g>
    <g class="art-spark"><path d="m370 38 4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12Z" fill="#f6eddc"/><path d="m53 191 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z" fill="#eda0c0"/></g>
    <g transform="rotate(-9 219 51)"><rect x="184" y="25" width="69" height="38" rx="19" fill="#f8edda"/><path d="m211 63 1 11 12-11" fill="#f8edda"/><path d="M203 43s7-9 16-9 16 9 16 9-7 9-16 9-16-9-16-9Z" stroke="#402839" stroke-width="2"/><circle cx="219" cy="43" r="4" fill="#402839"/></g>
  </svg>`;
}

export function cardArt(variant: number): string {
  const shapes = [
    '<path d="M15 43c21-29 50-29 71 0-21 28-50 28-71 0Z"/><ellipse cx="50" cy="43" rx="11" ry="17"/><path d="m20 16 5 8m25-14v10m30-4-5 8"/>',
    '<path d="M21 17h56a9 9 0 0 1 9 9v27a9 9 0 0 1-9 9H50L33 76V62H21a9 9 0 0 1-9-9V26a9 9 0 0 1 9-9Z"/><path d="m35 38 9 10 20-22"/>',
    '<path d="M50 72 21 46c-22-22 9-49 29-25 20-24 51 3 29 25L50 72Z"/><path d="m50 26-7 16 14 3-7 17"/>',
    '<path d="m50 9 40 64H10L50 9Z"/><path d="M50 31v19m0 8v3"/>',
  ];
  return `<svg class="card-art" viewBox="0 0 100 86" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[variant % shapes.length]}</svg>`;
}
