import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MilestoneCelebration from './MilestoneCelebration'
import { MILESTONES } from './milestones'

// Tests run without a DOM; give the component a window whose matchMedia
// answers the reduced-motion query as asked.
function mockReducedMotion(reduce: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  vi.stubGlobal('window', { matchMedia })
  return matchMedia
}

const render = () =>
  renderToStaticMarkup(<MilestoneCelebration milestone={MILESTONES[2]} counterName="Smoking" onDismiss={() => {}} />)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MilestoneCelebration', () => {
  it('plays confetti when motion is allowed', () => {
    const matchMedia = mockReducedMotion(false)
    const html = render()
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(html).toContain('data-testid="confetti"')
    expect(html).toContain('data-motion="confetti"')
    expect(html).not.toContain('celebration-badge')
  })

  it('shows a static badge instead of confetti with prefers-reduced-motion', () => {
    mockReducedMotion(true)
    const html = render()
    expect(html).not.toContain('data-testid="confetti"')
    expect(html).not.toContain('confetti-fall')
    expect(html).toContain('data-motion="static"')
    expect(html).toContain('celebration-badge')
  })

  it('shows the congratulatory message naming the milestone either way', () => {
    for (const reduce of [false, true]) {
      mockReducedMotion(reduce)
      const html = render()
      expect(html).toContain('role="status"')
      expect(html).toContain('You&#x27;ve reached 1 week!')
      expect(html).toContain('Smoking')
    }
  })

  it('assumes motion is allowed when matchMedia is unavailable', () => {
    vi.stubGlobal('window', {})
    expect(render()).toContain('data-motion="confetti"')
  })
})
