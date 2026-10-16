'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadMain } = require('../zernio/support/load-main.cjs')

const shared = () => loadMain("export * from './src/shared/automations'")
const queued = (id) => ({ id, status: 'queued' })
const posted = { id: 'posted', status: 'posted', postId: 'p' }
const held = { id: 'held', status: 'needs_review' }

test('setQueuedOrder reorders queued slots only and rejects a stale order', () => {
  const { setQueuedOrder } = shared()
  const content = [queued('a'), posted, queued('b'), held, queued('c')]
  assert.deepEqual(setQueuedOrder(content, ['c', 'a', 'b']).map((item) => item.id), ['c', 'posted', 'a', 'held', 'b'])
  for (const order of [['a', 'b'], ['a', 'b', 'c', 'c'], ['a', 'b', 'posted'], ['a', 'a', 'b']]) {
    assert.throws(() => setQueuedOrder(content, order), /queue changed/)
  }
})

test('movedQueueOrder moves picked clips together and keeps their relative order', () => {
  const { movedQueueOrder } = shared()
  const content = ['a', 'b', 'c', 'd', 'e'].map(queued)
  assert.deepEqual(movedQueueOrder(content, ['d', 'b'], 'top'), ['b', 'd', 'a', 'c', 'e'])
  assert.deepEqual(movedQueueOrder(content, ['b', 'd'], 'bottom'), ['a', 'c', 'e', 'b', 'd'])
  assert.deepEqual(movedQueueOrder(content, ['b', 'd'], 'up'), ['b', 'a', 'd', 'c', 'e'])
  assert.deepEqual(movedQueueOrder(content, ['b', 'd'], 'down'), ['a', 'c', 'b', 'e', 'd'])
  // Already at the edge: nothing moves past it, and neighbours never swap with each other.
  assert.deepEqual(movedQueueOrder(content, ['a', 'b'], 'up'), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(movedQueueOrder(content, ['e'], 'down'), ['a', 'b', 'c', 'd', 'e'])
})

test('timelineQueueOrder groups by source in first-seen order and sorts by start time', () => {
  const { timelineQueueOrder } = shared()
  const content = [queued('x2'), queued('lost'), queued('y1'), posted, queued('x1'), queued('y0')]
  const at = { x2: ['X', 50], x1: ['X', 10], y1: ['Y', 30], y0: ['Y', 5] }
  const order = timelineQueueOrder(content, (item) => at[item.id] ? { source: at[item.id][0], startMs: at[item.id][1] } : null)
  assert.deepEqual(order, ['x1', 'x2', 'y0', 'y1', 'lost'])
})

test('groupMovedBefore drops a dragged picked group before a clip, keeping its order', () => {
  const { groupMovedBefore } = shared()
  const content = [queued('a'), queued('b'), posted, queued('c'), queued('d'), queued('e')]
  assert.deepEqual(groupMovedBefore(content, ['d', 'b'], 'a'), ['b', 'd', 'a', 'c', 'e'])
  assert.deepEqual(groupMovedBefore(content, ['a', 'c'], null), ['b', 'd', 'e', 'a', 'c'])
  assert.deepEqual(groupMovedBefore(content, ['a', 'd'], 'e'), ['b', 'c', 'a', 'd', 'e'])
  // Dropped on its own member: lands before the next unpicked clip.
  assert.deepEqual(groupMovedBefore(content, ['b', 'c'], 'c'), ['a', 'b', 'c', 'd', 'e'])
})
