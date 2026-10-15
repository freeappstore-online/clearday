import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import Counters from './Counters'

const fas = initApp({ appId: 'clearday' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Counters', href: '/', title: 'ClearDay' },
  { label: 'About', href: '/about', title: 'About — ClearDay' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  return (
    <Shell app={fas} appName="ClearDay" nav={NAV} onNavigate={navigate}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">{path === '/about' ? <About /> : <Counters />}</div>
      <BuildInfo />
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
        year and beyond. Everything stays on your device, with no account and no ads.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        Still to come: money and time saved, fresh starts that keep your history, and a short
        journal.
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
