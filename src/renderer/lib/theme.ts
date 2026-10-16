/**
 * Fork: colour themes. The classic glass is the default; Sherbet is opt-in.
 * The choice is a per-machine look, so it lives in this window's storage and
 * is applied before the first paint (see main.tsx).
 */
export type AppTheme = 'classic' | 'sherbet-dark' | 'sherbet-light'

export const APP_THEMES: { id: AppTheme; label: string; description: string; swatches: string[] }[] = [
  { id: 'classic', label: 'Classic', description: 'The original dark glass with blue.', swatches: ['#07080C', '#16181F', '#1A5FDF', '#38CCFF'] },
  { id: 'sherbet-dark', label: 'Sherbet dark', description: 'Warm graphite, tangerine and mint.', swatches: ['#1D1B21', '#302C36', '#FF8A4C', '#5FD3A6'] },
  { id: 'sherbet-light', label: 'Sherbet light', description: 'Warm paper, tangerine and mint.', swatches: ['#F6F5F3', '#FFFFFF', '#B84C14', '#1F8F68'] }
]

const STORAGE_KEY = 'merveilleclip.theme'

export function storedTheme(): AppTheme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (APP_THEMES.some((theme) => theme.id === value)) return value as AppTheme
  } catch { /* storage unavailable: fall back to the default */ }
  return 'classic'
}

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement
  if (theme === 'classic') delete root.dataset.theme
  else root.dataset.theme = theme
}

export function saveTheme(theme: AppTheme): void {
  applyTheme(theme)
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* applied for this session only */ }
}
