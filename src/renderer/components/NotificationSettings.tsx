import { useEffect, useState } from 'react'
import { Check, Send } from 'lucide-react'
import { getApi } from '../lib/ipc'
import { errorMessage } from '../lib/utils'
import type { NotificationSettings as Settings } from '../../shared/notifications'
import { Button } from './ui/Button'
import { Callout } from './ui/Callout'
import { TextInput } from './ui/Field'
import { Switch } from './ui/Switch'

/**
 * Fork: Settings → Notifications. Windows notifications, plus an optional
 * Telegram bot of the user's own, connected in three steps.
 */
export function NotificationSettings(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (typeof getApi().notifications?.get !== 'function') { setError('Restart MerveilleClip to set up notifications.'); return }
    getApi().notifications.get().then(setSettings).catch((cause) => setError(errorMessage(cause, 'Could not load notification settings.')))
  }, [])

  const run = async (action: string, request: () => Promise<Settings | void>, done?: string): Promise<void> => {
    setBusy(action); setError(null); setNotice(null)
    try {
      const result = await request()
      if (result) setSettings(result)
      if (done) setNotice(done)
    } catch (cause) {
      setError(errorMessage(cause, 'Something went wrong. Please try again.'))
    } finally { setBusy(null) }
  }

  if (!settings) return <div className="mt-4">{error ? <Callout tone="warning">{error}</Callout> : <p className="text-sm text-ink-muted">Loading…</p>}</div>
  const tg = settings.telegram

  return (
    <div className="mt-4 space-y-4">
      <div className="glass-tile flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Windows notifications</p>
          <p className="text-xs text-ink-muted">A notification when a generation finishes or fails. Click it to open MerveilleClip.</p>
        </div>
        <Switch label="Windows notifications" checked={settings.windows} disabled={Boolean(busy)}
          onChange={(windows) => void run('windows', () => getApi().notifications.set({ windows }))} />
      </div>

      <div className="glass-tile space-y-3 rounded-xl px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Telegram</p>
            <p className="text-xs text-ink-muted">Get a message on your phone when clips are ready, from a bot only you control.</p>
          </div>
          {tg.connected && tg.chatFound && <Switch label="Telegram messages" checked={tg.enabled} disabled={Boolean(busy)}
            onChange={(telegramEnabled) => void run('telegram', () => getApi().notifications.set({ telegramEnabled }))} />}
        </div>

        <ol className="space-y-3 text-sm text-ink">
          <li className="flex gap-3">
            <Step n={1} done={tg.connected} />
            <div className="min-w-0 flex-1 space-y-2">
              <p>In Telegram, open <span className="font-semibold">@BotFather</span>, send <span className="font-mono">/newbot</span>, pick any name, and copy the token it gives you.</p>
              {tg.connected
                ? <p className="text-xs text-success">Connected to @{tg.botName || 'your bot'}</p>
                : <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void run('connect', () => getApi().notifications.connectTelegram(token), 'Bot connected. Now do step 2.').then(() => setToken('')) }}>
                    <TextInput type="password" autoComplete="off" spellCheck={false} aria-label="Bot token" placeholder="123456789:AAE…" className="w-full max-w-sm" value={token} onChange={(event) => setToken(event.target.value)} />
                    <Button type="submit" className="min-h-11" loading={busy === 'connect'} disabled={!token.trim() || Boolean(busy)}>Connect bot</Button>
                  </form>}
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={2} done={tg.chatFound} />
            <div className="min-w-0 flex-1 space-y-2">
              <p>Open {tg.botName ? <span className="font-semibold">@{tg.botName}</span> : 'your bot'} in Telegram and press <span className="font-semibold">Start</span> (or send it any message). Then press Find my chat.</p>
              {tg.chatFound
                ? <p className="text-xs text-success">Messages go to {tg.chatName}</p>
                : <Button className="min-h-11" disabled={!tg.connected || Boolean(busy)} loading={busy === 'chat'}
                    onClick={() => void run('chat', () => getApi().notifications.findTelegramChat(), 'Chat found. A confirmation was sent to Telegram.')}>Find my chat</Button>}
            </div>
          </li>
        </ol>

        {tg.connected && <div className="flex flex-wrap gap-2 border-t border-hi/[0.06] pt-3">
          <Button variant="ghost" className="min-h-11" disabled={Boolean(busy)} loading={busy === 'disconnect'}
            onClick={() => void run('disconnect', () => getApi().notifications.disconnectTelegram(), 'Telegram disconnected.')}>Disconnect bot</Button>
        </div>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="min-h-11" icon={<Send className="h-3.5 w-3.5" />} disabled={Boolean(busy)} loading={busy === 'test'}
          onClick={() => void run('test', async () => {
            const result = await getApi().notifications.test()
            setNotice(`Test sent${result.windows ? ' to Windows' : ''}${result.windows && result.telegram ? ' and' : ''}${result.telegram ? ' to Telegram' : ''}${!result.windows && !result.telegram ? ' nowhere: turn on a channel first' : ''}.`)
          })}>Send a test</Button>
        {notice && <span className="inline-flex items-center gap-1.5 text-xs text-success"><Check className="h-3.5 w-3.5" />{notice}</span>}
      </div>
      {error && <Callout tone="danger">{error}</Callout>}
    </div>
  )
}

function Step({ n, done }: { n: number; done: boolean }): React.JSX.Element {
  return <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-success/15 text-success' : 'bg-hi/[0.08] text-ink-muted'}`}>
    {done ? <Check className="h-3.5 w-3.5" /> : n}
  </span>
}
