'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadMain } = require('../zernio/support/load-main.cjs')

const tpl = () => loadMain("export * from './src/shared/fork-text-template'")

test('templates fill title and caption, with a stable emoji from the list', () => {
  const { applyTextTemplate, DEFAULT_TEXT_TEMPLATE } = tpl()
  const template = { ...DEFAULT_TEXT_TEMPLATE, emojis: ['💀', '😭', '🔥'], emojiPlacement: 'end', captionTemplate: '{title}\n\n#ohne #shorts' }
  const first = applyTextTemplate(template, 'He Spent 40K On One Knife', 1)
  const again = applyTextTemplate(template, 'He Spent 40K On One Knife', 7)
  assert.match(first.title, /^He Spent 40K On One Knife (💀|😭|🔥)$/)
  assert.equal(again.title, first.title)
  assert.equal(first.caption, `${first.title}\n\n#ohne #shorts`)
  assert.equal(applyTextTemplate({ ...template, emojiPlacement: 'start' }, 'Knife', 1).title.endsWith('Knife'), true)
  assert.equal(applyTextTemplate({ ...template, emojiPlacement: 'none' }, 'Knife', 1).title, 'Knife')
  assert.equal(applyTextTemplate({ ...template, titleTemplate: '#{n} {title}', emojiPlacement: 'none' }, 'Knife', 3).title, '#3 Knife')
})

test('max characters shortens at a word boundary, emoji included; min only warns', () => {
  const { applyTextTemplate, DEFAULT_TEXT_TEMPLATE, visibleLength } = tpl()
  const template = { ...DEFAULT_TEXT_TEMPLATE, emojis: ['🔥'], emojiPlacement: 'end', maxChars: 30, minChars: 12 }
  const long = applyTextTemplate(template, 'Chat Exposes Self Sent Fan Mail And Ohne Loses It Completely', 1)
  assert.ok(visibleLength(long.title) <= 30)
  assert.ok(long.title.endsWith(' 🔥'))
  assert.match(long.note, /Shortened/)
  assert.equal(long.title.replace(' 🔥', '').split(' ').every((word) => 'Chat Exposes Self Sent Fan Mail And Ohne Loses It Completely'.split(' ').includes(word)), true)
  assert.match(applyTextTemplate(template, 'Wow', 1).note, /Shorter than 12/)
})

test('isTextTemplate rejects broken limits and oversized lists', () => {
  const { isTextTemplate, DEFAULT_TEXT_TEMPLATE } = tpl()
  assert.equal(isTextTemplate(DEFAULT_TEXT_TEMPLATE), true)
  for (const bad of [{ minChars: 20, maxChars: 10 }, { maxChars: -1 }, { emojis: Array(30).fill('x') }, { emojiPlacement: 'middle' }, { titleStyle: 'neon' }, { captionTemplate: 'a\0b' }]) {
    assert.equal(isTextTemplate({ ...DEFAULT_TEXT_TEMPLATE, ...bad }), false, JSON.stringify(bad))
  }
})

test("'AI picks' puts the model's emoji at the end, and none when it chose none", () => {
  const { applyTextTemplate, DEFAULT_TEXT_TEMPLATE, isTextTemplate } = tpl()
  const template = { ...DEFAULT_TEXT_TEMPLATE, emojis: ['💀', '🥀'], emojiPlacement: 'ai' }
  assert.equal(isTextTemplate(template), true)
  assert.equal(applyTextTemplate(template, 'He Lost The Whole Inventory', 1, '🥀').title, 'He Lost The Whole Inventory 🥀')
  assert.equal(applyTextTemplate(template, 'Patch Notes Explained', 1, '').title, 'Patch Notes Explained')
  assert.equal(applyTextTemplate(template, 'Not Judged Yet', 1).title, 'Not Judged Yet')
})
