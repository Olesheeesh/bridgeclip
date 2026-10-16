import { app, Notification, safeStorage } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'
import type { NotificationSettings } from '../shared/notifications'

/**
 * Fork: where finished-generation alerts go. Windows notifications are on by
 * default; Telegram is opt-in: the user makes their own bot with @BotFather,
 * pastes its token, messages the bot once, and MerveilleClip finds the chat.
 * The token is encrypted with the OS keychain (safeStorage) like API keys.
 */
interface Stored {
  windows: boolean
  telegramEnabled: boolean
  /** safeStorage ciphertext, base64. */
  token: string
  botName: string
  chatId: string
  chatName: string
}

const DEFAULTS: Stored = { windows: true, telegramEnabled: false, token: '', botName: '', chatId: '', chatName: '' }
const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/
const CHAT_ID = /^-?\d{1,20}$/
const API = 'https://api.telegram.org'

const file = (): string => join(app.getPath('userData'), 'notifications.json')

function load(): Stored {
  try {
    if (!existsSync(file())) return { ...DEFAULTS }
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Stored>
    return {
      windows: typeof raw.windows === 'boolean' ? raw.windows : DEFAULTS.windows,
      telegramEnabled: raw.telegramEnabled === true,
      token: typeof raw.token === 'string' ? raw.token : '',
      botName: typeof raw.botName === 'string' ? raw.botName.slice(0, 64) : '',
      chatId: typeof raw.chatId === 'string' && CHAT_ID.test(raw.chatId) ? raw.chatId : '',
      chatName: typeof raw.chatName === 'string' ? raw.chatName.slice(0, 128) : ''
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(value: Stored): void {
  const temp = `${file()}.tmp`
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 })
  renameSync(temp, file())
}

function token(stored: Stored): string {
  if (!stored.token) return ''
  try { return safeStorage.decryptString(Buffer.from(stored.token, 'base64')) } catch { return '' }
}

function view(stored: Stored): NotificationSettings {
  return {
    windows: stored.windows,
    telegram: { enabled: stored.telegramEnabled, connected: Boolean(stored.token), botName: stored.botName, chatFound: Boolean(stored.chatId), chatName: stored.chatName }
  }
}

async function telegram(key: string, method: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`${API}/bot${key}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    })
  } catch {
    throw new Error('Telegram could not be reached. Check your internet connection and try again.')
  }
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null
  if (response.status === 401 || response.status === 404) throw new Error('Telegram rejected this bot token. Copy it again from @BotFather.')
  if (!data?.ok) throw new Error(`Telegram refused the request${data?.description ? `: ${String(data.description).slice(0, 120)}` : '.'}`)
  return { result: data.result }
}

export function getNotificationSettings(): NotificationSettings {
  return view(load())
}

export function setNotificationSwitches(update: unknown): NotificationSettings {
  const value = (update && typeof update === 'object' ? update : {}) as { windows?: unknown; telegramEnabled?: unknown }
  const stored = load()
  if (typeof value.windows === 'boolean') stored.windows = value.windows
  if (typeof value.telegramEnabled === 'boolean') {
    if (value.telegramEnabled && (!stored.token || !stored.chatId)) throw new Error('Connect a bot and find your chat first.')
    stored.telegramEnabled = value.telegramEnabled
  }
  save(stored)
  return view(stored)
}

/** Check the token with getMe, then keep it encrypted. Finding the chat comes next. */
export async function connectTelegramBot(rawToken: unknown): Promise<NotificationSettings> {
  const key = typeof rawToken === 'string' ? rawToken.trim() : ''
  if (!TOKEN.test(key)) throw new Error('That does not look like a bot token. It looks like 123456789:AAE… and comes from @BotFather.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable, so the bot token cannot be saved.')
  const { result } = await telegram(key, 'getMe')
  const username = (result as { username?: unknown })?.username
  const stored = load()
  stored.token = safeStorage.encryptString(key).toString('base64')
  stored.botName = typeof username === 'string' ? username.slice(0, 64) : ''
  stored.chatId = ''
  stored.chatName = ''
  stored.telegramEnabled = false
  save(stored)
  return view(stored)
}

/** The most recent private chat that messaged the bot (the user sends it any message first). */
export async function findTelegramChat(): Promise<NotificationSettings> {
  const stored = load()
  const key = token(stored)
  if (!key) throw new Error('Connect a bot first.')
  const { result } = await telegram(key, 'getUpdates', { allowed_updates: ['message'], timeout: 0 })
  const updates = Array.isArray(result) ? result as { message?: { chat?: { id?: unknown; type?: unknown; first_name?: unknown; username?: unknown } } }[] : []
  const chat = [...updates].reverse().map((update) => update.message?.chat).find((item) => item?.type === 'private' && typeof item.id === 'number')
  if (!chat) throw new Error(`No message found. Open @${stored.botName || 'your bot'} in Telegram, press Start or send any message, then try again.`)
  stored.chatId = String(chat.id)
  stored.chatName = typeof chat.first_name === 'string' ? chat.first_name.slice(0, 64) : typeof chat.username === 'string' ? `@${chat.username.slice(0, 64)}` : 'your chat'
  stored.telegramEnabled = true
  save(stored)
  await telegram(key, 'sendMessage', { chat_id: chat.id, text: '✅ MerveilleClip is connected. You will get a message here when a generation finishes.' })
  return view(stored)
}

export function disconnectTelegram(): NotificationSettings {
  const stored = load()
  save({ ...stored, telegramEnabled: false, token: '', botName: '', chatId: '', chatName: '' })
  return view(load())
}

export function showWindowsNotification(title: string, body: string, onClick?: () => void): void {
  if (!load().windows || !Notification.isSupported()) return
  try {
    const notification = new Notification({ title, body, silent: false })
    if (onClick) notification.on('click', onClick)
    notification.show()
  } catch (error) {
    logger.warn('notify.windows_failed', { error: String(error).slice(0, 200) })
  }
}

/** Send to the connected chat when Telegram alerts are on. Never throws. */
export async function sendTelegramNotification(text: string): Promise<void> {
  const stored = load()
  if (!stored.telegramEnabled || !stored.chatId) return
  const key = token(stored)
  if (!key) return
  try { await telegram(key, 'sendMessage', { chat_id: Number(stored.chatId), text: text.slice(0, 3500) }) }
  catch (error) { logger.warn('notify.telegram_failed', { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }) }
}

export async function testNotifications(): Promise<{ windows: boolean; telegram: boolean }> {
  const stored = load()
  showWindowsNotification('MerveilleClip', 'Test: this is how a finished generation will look.')
  let sent = false
  if (stored.telegramEnabled && stored.chatId && token(stored)) {
    await telegram(token(stored), 'sendMessage', { chat_id: Number(stored.chatId), text: '🔔 MerveilleClip test: notifications work.' })
    sent = true
  }
  return { windows: stored.windows, telegram: sent }
}
