import type { ZernioPlatform } from './zernio'
import type { ClipMediaInfo, TikTokCreatorInfo, TikTokPostOptions, YouTubeVisibility } from './zernio-posts'
import type { TextTemplate } from './fork-text-template'

/** TikTok clips require review before the scheduler can publish them. */
export const AUTOMATION_PLATFORMS = ['instagram', 'youtube', 'twitter', 'facebook', 'linkedin', 'threads', 'tiktok'] as const satisfies readonly ZernioPlatform[]

export interface AutomationTikTokApproval {
  caption: string
  options: TikTokPostOptions
  reviewedAt: string
  fileStamp: { size: number; mtimeMs: number; ino: number }
}

export interface AutomationTikTokReview {
  reviewId: string
  clipPath: string
  caption: string
  media: ClipMediaInfo
  creators: { info: TikTokCreatorInfo; businessConnection: boolean; handle: string }[]
}

export interface AutomationTikTokReviewUpdate {
  reviewId: string
  caption: string
  options: TikTokPostOptions
  previewConfirmed: boolean
}

export interface AutomationAccount {
  accountId: string
  platform: (typeof AUTOMATION_PLATFORMS)[number]
}

export type AutomationContentStatus = 'queued' | 'posting' | 'posted' | 'needs_review'

export interface GeneratedPlatformMetadata {
  platform: AutomationAccount['platform']
  caption: string
  /** YouTube, or Facebook when the clip is posted as a Reel. */
  title: string | null
  tags: string[]
  categoryId: string | null
  /** Threads only. Optional so older saved metadata remains readable. */
  topicTag?: string | null
}

export interface AutomationSourceContext {
  /** Opaque library identity for non-YouTube sources. */
  videoId?: string
  title: string
  description: string
  channel: string
  /** Canonical YouTube URL only; local paths and signed source URLs are never sent. */
  url: string | null
}

export interface MetadataResearch {
  scope?: 'source'
  reused?: boolean
  researchedAt?: string
  status: 'complete' | 'unavailable' | 'skipped'
  summary: string
  sources: { title: string; url: string }[]
}

export const MAX_ENHANCEMENT_GUIDANCE = 2000
/** Longest stored research citation URL, measured after URL normalization. */
export const MAX_RESEARCH_URL = 2048

export interface MetadataEnhancement {
  /** User context and editorial direction used to prepare this draft. */
  guidance?: string
  id: string
  createdAt: string
  platforms: AutomationAccount['platform'][]
  posts: GeneratedPlatformMetadata[]
  source: AutomationSourceContext | null
  research: MetadataResearch
}

export interface AutomationContent {
  /** Suppresses existing warning indicators without changing posting eligibility. */
  warningsAcknowledged?: boolean
  /** Dismisses only the current metadata failure; a new failure resets this. */
  metadataErrorAcknowledged?: boolean
  id: string
  /** Original authorized file, retained when a library clip is copied to the bank. */
  sourceClipPath?: string
  /** Changes only after a person reviews an uncertain post and returns the clip to the queue. */
  postingAttemptId?: string
  fileName: string
  title: string
  caption: string
  /** Speech recognized from this exact bank clip; never inferred from its filename. */
  transcript: string | null
  generatedMetadata: GeneratedPlatformMetadata[] | null
  metadataError?: string | null
  sourceContext?: AutomationSourceContext | null
  /** A pending draft holds this clip from posting until applied or discarded. */
  metadataDraft?: MetadataEnhancement | null
  metadataEnhancement?: MetadataEnhancement | null
  /** The exact TikTok caption and choices approved for this clip; absent in older banks. */
  tiktokApproval?: AutomationTikTokApproval | null
  /** Keeps the last reviewed copy when approval is revoked to reopen the editor. */
  tiktokDraftCaption?: string | null
  /** Fork: the clip's title before a text template first changed it ({title} in templates). */
  templateBase?: string
  status: AutomationContentStatus
  addedAt: string
  postedAt: string | null
  postId: string | null
  error: string | null
}

export interface AutomationSourceGroup {
  sourceType: 'linked' | 'file'
  key: string
  title: string
  contentIds: string[]
}

export interface AutomationBatchResult {
  automations: Automation[]
  completed: number
  skipped: number
  errors: { contentId: string; message: string }[]
}

export interface AutomationReviewResult {
  automations: Automation[]
  outcome: 'queued' | 'submitted' | 'held'
  message: string
}

export interface Automation {
  sourceResearch?: { key: string; createdAt: string; source: AutomationSourceContext; research: MetadataResearch }[]
  id: string
  name: string
  enabled: boolean
  /** Exactly one Zernio profile owns this automation's selected accounts. */
  profileId: string | null
  /** Automations start with manual captions; AI metadata is opt-in. */
  metadataMode: 'ai' | 'manual'
  accounts: AutomationAccount[]
  /** Daily times in the configured IANA time zone, as HH:mm. */
  times: string[]
  timezone: string
  youtubeVisibility: YouTubeVisibility
  youtubeMadeForKids: boolean
  /** Time -> most recent local YYYY-MM-DD that was attempted. */
  lastSlots: Record<string, string>
  content: AutomationContent[]
  createdAt: string
  lastRunAt: string | null
  lastError: string | null
  lastErrorAcknowledged?: boolean
  /** Fork: title/caption rules and render look for this automation. */
  textTemplate?: TextTemplate | null
  /** Fork: sound-effect library used when rendering jobs made for this automation. */
  sounds?: AutomationSound[]
  soundSettings?: AutomationSoundSettings
}

export const SOUND_KINDS = ['reaction', 'impact', 'transition', 'other'] as const
export type SoundKind = (typeof SOUND_KINDS)[number]
export const SOUND_INTENSITIES = ['subtle', 'normal', 'wild'] as const
export type SoundIntensity = (typeof SOUND_INTENSITIES)[number]

export interface AutomationSound {
  id: string
  name: string
  /** Stored as `${id}${ext}` in this automation's sound folder. */
  fileName: string
  kind: SoundKind
  /** 0-1.5; 1 is the file's own loudness. */
  volume: number
  enabled: boolean
}

export interface AutomationSoundSettings {
  /** Let AI place the enabled sounds before rendering. */
  aiPlace: boolean
  intensity: SoundIntensity
  /** Put sounds in pauses only, never over words. */
  keepSpeechClear: boolean
}

export const DEFAULT_SOUND_SETTINGS: AutomationSoundSettings = { aiPlace: true, intensity: 'normal', keepSpeechClear: true }

/** Fork: best guess at a sound's role from its name; the user can change it. */
export function guessSoundKind(name: string): SoundKind {
  const n = name.toLowerCase()
  if (/boom|explo|bang|punch|hit|slam|thud|bonk/.test(n)) return 'impact'
  if (/whoosh|swoosh|swipe|scratch|transition|rewind/.test(n)) return 'transition'
  if (/fa+h|bruh|wow|laugh|oof|huh|what|omg|scream|sad|violin|cry|ding|airhorn/.test(n)) return 'reaction'
  return 'other'
}

export function hasContentWarnings(item: AutomationContent): boolean {
  return !item.warningsAcknowledged && Boolean(item.error || (item.metadataError && !item.metadataErrorAcknowledged) || item.status === 'needs_review')
}

export function hasAutomationWarnings(automation: Automation): boolean {
  return Boolean(automation.lastError && !automation.lastErrorAcknowledged) || automation.content.some(hasContentWarnings)
}

export interface AutomationUpdate {
  name: string
  enabled: boolean
  profileId: string | null
  metadataMode: 'ai' | 'manual'
  accounts: AutomationAccount[]
  times: string[]
  timezone: string
  youtubeVisibility: YouTubeVisibility
  youtubeMadeForKids: boolean
}

export function needsTikTokReview(automation: Pick<Automation, 'accounts'>, item: AutomationContent): boolean {
  const targets = automation.accounts.filter((account) => account.platform === 'tiktok')
  return targets.length > 0 && (!item.tiktokApproval?.options.consent ||
    targets.some((target) => !item.tiktokApproval?.options.accounts[target.accountId]?.privacyLevel))
}

export function nextAutomationContent(automation: Pick<Automation, 'accounts' | 'content'>): AutomationContent | undefined {
  // A pending enhanced draft holds only its own clip until it is applied or discarded.
  const ready = automation.content.filter((item) => item.status === 'queued' && !item.metadataDraft && !needsTikTokReview(automation, item))
  // A clip whose last attempt failed waits behind clips that have not, so one
  // clip that cannot be prepared (for example, unverifiable AI metadata) does
  // not stop every later slot. It is retried once nothing else is ready.
  return ready.find((item) => !item.error) ?? ready[0]
}

export function canReorderContent(item: AutomationContent): boolean {
  return item.status === 'queued' && !item.postId
}

export function hasEnhancedMetadata(item: AutomationContent, platforms: readonly AutomationAccount['platform'][]): boolean {
  return Boolean(item.metadataEnhancement && platforms.every((platform) => item.generatedMetadata?.some((post) => post.platform === platform)))
}

/** Reorder only queued slots. Submitted and uncertain items retain their positions. */
export function reorderQueuedContent(content: AutomationContent[], id: string, beforeId: string | null): AutomationContent[] {
  const queue = content.filter(canReorderContent)
  const from = queue.findIndex((item) => item.id === id)
  if (from < 0 || (beforeId !== null && !queue.some((item) => item.id === beforeId))) throw new Error('Only unposted queued clips can be reordered. Refresh the queue and try again.')
  if (id === beforeId) return content
  const [item] = queue.splice(from, 1)
  queue.splice(beforeId === null ? queue.length : queue.findIndex((entry) => entry.id === beforeId), 0, item)
  let index = 0
  return content.map((entry) => canReorderContent(entry) ? queue[index++] : entry)
}

/** Fork: put the queued slots in exactly this order. Submitted and uncertain items keep their positions. */
export function setQueuedOrder(content: AutomationContent[], orderedIds: readonly string[]): AutomationContent[] {
  const queue = content.filter(canReorderContent)
  const byId = new Map(queue.map((item) => [item.id, item]))
  if (orderedIds.length !== queue.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !byId.has(id))) {
    throw new Error('The queue changed. Refresh the queue and try again.')
  }
  let index = 0
  return content.map((entry) => canReorderContent(entry) ? byId.get(orderedIds[index++])! : entry)
}

export type QueueMove = 'top' | 'up' | 'down' | 'bottom'

/** Fork: queued ids after moving the picked ones; picked clips keep their order among themselves. */
export function movedQueueOrder(content: readonly AutomationContent[], picked: readonly string[], to: QueueMove): string[] {
  const order = content.filter(canReorderContent).map((item) => item.id)
  const chosen = new Set(picked)
  if (to === 'top') return [...order.filter((id) => chosen.has(id)), ...order.filter((id) => !chosen.has(id))]
  if (to === 'bottom') return [...order.filter((id) => !chosen.has(id)), ...order.filter((id) => chosen.has(id))]
  if (to === 'up') {
    for (let i = 1; i < order.length; i++) {
      if (chosen.has(order[i]) && !chosen.has(order[i - 1])) [order[i - 1], order[i]] = [order[i], order[i - 1]]
    }
  } else {
    for (let i = order.length - 2; i >= 0; i--) {
      if (chosen.has(order[i]) && !chosen.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]]
    }
  }
  return order
}

/**
 * Fork: queued ids in source-timeline order. Clips from the same source video
 * stay together (sources keep the order they first appear in the queue) and
 * run by where they start in that video. Clips without a known position go last.
 */
export function timelineQueueOrder(content: readonly AutomationContent[], position: (item: AutomationContent) => { source: string; startMs: number } | null): string[] {
  const queue = content.filter(canReorderContent)
  const sourceRank = new Map<string, number>()
  const keyed = queue.map((item, index) => {
    const at = position(item)
    if (at && !sourceRank.has(at.source)) sourceRank.set(at.source, sourceRank.size)
    return { id: item.id, index, rank: at ? sourceRank.get(at.source)! : Infinity, startMs: at?.startMs ?? 0 }
  })
  return keyed.sort((a, b) => a.rank - b.rank || a.startMs - b.startMs || a.index - b.index).map((entry) => entry.id)
}

/** Return due local slots, including a short grace period after wake/reopen. */
export function dueSlots(times: readonly string[], timezone: string, now: number, graceMinutes = 5): { time: string; date: string }[] {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23'
  })
  const wanted = new Set(times)
  const found = new Set<string>()
  const slots: { time: string; date: string }[] = []
  for (let minutesAgo = graceMinutes - 1; minutesAgo >= 0; minutesAgo--) {
    const parts = Object.fromEntries(formatter.formatToParts(now - minutesAgo * 60_000).map((part) => [part.type, part.value]))
    const time = `${parts.hour}:${parts.minute}`
    const date = `${parts.year}-${parts.month}-${parts.day}`
    const key = `${date}/${time}`
    if (wanted.has(time) && !found.has(key)) { found.add(key); slots.push({ time, date }) }
  }
  return slots
}
