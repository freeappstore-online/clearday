import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import Counters from './Counters'
import LockScreen from './LockScreen'
import { goTo } from './nav'
import Privacy from './Privacy'
import { hasPin } from './pin'

const fas = initApp({ appId: 'clearday' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Counters', href: '/', title: 'ClearDay' },
  { label: 'Privacy', href: '/privacy', title: 'Privacy — ClearDay' },
  { label: 'About', href: '/about', title: 'About — ClearDay' },
]

/** How long ClearDay can sit in the background before the PIN is asked for again. */
const RELOCK_AFTER_MS = 60_000

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)
  const [locked, setLocked] = useState(() => hasPin())

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Lock again after a minute in the background, if a PIN is set.
  useEffect(() => {
    let hiddenAt = 0
    const onChange = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER_MS && hasPin()) setLocked(true)
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  return (
    <Shell app={fas} appName="ClearDay" nav={NAV} onNavigate={navigate}>
      {/* Each screen scrolls inside the app frame; the page itself never does. */}
      <div className="cd-page">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
          {locked ? (
            <LockScreen onUnlock={() => setLocked(false)} onErased={() => setLocked(false)} />
          ) : path === '/about' ? (
            <About />
          ) : path === '/privacy' ? (
            <Privacy />
          ) : (
            <Counters />
          )}
        </div>
        <BuildInfo />
      </div>
    </Shell>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <p className="text-[var(--muted)]">
        ClearDay is a calm, private counter for the habits you have quit: alcohol, smoking, vaping,
        sugar or anything else. It counts your clear days and marks milestones from one day to one
        year and beyond, with an optional tally of money and time saved. Everything stays on your
        device, with no account and no ads.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        If you slip, ClearDay starts a fresh run and keeps your history, longest streak and
        journal. You can lock it with a PIN and keep a backup file; see{' '}
        <a
          href="/privacy"
          className="underline"
          onClick={(e) => {
            e.preventDefault()
            goTo('/privacy')
          }}
        >
          Privacy
        </a>
        .
      </p>
      <p className="mt-4 text-[var(--muted)]">
        ClearDay is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        .
      </p>
    </>
  )
}
