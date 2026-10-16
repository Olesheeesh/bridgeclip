import type { BrowserWindow } from 'electron'
import type { JobSnapshot } from '../shared/jobs'
import { sourceLabel } from './run-history'
import { sendTelegramNotification, showWindowsNotification } from './notification-channels'

/**
 * Fork: tell the user when a clipping job finishes or fails, so a long
 * generation can run unattended: a Windows notification (click to open the
 * app), a flashing taskbar button, and a Telegram message when connected in
 * Settings → Notifications. Cancelled jobs stay silent: the user stopped them.
 */
const notified = new Set<string>()

function cost(snapshot: JobSnapshot): string {
  const total = (snapshot.output?.metrics?.api_costs as { total_estimated_cost_usd?: unknown } | undefined)?.total_estimated_cost_usd
  return typeof total === 'number' && Number.isFinite(total) ? ` · $${total.toFixed(2)}` : ''
}

export function notifyJobFinished(snapshot: JobSnapshot, getWindow: () => BrowserWindow | null): void {
  if (snapshot.status !== 'completed' && snapshot.status !== 'failed') return
  if (notified.has(snapshot.id)) return
  notified.add(snapshot.id)

  const source = sourceLabel(snapshot.request.videoUrl)
  const clips = snapshot.output?.total_clips ?? snapshot.clipsDone
  const held = snapshot.output?.clips.filter((clip) => clip.jev_hold).length ?? 0
  const done = snapshot.status === 'completed'
  const title = done ? 'Clips are ready' : 'Generation failed'
  const body = done
    ? `${clips} ${clips === 1 ? 'clip' : 'clips'} from ${source}${held ? `, ${held} held by Jev for you to check` : ''}. Click to open MerveilleClip.`
    : `${source}: ${(snapshot.error ?? 'The clipping engine stopped.').slice(0, 200)}`

  const window = getWindow()
  if (window && !window.isDestroyed() && !window.isFocused()) window.flashFrame(true)
  showWindowsNotification(title, body, () => {
    const target = getWindow()
    if (!target || target.isDestroyed()) return
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
  })
  void sendTelegramNotification(done
    ? `✅ MerveilleClip: ${clips} ${clips === 1 ? 'clip is' : 'clips are'} ready\n${source}${cost(snapshot)}${held ? `\n⏸ ${held} held by Jev, check them in the Library` : ''}`
    : `❌ MerveilleClip: generation failed\n${source}\n${(snapshot.error ?? 'The clipping engine stopped.').slice(0, 300)}`)
}
