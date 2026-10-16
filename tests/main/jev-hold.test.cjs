'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadMain } = require('../zernio/support/load-main.cjs')

const output = () => loadMain("export * from './src/shared/job-output'")
const clip = (extra) => ({ clip_index: 0, s3_url: 'file:///run/clip_00.mp4', duration_ms: 1000, start_time_ms: 0, end_time_ms: 1000, virality_score: 0.5, ...extra })

test('a clip Jev held back keeps known reason codes; anything else reads as not approved', () => {
  const { parseJobOutput } = output()
  const held = parseJobOutput({ clips: [clip({ jev_hold: { reasons: ['complete_ending', 'title_supported', 'Bad Code!', 7] } })] })
  assert.deepEqual(held.clips[0].jev_hold, { reasons: ['complete_ending', 'title_supported'] })
  assert.deepEqual(parseJobOutput({ clips: [clip({ jev_hold: { reasons: [] } })] }).clips[0].jev_hold, { reasons: ['not_approved'] })
  assert.equal(parseJobOutput({ clips: [clip({ jev_hold: null })] }).clips[0].jev_hold, null)
  assert.equal(parseJobOutput({ clips: [clip()] }).clips[0].jev_hold, null)
})
