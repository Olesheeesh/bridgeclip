import { Play, Plus, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SOUND_SETTINGS, SOUND_INTENSITIES, SOUND_KINDS, type Automation, type AutomationSound, type AutomationSoundSettings, type SoundIntensity, type SoundKind } from '../../shared/automations'
import { getApi } from '../lib/ipc'
import { errorMessage } from '../lib/utils'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'
import { Select } from './ui/Select'
import { Switch } from './ui/Switch'

const INTENSITY_LABELS: Record<SoundIntensity, string> = { subtle: 'Subtle · 1–2', normal: 'Normal · 3–4', wild: 'Wild · 5+' }
const KIND_LABELS: Record<SoundKind, string> = { reaction: 'Reaction', impact: 'Impact', transition: 'Transition', other: 'Other' }

/**
 * Fork: this automation's sound-effect library. Jobs made for the automation
 * (Create → "Add finished clips to") get these sounds placed by AI before
 * rendering. Changes save on their own.
 */
export function SoundEffectsPanel({ automation, disabled, onUpdated, onNotice }: {
  automation: Automation
  disabled: boolean
  onUpdated: (automations: Automation[]) => void
  onNotice: (message: string, tone?: 'error') => void
}): React.JSX.Element {
  const [sounds, setSounds] = useState<AutomationSound[]>(automation.sounds ?? [])
  const [settings, setSettings] = useState<AutomationSoundSettings>(automation.soundSettings ?? DEFAULT_SOUND_SETTINGS)
  const [playing, setPlaying] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setSounds(automation.sounds ?? []); setSettings(automation.soundSettings ?? DEFAULT_SOUND_SETTINGS) }, [automation.id, automation.sounds, automation.soundSettings])
  useEffect(() => () => { audio.current?.pause(); if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const persist = (nextSounds: AutomationSound[], nextSettings: AutomationSoundSettings): void => {
    setSounds(nextSounds); setSettings(nextSettings)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      getApi().automations.updateSounds(automation.id, { sounds: nextSounds, settings: nextSettings })
        .then(onUpdated).catch((cause) => onNotice(errorMessage(cause, 'Could not save the sounds.'), 'error'))
    }, 500)
  }
  const change = (id: string, patch: Partial<AutomationSound>): void => persist(sounds.map((sound) => sound.id === id ? { ...sound, ...patch } : sound), settings)

  const play = async (sound: AutomationSound): Promise<void> => {
    audio.current?.pause()
    if (playing === sound.id) { setPlaying(null); return }
    try {
      const url = await getApi().automations.soundPreview(automation.id, sound.id)
      const element = new Audio(url)
      element.volume = Math.min(1, sound.volume)
      element.onended = () => setPlaying(null)
      audio.current = element
      setPlaying(sound.id)
      await element.play()
    } catch (cause) { setPlaying(null); onNotice(errorMessage(cause, 'Could not play this sound.'), 'error') }
  }
  const run = async (request: () => Promise<Automation[]>): Promise<void> => {
    setBusy(true)
    try { onUpdated(await request()) } catch (cause) { onNotice(errorMessage(cause, 'Could not update the sounds.'), 'error') } finally { setBusy(false) }
  }

  return (
    <fieldset disabled={disabled || busy} className="min-w-0 space-y-4 p-3.5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Library</p>
            <Button size="sm" icon={<Plus className="h-3 w-3" />} onClick={() => void run(() => getApi().automations.addSounds(automation.id))}>Add sounds</Button>
          </div>
          {sounds.length === 0
            ? <p className="glass-well rounded-xl px-3 py-4 text-xs text-ink-subtle">Add MP3/WAV files like “Faaah”, “Vine boom” or “Explosion”. AI places them in clips made for this automation.</p>
            : <ul className="divide-y divide-hi/[0.06] rounded-xl border border-hi/[0.07]">
              {sounds.map((sound) => (
                <li key={sound.id} className="flex flex-wrap items-center gap-2.5 px-2.5 py-2">
                  <Button size="sm" variant="secondary" iconOnly aria-label={playing === sound.id ? `Stop ${sound.name}` : `Play ${sound.name}`}
                    icon={playing === sound.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} onClick={() => void play(sound)} />
                  <div className="min-w-0 flex-1 basis-32">
                    <p className="truncate text-xs font-medium text-ink" title={sound.name}>{sound.name}</p>
                    <Select size="sm" value={sound.kind} onChange={(kind) => change(sound.id, { kind: kind as SoundKind })} className="mt-1 w-32"
                      options={SOUND_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))} />
                  </div>
                  <input type="range" min={0} max={150} step={5} value={Math.round(sound.volume * 100)} aria-label={`${sound.name} volume`} className="h-7 w-28 accent-[rgb(var(--accent))]"
                    onChange={(event) => change(sound.id, { volume: Number(event.target.value) / 100 })} />
                  <Switch checked={sound.enabled} onChange={(enabled) => change(sound.id, { enabled })} label={`Use ${sound.name}`} />
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${sound.name}`} icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => void run(() => getApi().automations.removeSound(automation.id, sound.id))} />
                </li>
              ))}
            </ul>}
        </div>
        <div className="space-y-3">
          <p className="eyebrow">AI placement</p>
          <label className="flex items-center gap-2 text-xs text-ink">
            <Switch checked={settings.aiPlace} onChange={(aiPlace) => persist(sounds, { ...settings, aiPlace })} label="Let AI place sounds before rendering" />
            Let AI place sounds before rendering
          </label>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-ink-muted">How many per clip</p>
            <Segmented size="sm" label="How many sounds" value={settings.intensity} onChange={(intensity) => persist(sounds, { ...settings, intensity })}
              options={SOUND_INTENSITIES.map((value) => ({ value, label: INTENSITY_LABELS[value] }))} />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink">
            <Switch checked={settings.keepSpeechClear} onChange={(keepSpeechClear) => persist(sounds, { ...settings, keepSpeechClear })} label="Keep speech clear" />
            Keep speech clear (sounds only in pauses)
          </label>
          <p className="text-2xs text-ink-subtle">Used when you create a job with “Add finished clips to → {automation.name}”. AI picks reactions, punchlines and fails from the words; without an OpenRouter key a simple rule places them instead.</p>
        </div>
      </div>
    </fieldset>
  )
}
