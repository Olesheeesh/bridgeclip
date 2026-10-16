import { useEffect, useMemo, useState } from 'react'
import { canReorderContent, type Automation } from '../../shared/automations'
import { applyTextTemplate, DEFAULT_TEXT_TEMPLATE, EMOJI_PLACEMENTS, isTextTemplate, MAX_TEMPLATE_EMOJIS, visibleLength, type EmojiPlacement, type TextTemplate } from '../../shared/fork-text-template'
import { getApi } from '../lib/ipc'
import { errorMessage } from '../lib/utils'
import { StackLayoutPicker, TitleStylePicker } from './StackLayoutPicker'
import { Button } from './ui/Button'
import { Field, TextArea, TextInput } from './ui/Field'
import { Segmented } from './ui/Segmented'
import { Switch } from './ui/Switch'

const PLACEMENT_LABELS: Record<EmojiPlacement, string> = { none: 'No emoji', start: 'At the start', end: 'At the end' }
const SUGGESTED_EMOJIS = ['💀', '😭', '🔥', '🤯', '💰', '🎰', '😂', '👀', '🗿', '😳']

/**
 * Fork: per-automation text rules (title, caption, emoji, length) and the render
 * look used for jobs made for this automation. Applies to queued clips only.
 */
export function TextTemplatePanel({ automation, pickedIds, disabled, onUpdated, onNotice }: {
  automation: Automation
  pickedIds: string[]
  disabled: boolean
  onUpdated: (automations: Automation[]) => void
  onNotice: (message: string, tone?: 'error') => void
}): React.JSX.Element {
  const saved = automation.textTemplate ?? null
  const [draft, setDraft] = useState<TextTemplate>(saved ?? DEFAULT_TEXT_TEMPLATE)
  const [emojiInput, setEmojiInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { setDraft(automation.textTemplate ?? DEFAULT_TEXT_TEMPLATE) }, [automation.id, automation.textTemplate])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? DEFAULT_TEXT_TEMPLATE) || !saved
  const valid = isTextTemplate(draft)
  const set = (patch: Partial<TextTemplate>): void => setDraft((current) => ({ ...current, ...patch }))
  const queued = automation.content.filter(canReorderContent)
  const preview = useMemo(() => queued.slice(0, 3).map((item, index) => ({ id: item.id, ...applyTextTemplate(draft, item.templateBase ?? item.title, index + 1) })), [queued, draft])

  const run = async (action: string, request: () => Promise<void>): Promise<void> => {
    setBusy(action)
    try { await request() } catch (cause) { onNotice(errorMessage(cause, 'Could not update the text template.'), 'error') } finally { setBusy(null) }
  }
  const save = (): Promise<void> => run('save', async () => { onUpdated(await getApi().automations.setTextTemplate(automation.id, draft)); onNotice('Text template saved.') })
  const apply = (ids: string[] | null): Promise<void> => run(ids ? 'apply-picked' : 'apply-all', async () => {
    if (dirty) onUpdated(await getApi().automations.setTextTemplate(automation.id, draft))
    const result = await getApi().automations.applyTextTemplate(automation.id, ids)
    onUpdated(result.automations)
    onNotice(`Template applied to ${result.applied} ${result.applied === 1 ? 'clip' : 'clips'}${result.skipped ? ` · ${result.skipped} left as they are (submitted, draft, or approved for TikTok)` : ''}.`)
  })
  const addEmoji = (emoji: string): void => {
    const value = emoji.trim()
    if (!value || draft.emojis.includes(value) || draft.emojis.length >= MAX_TEMPLATE_EMOJIS) return
    set({ emojis: [...draft.emojis, value], emojiPlacement: draft.emojiPlacement === 'none' ? 'end' : draft.emojiPlacement })
  }

  return (
    <fieldset disabled={disabled || Boolean(busy)} className="min-w-0 space-y-5 p-3.5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="eyebrow">Title</p>
          <Field label="Default title" htmlFor="tpl-title">
            <TextInput id="tpl-title" inputSize="sm" value={draft.titleTemplate} maxLength={500} onChange={(event) => set({ titleTemplate: event.target.value })} />
          </Field>
          <p className="text-2xs text-ink-subtle">{'{title}'} is the clip's own title, {'{n}'} its place in the queue.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Min characters" htmlFor="tpl-min"><TextInput id="tpl-min" inputSize="sm" type="number" min={0} max={500} className="w-24" value={draft.minChars} onChange={(event) => set({ minChars: Math.max(0, Math.min(500, Math.floor(Number(event.target.value) || 0))) })} /></Field>
            <Field label="Max characters" htmlFor="tpl-max"><TextInput id="tpl-max" inputSize="sm" type="number" min={0} max={500} className="w-24" value={draft.maxChars} onChange={(event) => set({ maxChars: Math.max(0, Math.min(500, Math.floor(Number(event.target.value) || 0))) })} /></Field>
            <span className="pb-2 text-2xs text-ink-subtle">0 = no limit</span>
          </div>
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-ink-muted">Emoji</p>
            <Segmented size="sm" label="Emoji placement" value={draft.emojiPlacement} onChange={(emojiPlacement) => set({ emojiPlacement })}
              options={EMOJI_PLACEMENTS.map((placement) => ({ value: placement, label: PLACEMENT_LABELS[placement] }))} />
            <div className="flex flex-wrap gap-1.5" aria-label="Emoji list">
              {draft.emojis.map((emoji) => (
                <button key={emoji} type="button" className="glass-tile glass-tile-hover flex h-9 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 text-base" aria-label={`Remove ${emoji}`} title="Remove" onClick={() => set({ emojis: draft.emojis.filter((value) => value !== emoji) })}>
                  {emoji}<span aria-hidden className="text-xs text-ink-subtle">×</span>
                </button>
              ))}
              {SUGGESTED_EMOJIS.filter((emoji) => !draft.emojis.includes(emoji)).map((emoji) => (
                <button key={emoji} type="button" className="flex h-9 min-w-11 items-center justify-center rounded-full border border-dashed border-white/15 px-2.5 text-base opacity-60 hover:opacity-100" aria-label={`Add ${emoji}`} title="Add" onClick={() => addEmoji(emoji)}>{emoji}</button>
              ))}
              <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); addEmoji(emojiInput); setEmojiInput('') }}>
                <TextInput inputSize="sm" aria-label="Add another emoji" placeholder="Other" className="w-20" value={emojiInput} maxLength={16} onChange={(event) => setEmojiInput(event.target.value)} />
                <Button size="sm" type="submit" disabled={!emojiInput.trim()}>Add</Button>
              </form>
            </div>
            <p className="text-2xs text-ink-subtle">Each clip always gets the same emoji from your list, so re-applying never stacks them.</p>
          </div>
        </div>
        <div className="space-y-3">
          <p className="eyebrow">Caption</p>
          <Field label="Caption template" htmlFor="tpl-caption">
            <TextArea id="tpl-caption" rows={4} maxLength={2200} value={draft.captionTemplate} onChange={(event) => set({ captionTemplate: event.target.value })}
              placeholder={'{title}\n\n#ohne #ohnepixel #twitch #shorts'} />
          </Field>
          <p className="text-2xs text-ink-subtle">{'{title}'} is the finished title (with emoji). Put hashtags here.</p>
          <p className="text-2xs font-medium text-ink-muted">Preview</p>
          <ul className="space-y-1.5">
            {preview.length === 0 && <li className="text-xs text-ink-subtle">Add clips to see a preview.</li>}
            {preview.map((item) => (
              <li key={item.id} className="glass-tile rounded-lg px-3 py-2">
                <p className="text-xs text-ink">{item.title}</p>
                <p className={item.note ? 'text-2xs text-warning' : 'text-2xs text-success'}>{visibleLength(item.title)} characters{item.note ? ` · ${item.note}` : ''}</p>
                <p className="mt-1 whitespace-pre-line text-2xs text-ink-subtle">{item.caption}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-ink">
        <Switch checked={draft.autoApply} onChange={(autoApply) => set({ autoApply })} label="Apply to new clips automatically" />
        Apply to new clips automatically
      </label>

      <details className="rounded-xl">
        <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">Video look for jobs made for this automation</summary>
        <div className="mt-3 space-y-4">
          <div className="space-y-1.5"><p className="text-2xs font-medium text-ink-muted">Title on the video</p><TitleStylePicker value={draft.titleStyle} onChange={(titleStyle) => set({ titleStyle })} /></div>
          <div className="space-y-1.5"><p className="text-2xs font-medium text-ink-muted">Screen + camera layout</p><StackLayoutPicker value={draft.stackStyle} onChange={(stackStyle) => set({ stackStyle })} /></div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        <Button size="sm" variant="primary" loading={busy === 'apply-picked'} disabled={!valid || pickedIds.length === 0} onClick={() => void apply(pickedIds)}
          title={pickedIds.length ? undefined : 'Tick clips in the queue first'}>Apply to selected ({pickedIds.length})</Button>
        <Button size="sm" loading={busy === 'apply-all'} disabled={!valid || queued.length === 0} onClick={() => void apply(null)}>Apply to all queued ({queued.length})</Button>
        <Button size="sm" variant="ghost" loading={busy === 'save'} disabled={!valid || !dirty} onClick={() => void save()}>Save template</Button>
        {!valid && <span className="text-2xs text-warning">Max characters must be 0 or at least the minimum.</span>}
        <span className="text-2xs text-ink-subtle">Submitted clips never change. With AI captions on, AI drafts replace these captions.</span>
      </div>
    </fieldset>
  )
}
