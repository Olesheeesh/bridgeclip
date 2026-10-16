/**
 * Fork: user framing for screen + webcam clips and the title card look.
 * The engine side is StackStyle in engine/clip_engine/services/layout_analyzer.py.
 */
export type CamPosition = 'bottom' | 'top' | 'off'
export type ScreenFit = 'zoom' | 'wide' | 'whole'
export type CamZoom = 'whole' | 'shoulders' | 'face'
export type TitleStyle = 'box' | 'none' | 'outline' | 'shadow'

export interface StackStyle {
  /** Share of the frame height for the screen panel, 0.4-0.85. */
  screenRatio: number
  camPosition: CamPosition
  screenFit: ScreenFit
  camZoom: CamZoom
}

export const CAM_POSITIONS: readonly CamPosition[] = ['bottom', 'top', 'off']
export const SCREEN_FITS: readonly ScreenFit[] = ['zoom', 'wide', 'whole']
export const CAM_ZOOMS: readonly CamZoom[] = ['whole', 'shoulders', 'face']
export const TITLE_STYLES: readonly TitleStyle[] = ['box', 'none', 'outline', 'shadow']
export const MIN_SCREEN_RATIO = 0.4
export const MAX_SCREEN_RATIO = 0.85

export interface StackPreset {
  id: 'classic' | 'more' | 'whole' | 'camtop' | 'nocam'
  label: string
  hint: string
  /** null keeps BridgeClip's stock framing. */
  style: StackStyle | null
}

export const STACK_PRESETS: readonly StackPreset[] = [
  { id: 'classic', label: 'Classic', hint: 'Stock BridgeClip framing', style: null },
  { id: 'more', label: 'More screen', hint: '72% screen, wider view', style: { screenRatio: 0.72, camPosition: 'bottom', screenFit: 'wide', camZoom: 'whole' } },
  { id: 'whole', label: 'Whole screen', hint: 'Entire screen width', style: { screenRatio: 0.64, camPosition: 'bottom', screenFit: 'whole', camZoom: 'shoulders' } },
  { id: 'camtop', label: 'Camera on top', hint: 'Webcam above gameplay', style: { screenRatio: 0.68, camPosition: 'top', screenFit: 'wide', camZoom: 'whole' } },
  { id: 'nocam', label: 'No camera', hint: 'Only the screen', style: { screenRatio: 0.72, camPosition: 'off', screenFit: 'whole', camZoom: 'whole' } }
]

export const TITLE_STYLE_LABELS: Record<TitleStyle, string> = {
  box: 'White box', none: 'No background', outline: 'Outline', shadow: 'Yellow + shadow'
}

export function isStackStyle(value: unknown): value is StackStyle {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.screenRatio === 'number' && Number.isFinite(v.screenRatio) && v.screenRatio >= MIN_SCREEN_RATIO && v.screenRatio <= MAX_SCREEN_RATIO &&
    CAM_POSITIONS.includes(v.camPosition as CamPosition) && SCREEN_FITS.includes(v.screenFit as ScreenFit) && CAM_ZOOMS.includes(v.camZoom as CamZoom)
}

export function isTitleStyle(value: unknown): value is TitleStyle {
  return TITLE_STYLES.includes(value as TitleStyle)
}

/** The preset a style matches exactly, if any. */
export function presetFor(style: StackStyle | null): StackPreset['id'] | null {
  if (!style) return 'classic'
  return STACK_PRESETS.find((preset) => preset.style && (Object.keys(style) as (keyof StackStyle)[]).every((key) => preset.style![key] === style[key]))?.id ?? null
}

export function engineStackStyle(style: StackStyle): Record<string, string | number> {
  return { screen_ratio: style.screenRatio, cam_position: style.camPosition, screen_fit: style.screenFit, cam_zoom: style.camZoom }
}
