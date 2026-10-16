'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadMain } = require('../zernio/support/load-main.cjs')

const layout = () => loadMain("export * from './src/shared/fork-layout'")

test('stack styles are validated and presets round-trip', () => {
  const { isStackStyle, presetFor, STACK_PRESETS, engineStackStyle, isTitleStyle } = layout()
  for (const preset of STACK_PRESETS) {
    assert.equal(presetFor(preset.style), preset.id)
    if (preset.style) assert.equal(isStackStyle(preset.style), true)
  }
  const more = STACK_PRESETS.find((preset) => preset.id === 'more').style
  assert.equal(presetFor({ ...more, screenRatio: 0.7 }), null)
  for (const bad of [null, {}, { ...more, screenRatio: 0.9 }, { ...more, camPosition: 'left' }, { ...more, screenFit: 'huge' }, { ...more, camZoom: 'eyes' }, { ...more, screenRatio: Number.NaN }]) {
    assert.equal(isStackStyle(bad), false)
  }
  assert.deepEqual(engineStackStyle(more), { screen_ratio: 0.72, cam_position: 'bottom', screen_fit: 'wide', cam_zoom: 'whole' })
  assert.equal(isTitleStyle('outline'), true)
  assert.equal(isTitleStyle('neon'), false)
})
