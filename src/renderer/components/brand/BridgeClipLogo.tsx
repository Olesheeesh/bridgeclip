import iconUrl from '../../../../resources/merveilleclip-icon-256.png'
import markUrl from '../../../../resources/merveilleclip-icon-64.png'
import { APP_NAME } from '../../config/brand'
import { cn } from '../../lib/utils'

interface BridgeClipLogoProps {
  /**
   * lockup: app mark + "MerveilleClip" wordmark, in the theme's ink.
   * icon:   the app icon tile at full detail.
   * mark:   the small mark alone, for tight spaces such as the collapsed sidebar.
   */
  variant?: 'lockup' | 'icon' | 'mark'
  /** Size by height (e.g. "h-6"); width follows the artwork. */
  className?: string
  alt?: string
}

/**
 * MerveilleClip brand artwork (fork). The tiles are cut from the source logo
 * with rounded transparent corners; the wordmark is live text so it follows
 * the theme's ink and display face.
 */
export function BridgeClipLogo({ variant = 'lockup', className, alt = APP_NAME }: BridgeClipLogoProps): React.JSX.Element {
  const image = (src: string, imageClass?: string, imageAlt = alt): React.JSX.Element => (
    <img src={src} alt={imageAlt} draggable={false} className={cn('aspect-square w-auto shrink-0 select-none', imageClass)} />
  )
  if (variant === 'icon') return image(iconUrl, className)
  if (variant === 'mark') return image(markUrl, className)
  return (
    <span className={cn('inline-flex shrink-0 select-none items-center gap-2', className)}>
      {image(markUrl, 'h-full', '')}
      <span className="text-[15px] font-bold leading-none tracking-[-0.01em] text-ink" style={{ fontFamily: 'var(--font-display), var(--font-ui), sans-serif' }}>
        {alt}
      </span>
    </span>
  )
}
