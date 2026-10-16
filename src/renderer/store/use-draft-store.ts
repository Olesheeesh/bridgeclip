import { create } from 'zustand'
import { isStackStyle, isTitleStyle, STACK_PRESETS, type StackStyle, type TitleStyle } from '../../shared/fork-layout'

/** Fork: remembered across restarts so the layout is chosen once, not per job. */
const FORK_PREFS_KEY = 'bridgeclip.fork.layout'

type ForkPrefs = { stackStyle: StackStyle | null; titleStyle: TitleStyle; automationId: string | null }

function loadForkPrefs(): ForkPrefs {
  const fallback: ForkPrefs = { stackStyle: STACK_PRESETS.find((preset) => preset.id === 'more')!.style, titleStyle: 'box', automationId: null }
  try {
    const saved = JSON.parse(localStorage.getItem(FORK_PREFS_KEY) ?? 'null') as { stackStyle?: unknown; titleStyle?: unknown; automationId?: unknown } | null
    if (!saved) return fallback
    return {
      stackStyle: saved.stackStyle === null ? null : isStackStyle(saved.stackStyle) ? saved.stackStyle : fallback.stackStyle,
      titleStyle: isTitleStyle(saved.titleStyle) ? saved.titleStyle : fallback.titleStyle,
      automationId: typeof saved.automationId === 'string' ? saved.automationId : null
    }
  } catch { return fallback }
}

function saveForkPrefs(prefs: ForkPrefs): void {
  try { localStorage.setItem(FORK_PREFS_KEY, JSON.stringify(prefs)) } catch { /* Preferences are a convenience. */ }
}

/** The Create wizard's steps, in order. */
export type WizardStep = 'video' | 'format' | 'clips' | 'captions' | 'review'

/** The run the wizard just queued, shown as a confirmation until the next video. */
export interface StartedJob {
  jobId: string
  source: string
  /** True when every slot was busy and the job is waiting its turn. */
  queued: boolean
}

/**
 * The Create form, kept outside the component so the chosen video and options
 * survive navigating away (e.g. to Settings to add a key) and a failed run.
 */
export interface ClipDraft {
  workflow: 'automatic' | 'review' | null
  source: string
  clippingMode: 'quality' | 'economy' | 'advanced'
  plannerModel: string
  transcriptionModel: string
  aspectRatio: '9:16' | '16:9'
  /** 9:16 framing: smart per-shot layouts, always full frame, or letterbox. */
  layoutStyle: 'auto' | 'fill' | 'fit'
  /** Paid vision verification for ambiguous shots in Smart framing. */
  layoutVision: boolean
  /** tight: cut dead air and filler words; natural: original timing. */
  pacing: 'tight' | 'natural'
  videoSpeed: number
  /** Optional description of the moments to clip; blank finds the best ones. */
  clipRequest: string
  durations: string[]
  autoClipCount: boolean
  maxClips: number
  includeCaptions: boolean
  captionPreset: string
  /** Automatic clips: the title card at the top of each clip. */
  includeTitle: boolean
  /** Fork: screen + webcam framing in Smart 9:16 framing; null = stock layout. */
  stackStyle: StackStyle | null
  /** Fork: title card look. */
  titleStyle: TitleStyle
  /** Fork: automation that receives the finished clips; null = none. */
  automationId: string | null
  trimOpen: boolean
  trimStart: string
  trimEnd: string
}

interface DraftState extends ClipDraft {
  step: WizardStep
  started: StartedJob | null
  update: (patch: Partial<ClipDraft>) => void
  setStep: (step: WizardStep) => void
  clearSource: () => void
  /** The job was queued: show the confirmation. */
  markStarted: (started: StartedJob) => void
  /** Start a new video with no workflow selected, keeping output preferences (not the video-specific clip request). */
  startAnother: () => void
}

export const useDraftStore = create<DraftState>((set) => ({
  workflow: null,
  source: '',
  clippingMode: 'quality',
  plannerModel: '',
  transcriptionModel: '',
  aspectRatio: '9:16',
  layoutStyle: 'auto',
  layoutVision: true,
  pacing: 'tight',
  videoSpeed: 1,
  clipRequest: '',
  durations: ['short'],
  autoClipCount: true,
  maxClips: 5,
  includeCaptions: true,
  captionPreset: 'pop',
  includeTitle: true,
  ...loadForkPrefs(),
  trimOpen: false,
  trimStart: '',
  trimEnd: '',
  step: 'video',
  started: null,
  update: (patch) => set((state) => {
    if ('stackStyle' in patch || 'titleStyle' in patch || 'automationId' in patch) {
      saveForkPrefs({
        stackStyle: patch.stackStyle !== undefined ? patch.stackStyle : state.stackStyle,
        titleStyle: patch.titleStyle ?? state.titleStyle,
        automationId: patch.automationId !== undefined ? patch.automationId : state.automationId
      })
    }
    return patch
  }),
  setStep: (step) => set({ step }),
  clearSource: () => set({ source: '', trimStart: '', trimEnd: '' }),
  markStarted: (started) => set({ started }),
  startAnother: () => set({ workflow: null, source: '', clipRequest: '', trimOpen: false, trimStart: '', trimEnd: '', step: 'video', started: null })
}))
