import { useEffect, useId, useRef, useState } from 'react'
import type { Automation, AutomationContent, AutomationTikTokReview } from '../../shared/automations'
import { captionLength, checkCaption, checkClip, EMPTY_TIKTOK_ACCOUNT, PLATFORM_RULES, sharedCommercialTypes, tiktokOptionsError, type TikTokPostOptions } from '../../shared/zernio-posts'
import { getApi } from '../lib/ipc'
import { errorMessage, localFileUrl } from '../lib/utils'
import { EMPTY_TIKTOK, TikTokAccountFields, TikTokSharedFields } from './PostDialog'
import { Button } from './ui/Button'
import { Callout } from './ui/Callout'
import { Checkbox } from './ui/Checkbox'
import { Dialog, DialogFooter } from './ui/Dialog'
import { TextArea } from './ui/Field'

/**
 * Fork addition: review every clip waiting for TikTok on one screen. You see each
 * clip and caption, choose the TikTok settings once, confirm once, and every
 * included clip is approved through the same per-clip checks as the single review.
 */
interface Entry {
  item: AutomationContent
  review: AutomationTikTokReview | null
  caption: string
  included: boolean
  error: string | null
}

export function AutomationTikTokBatchReviewDialog({ automation, items, onClose, onApproved }: {
  automation: Automation
  items: AutomationContent[]
  onClose: () => void
  onApproved: (automations: Automation[], approved: number, failed: number) => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[]>(() => items.map((item) => ({ item, review: null, caption: item.caption, included: true, error: null })))
  const [prepared, setPrepared] = useState(0)
  const [preparing, setPreparing] = useState(true)
  const [options, setOptions] = useState<TikTokPostOptions>(EMPTY_TIKTOK)
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef(false)
  const started = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    // React's development effect replay must not prepare every clip twice.
    if (started.current) return
    started.current = true
    void (async () => {
      // Reviews are prepared one at a time: the automation allows one operation at a time.
      for (let index = 0; index < items.length && !stop.current; index++) {
        const item = items[index]
        try {
          const review = await getApi().automations.prepareTikTokReview(automation.id, item.id)
          setEntries((current) => current.map((entry) => entry.item.id === item.id ? { ...entry, review, caption: review.caption } : entry))
        } catch (cause) {
          setEntries((current) => current.map((entry) => entry.item.id === item.id ? { ...entry, included: false, error: errorMessage(cause, 'Could not prepare this clip.') } : entry))
        }
        setPrepared(index + 1)
      }
      setPreparing(false)
    })()
  }, [automation.id, items])

  useEffect(() => { dialogRef.current?.focus() }, [])

  const creators = entries.find((entry) => entry.review)?.review?.creators ?? []
  const clipIssue = (entry: Entry): string | null => {
    if (!entry.review) return entry.error ?? (preparing ? 'Preparing…' : 'Not prepared.')
    if (!entry.caption.trim()) return 'Enter a TikTok caption.'
    const captionError = checkCaption('tiktok', entry.caption).error
    if (captionError) return captionError
    for (const { info } of entry.review.creators) {
      const blocking = checkClip('tiktok', entry.review.media, { tiktokMaxSec: info.maxVideoDurationSec }).blocking
      if (blocking) return blocking
    }
    return null
  }
  const sharedIssues: string[] = []
  if (creators.length) {
    const optionsError = tiktokOptionsError(options, creators.map((creator) => creator.info))
    if (optionsError) sharedIssues.push(optionsError)
    for (const { info, businessConnection } of creators) {
      if (businessConnection && !options.draft && options.accounts[info.accountId]?.privacyLevel && options.accounts[info.accountId].privacyLevel !== 'PUBLIC_TO_EVERYONE') {
        sharedIssues.push('Choose Everyone for a direct video post on this Business connection, or send it to your TikTok inbox.')
      }
    }
  }
  const ready = entries.filter((entry) => entry.included && entry.review && !clipIssue(entry))
  const canApprove = !preparing && !saving && confirmed && ready.length > 0 && sharedIssues.length === 0

  const update = (id: string, patch: Partial<Entry>): void => {
    setEntries((current) => current.map((entry) => entry.item.id === id ? { ...entry, ...patch } : entry))
    // Any change to what will be posted needs a fresh confirmation.
    setConfirmed(false)
  }

  const approveAll = async (): Promise<void> => {
    if (!canApprove) return
    setError(null)
    let latest: Automation[] | null = null
    let approved = 0
    const failures: string[] = []
    for (let index = 0; index < ready.length; index++) {
      const entry = ready[index]
      setSaving(`Approving ${index + 1} of ${ready.length}…`)
      try {
        latest = await getApi().automations.approveTikTokReview(automation.id, entry.item.id, {
          reviewId: entry.review!.reviewId, caption: entry.caption, options: structuredClone(options), previewConfirmed: true
        })
        approved++
        setEntries((current) => current.filter((value) => value.item.id !== entry.item.id))
      } catch (cause) {
        const message = errorMessage(cause, 'Could not approve this clip.')
        failures.push(`${entry.item.title}: ${message}`)
        setEntries((current) => current.map((value) => value.item.id === entry.item.id ? { ...value, included: false, error: message } : value))
      }
    }
    setSaving(null)
    if (failures.length) {
      setError(`${approved} approved, ${failures.length} not approved. ${failures[0]}`)
      if (latest) onApproved(latest, approved, failures.length)
      return
    }
    onApproved(latest ?? [], approved, 0)
  }

  return (
    <Dialog ref={dialogRef} aria-labelledby={titleId} panelClassName="max-w-[980px]" onBackdropMouseDown={() => { if (!saving) { stop.current = true; onClose() } }} onKeyDown={(event) => {
      if (event.key === 'Escape' && !saving) { event.preventDefault(); stop.current = true; onClose() }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canApprove) { event.preventDefault(); void approveAll() }
    }}>
      <div className="border-b border-white/[0.07] px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold text-ink">Review all for TikTok</h2>
        <p className="mt-1 text-sm text-ink-muted">{automation.name} · {items.length} {items.length === 1 ? 'clip' : 'clips'} waiting</p>
        <p className="mt-2 text-xs text-ink-subtle">Look through the clips and captions below, choose the TikTok settings once, then approve them together. Untick any clip you want to leave waiting. Each clip still goes through the same checks as a single review.</p>
      </div>
      <div className="grid min-h-0 gap-4 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-2">
          {preparing && (
            <Callout tone="info" action={<Button size="sm" onClick={() => { stop.current = true }}>Stop preparing</Button>}>
              Preparing previews and TikTok settings… {prepared} of {items.length}
            </Callout>
          )}
          {error && <Callout tone="danger">{error}</Callout>}
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07]">
            {entries.map((entry) => {
              const issue = clipIssue(entry)
              return (
                <li key={entry.item.id} className="flex gap-3 p-3">
                  <div className="pt-1">
                    <Checkbox checked={entry.included} disabled={!entry.review || Boolean(saving)} onChange={(included) => update(entry.item.id, { included })} label={`Include ${entry.item.title}`} />
                  </div>
                  {entry.review
                    ? <video src={localFileUrl(entry.review.clipPath)} controls preload="metadata" className="h-[160px] w-[90px] shrink-0 rounded-lg bg-black object-contain" aria-label={`${entry.item.title} preview`} />
                    : <div className="h-[160px] w-[90px] shrink-0 rounded-lg bg-white/[0.04]" aria-hidden />}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium text-ink" title={entry.item.title}>{entry.item.title}</p>
                    <TextArea rows={3} aria-label={`TikTok caption for ${entry.item.title}`} value={entry.caption} disabled={!entry.review || Boolean(saving)} onChange={(event) => update(entry.item.id, { caption: event.target.value })} />
                    <p className="text-2xs text-ink-subtle">{captionLength(entry.caption).toLocaleString()} / {PLATFORM_RULES.tiktok.captionMax.toLocaleString()}
                      {issue && <span className={entry.error ? 'text-danger' : 'text-warning'}> · {issue}</span>}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <fieldset disabled={Boolean(saving) || !creators.length} className="min-w-0 space-y-4 md:sticky md:top-0 md:self-start">
          <p className="text-xs font-semibold text-ink-muted">Settings for all approved clips</p>
          {!creators.length && <p className="text-xs text-ink-subtle">{preparing ? 'Loading your TikTok account settings…' : 'No clip could be prepared.'}</p>}
          {creators.map(({ info, businessConnection, handle }) => (
            <TikTokAccountFields key={info.accountId} heading={handle} state={info} value={options.accounts[info.accountId] ?? EMPTY_TIKTOK_ACCOUNT}
              onChange={(value) => { setOptions({ ...options, accounts: { ...options.accounts, [info.accountId]: value }, consent: false }); setConfirmed(false) }}
              brandedContent={options.disclose && options.brandedContent} draft={options.draft} businessConnection={businessConnection} onRetry={() => undefined} />
          ))}
          {creators.length > 0 && <TikTokSharedFields value={options} onChange={(value) => { setOptions(value); setConfirmed(false) }} commercialTypes={sharedCommercialTypes(creators.map((creator) => creator.info))} />}
          {creators.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-ink">
              <Checkbox checked={confirmed} disabled={preparing || ready.length === 0} onChange={setConfirmed} label={`I reviewed these ${ready.length} clips and captions for TikTok`} />
              <span>I reviewed these {ready.length} {ready.length === 1 ? 'clip' : 'clips'} and captions for TikTok.</span>
            </div>
          )}
          {sharedIssues.length > 0 && <p className="text-xs text-ink-muted" role="status">{sharedIssues[0]}</p>}
        </fieldset>
      </div>
      <DialogFooter>
        <Button onClick={() => { stop.current = true; onClose() }} disabled={Boolean(saving)}>Close</Button>
        <Button variant="primary" loading={Boolean(saving)} disabled={!canApprove} onClick={() => void approveAll()}>
          {saving ?? `Approve ${ready.length} ${ready.length === 1 ? 'clip' : 'clips'}`}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
