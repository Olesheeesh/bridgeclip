import { CAM_POSITIONS, CAM_ZOOMS, MAX_SCREEN_RATIO, MIN_SCREEN_RATIO, presetFor, SCREEN_FITS, STACK_PRESETS, TITLE_STYLE_LABELS, TITLE_STYLES, type CamPosition, type CamZoom, type ScreenFit, type StackStyle, type TitleStyle } from '../../shared/fork-layout'
import { cn } from '../lib/utils'
import { Segmented } from './ui/Segmented'

const CAM_LABELS: Record<CamPosition, string> = { bottom: 'Below gameplay', top: 'Above gameplay', off: 'Hide camera' }
const FIT_LABELS: Record<ScreenFit, string> = { zoom: 'Zoom on action', wide: 'Wider view', whole: 'Whole screen width' }
const ZOOM_LABELS: Record<CamZoom, string> = { whole: 'Whole webcam', shoulders: 'Head & shoulders', face: 'Face' }

// A stylized 16:9 screen (six bars) so cropping vs. whole width reads at a glance.
const SCREEN_ART = 'linear-gradient(90deg, #c2413b 0 16.6%, #3f8f4f 0 33.3%, #c9a227 0 50%, #2f5fb8 0 66.6%, #8a3fa8 0 83.3%, #2a9fb0 0)'

/**
 * Fork: how screen + webcam shots are framed (Smart 9:16 framing only).
 * Presets are one click; the controls below fine-tune the chosen layout.
 */
export function StackLayoutPicker({ value, onChange }: { value: StackStyle | null; onChange: (value: StackStyle | null) => void }): React.JSX.Element {
  const active = presetFor(value)
  const set = (patch: Partial<StackStyle>): void => onChange({ ...(value ?? STACK_PRESETS[1].style!), ...patch })
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <LayoutPreview style={value} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" role="radiogroup" aria-label="Screen + camera presets">
          {STACK_PRESETS.map((preset) => {
            const selected = active === preset.id
            return (
              <button key={preset.id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(preset.style)}
                className={cn('glass-tile glass-tile-hover min-h-11 rounded-xl px-3 py-2 text-left', selected ? 'glass-selected text-ink' : 'text-ink-muted hover:text-ink')}>
                <span className="block text-xs font-medium">{preset.label}</span>
                <span className={cn('block truncate text-2xs', selected ? 'text-ink-muted' : 'text-ink-subtle')}>{preset.hint}</span>
              </button>
            )
          })}
        </div>
        {value && <div className="space-y-3">
          <Control label="Camera">
            <Segmented label="Camera position" value={value.camPosition} onChange={(camPosition) => set({ camPosition })}
              options={CAM_POSITIONS.map((position) => ({ value: position, label: CAM_LABELS[position] }))} />
          </Control>
          {value.camPosition !== 'off' && <Control label={`Screen share · ${Math.round(value.screenRatio * 100)}%`} htmlFor="stack-screen-ratio">
            <input id="stack-screen-ratio" type="range" min={MIN_SCREEN_RATIO * 100} max={MAX_SCREEN_RATIO * 100} step={1} value={Math.round(value.screenRatio * 100)}
              onChange={(event) => set({ screenRatio: Number(event.target.value) / 100 })} className="h-7 w-full accent-[rgb(var(--accent))]" />
          </Control>}
          <Control label="Gameplay">
            <Segmented label="Gameplay framing" value={value.screenFit} onChange={(screenFit) => set({ screenFit })}
              options={SCREEN_FITS.map((fit) => ({ value: fit, label: FIT_LABELS[fit] }))} />
          </Control>
          {value.camPosition !== 'off' && <Control label="Camera zoom">
            <Segmented label="Camera zoom" value={value.camZoom} onChange={(camZoom) => set({ camZoom })}
              options={CAM_ZOOMS.map((zoom) => ({ value: zoom, label: ZOOM_LABELS[zoom] }))} />
          </Control>}
        </div>}
        <p className="text-2xs text-ink-subtle">Applies to shots with gameplay or a screen plus a webcam. Other shots keep Smart framing.</p>
      </div>
    </div>
  )
}

function Control({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-2xs font-medium text-ink-muted">{label}</label>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

/** A small 9:16 sketch of the chosen layout; it mirrors the engine's geometry. */
function LayoutPreview({ style }: { style: StackStyle | null }): React.JSX.Element {
  const H = 224
  const W = 126
  const camOn = style ? style.camPosition !== 'off' : true
  const screenH = !style ? Math.round(H * 0.6) : camOn ? Math.round(H * style.screenRatio) : H
  const camH = H - screenH
  const fit = style?.screenFit ?? 'zoom'
  // Visible share of the 16:9 width: zoom crops to the panel, wide shows 1.5x that, whole all of it.
  const panelShare = Math.min(1, (W / screenH) / (16 / 9))
  const shown = fit === 'whole' ? 1 : fit === 'wide' ? Math.min(1, panelShare * 1.5) : panelShare
  const pictureH = Math.min(screenH, (W / shown) * 9 / 16)
  const align = !style || style.camPosition === 'bottom' ? 'end' : style.camPosition === 'top' ? 'start' : 'center'
  const screen = (
    <div className="relative shrink-0 overflow-hidden bg-black" style={{ height: screenH }}>
      <div className="absolute inset-[-8px] opacity-50 blur-md" style={{ backgroundImage: SCREEN_ART }} />
      <div className={cn('absolute inset-0 flex', align === 'end' ? 'items-end' : align === 'start' ? 'items-start' : 'items-center')}>
        <div className="w-full transition-[height] duration-300" style={{ height: pictureH, backgroundImage: SCREEN_ART, backgroundSize: `${100 / shown}% 100%`, backgroundPosition: 'center' }} />
      </div>
    </div>
  )
  const camera = camOn && camH > 0 && (
    <div className="relative shrink-0 overflow-hidden bg-[radial-gradient(120%_90%_at_50%_30%,#4b4038,#141110)]" style={{ height: camH }}>
      <div className="absolute left-1/2 top-[22%] -translate-x-1/2 rounded-full bg-[#d8b49a]"
        style={{ width: camH * (style?.camZoom === 'face' ? 0.62 : style?.camZoom === 'shoulders' ? 0.46 : 0.34), aspectRatio: '1' }} />
    </div>
  )
  return (
    <div className="shrink-0 self-start">
      <div aria-hidden className="flex flex-col overflow-hidden rounded-xl bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]" style={{ width: W, height: H }}>
        {style?.camPosition === 'top' ? <>{camera}{screen}</> : <>{screen}{camera}</>}
      </div>
      <p className="mt-1.5 w-[126px] text-center text-2xs text-ink-subtle">Preview</p>
    </div>
  )
}

/** Fork: the title card look. */
export function TitleStylePicker({ value, onChange }: { value: TitleStyle; onChange: (value: TitleStyle) => void }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Title style">
      {TITLE_STYLES.map((style) => {
        const selected = value === style
        return (
          <button key={style} type="button" role="radio" aria-checked={selected} onClick={() => onChange(style)}
            className={cn('glass-tile glass-tile-hover flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#2f5a3a,#23415e)] px-2 py-2', selected && 'glass-selected')}>
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold',
              style === 'box' && 'bg-white text-black',
              style === 'none' && 'text-white [text-shadow:0_2px_3px_rgb(0_0_0/0.8)]',
              style === 'outline' && 'text-white [-webkit-text-stroke:1px_#000] [paint-order:stroke_fill]',
              style === 'shadow' && 'text-[#ffd500] [text-shadow:0_0_2px_#000,0_2px_0_#000]')}>Title</span>
            <span className="text-2xs text-ink">{TITLE_STYLE_LABELS[style]}</span>
          </button>
        )
      })}
    </div>
  )
}
