// The product mark: a warm token in the app's peach, with a pressed inner ring and one highlight.
// The name it stands for comes from src/brand.ts.
export function brandMark(size = 20): string {
  return `<svg class="brand-mark" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <defs><radialGradient id="brand-mark-fill" cx="35%" cy="32%" r="78%"><stop offset="0" stop-color="#ffd6ad"/><stop offset=".55" style="stop-color: var(--accent, #ff9f5a)"/><stop offset="1" stop-color="#e0647e"/></radialGradient></defs>
    <circle cx="12" cy="12" r="11" fill="url(#brand-mark-fill)"/>
    <circle cx="12" cy="12" r="6.6" fill="none" stroke="#2a1407" stroke-opacity=".28" stroke-width="1.6"/>
    <path d="M8.6 9.4a4.2 4.2 0 0 1 2.6-2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}
