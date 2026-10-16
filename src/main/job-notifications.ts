import { BrowserWindow, Notification } from 'electron'
import type { JobSnapshot } from '../shared/jobs'
import { logger } from './logger'

/**
 * Fork: a system notification when a clipping job finishes or fails, so the
 * user can leave a long generation running and come back when it is ready.
 * Cancelled jobs stay silent: the user stopped them on purpose. The taskbar
 * button also flashes until the window gets focus.
 */
const notified = new Set<string>()

export function notifyJobFinished(snapshot: JobSnapshot, getWindow: () => BrowserWindow | null): void {
  if (snapshot.status !== 'completed' && snapshot.status !== 'failed') return
  if (notified.has(snapshot.id)) return
  notified.add(snapshot.id)

  const clips = snapshot.output?.total_clips ?? snapshot.clipsDone
  const title = snapshot.status === 'completed' ? 'Clips are ready' : 'Generation failed'
  const body = snapshot.status === 'completed'
    ? `${clips} ${clips === 1 ? 'clip' : 'clips'} finished. Click to open MerveilleClip.`
    : (snapshot.error ?? 'The clipping engine stopped.').slice(0, 200)

  const window = getWindow()
  if (window && !window.isDestroyed() && !window.isFocused()) window.flashFrame(true)
  if (!Notification.isSupported()) return
  try {
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', () => {
      const target = getWindow()
      if (!target || target.isDestroyed()) return
      if (target.isMinimized()) target.restore()
      target.show()
      target.focus()
    })
    notification.show()
  } catch (error) {
    logger.warn('job.notification_failed', { jobId: snapshot.id, error: String(error) })
  }
}
