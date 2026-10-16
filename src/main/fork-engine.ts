import { engineStackStyle } from '../shared/fork-layout'
import { automationSfxConfig } from './automations'
import type { ClipJobConfig } from './pipeline-runner'

/**
 * Fork: engine options for the fork's features (screen + camera layout, title
 * look, sound effects), resolved in main after validation and passed to the
 * worker as-is. Never accepted from the renderer.
 */
export function forkEngineConfig(config: ClipJobConfig): Record<string, unknown> {
  const sfx = config.automationId && config.workflow !== 'review' ? automationSfxConfig(config.automationId) : null
  return {
    ...(config.stackStyle ? { stack_style: engineStackStyle(config.stackStyle) } : {}),
    title_style: config.titleStyle ?? 'box',
    ...(sfx ? { sfx } : {})
  }
}
