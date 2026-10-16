/**
 * Fork: per-automation text rules. A template turns each clip's original title
 * into the posted title and caption, so hashtags, emoji and length limits are
 * set once per automation instead of by hand (or by an external script).
 */
import { isStackStyle, isTitleStyle, type StackStyle, type TitleStyle } from './fork-layout'

/** 'ai': a model decides per clip whether one emoji fits, and it goes at the end. */
export type EmojiPlacement = 'none' | 'start' | 'end' | 'ai'
export const EMOJI_PLACEMENTS: readonly EmojiPlacement[] = ['none', 'start', 'end', 'ai']

export interface TextTemplate {
  /** Posted title. Tokens: {title} the clip's original title, {n} its queue position. */
  titleTemplate: string
  /** Post caption. Tokens: {title} the finished title, {emoji}, {n}. */
  captionTemplate: string
  /** Emoji to choose from; each clip always gets the same one. */
  emojis: string[]
  emojiPlacement: EmojiPlacement
  /** 0 = no limit. Counted in characters as people see them. */
  minChars: number
  maxChars: number
  /** Apply to clips as they are added to the bank. */
  autoApply: boolean
  /** Render look for jobs made for this automation. */
  titleStyle: TitleStyle
  stackStyle: StackStyle | null
}

export const MAX_TEMPLATE_CHARS = 2200
export const MAX_TEMPLATE_EMOJIS = 24

export const DEFAULT_TEXT_TEMPLATE: TextTemplate = {
  titleTemplate: '{title}',
  captionTemplate: '{title}',
  emojis: [],
  emojiPlacement: 'none',
  minChars: 0,
  maxChars: 0,
  autoApply: false,
  titleStyle: 'box',
  stackStyle: null
}

export function isTextTemplate(value: unknown): value is TextTemplate {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const text = (s: unknown): boolean => typeof s === 'string' && s.length <= MAX_TEMPLATE_CHARS && !s.includes('\0')
  const count = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 500
  return text(v.titleTemplate) && text(v.captionTemplate) &&
    Array.isArray(v.emojis) && v.emojis.length <= MAX_TEMPLATE_EMOJIS && v.emojis.every((e) => typeof e === 'string' && e.length > 0 && e.length <= 16) &&
    EMOJI_PLACEMENTS.includes(v.emojiPlacement as EmojiPlacement) && count(v.minChars) && count(v.maxChars) &&
    (v.maxChars === 0 || (v.maxChars as number) >= (v.minChars as number)) &&
    typeof v.autoApply === 'boolean' && isTitleStyle(v.titleStyle) && (v.stackStyle === null || isStackStyle(v.stackStyle))
}

/** Characters as a person counts them (an emoji is one). */
export function visibleLength(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length
}

function pickEmoji(emojis: readonly string[], base: string): string {
  if (!emojis.length) return ''
  let hash = 0
  for (const char of base) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return emojis[hash % emojis.length]
}

/** Shorten at a word boundary so `text` fits in `room` visible characters. */
function shorten(text: string, room: number): string {
  if (room <= 0) return ''
  if (visibleLength(text) <= room) return text
  const words = text.split(/\s+/)
  let out = ''
  for (const word of words) {
    const next = out ? `${out} ${word}` : word
    if (visibleLength(next) > room) break
    out = next
  }
  return out || [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].slice(0, room).map((s) => s.segment).join('')
}

export interface TemplateResult {
  title: string
  caption: string
  /** Shown next to the clip; the template still applies. */
  note: string | null
}

/** `aiEmoji` is the model's choice for this clip in 'ai' mode ('' or undefined = none). */
export function applyTextTemplate(template: TextTemplate, base: string, n: number, aiEmoji?: string): TemplateResult {
  const clean = base.replace(/\s+/g, ' ').trim()
  const emoji = template.emojiPlacement === 'none' ? '' : template.emojiPlacement === 'ai' ? (aiEmoji ?? '') : pickEmoji(template.emojis, clean)
  const fill = (pattern: string, title: string): string => pattern.replaceAll('{title}', title).replaceAll('{emoji}', emoji).replaceAll('{n}', String(n))
  const decorate = (core: string): string => {
    const text = fill(template.titleTemplate, core).replace(/\s+/g, ' ').trim()
    if (!emoji) return text
    return template.emojiPlacement === 'start' ? `${emoji} ${text}` : `${text} ${emoji}`
  }
  let title = decorate(clean)
  let note: string | null = null
  if (template.maxChars && visibleLength(title) > template.maxChars) {
    const extra = visibleLength(title) - visibleLength(clean)
    title = decorate(shorten(clean, template.maxChars - extra))
    note = `Shortened to ${template.maxChars} characters`
  }
  if (template.minChars && visibleLength(title) < template.minChars) note = `Shorter than ${template.minChars} characters`
  const caption = fill(template.captionTemplate, title).trim()
  return { title: title.slice(0, 500), caption, note }
}
