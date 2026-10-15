import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'clearday' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Counters', href: '/', title: 'ClearDay' },
  { label: 'About', href: '/about', title: 'About — ClearDay' },
]

// The features planned for v1 (freeappstore-online/platform#195).
const FEATURES = [
  { name: 'Counters', what: 'Time since you quit, for one habit or several, with the next milestone.' },
  { name: 'Money & time saved', what: 'An optional running total of what you have reclaimed.' },
  { name: 'Milestones', what: 'A gentle celebration at one day, one week, one month and beyond.' },
  { name: 'Fresh starts', what: 'Begin again without losing your history or your longest streak.' },
  { name: 'Journal', what: 'A one-line daily note, and your reasons for quitting close at hand.' },
  { name: 'Private', what: 'Everything stays on your device. No account, optional PIN lock.' },
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

function Counters() {
  return (
    <>
      <PageHeader title="Counters" description="Every clear day counts." />
      <ComingSoon />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
    </>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <ComingSoon />
      <p className="mt-4 text-[var(--muted)]">
        ClearDay will be a calm, private counter for the habits you have quit: alcohol, smoking,
        vaping, sugar or anything else. It will count your clear days, mark milestones and keep your
        history safe if you need a fresh start. Everything will stay on your device, with no account
        and no ads.
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

// Placeholder until the features are built. None of them work yet, so it says so plainly.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Coming soon. ClearDay is in development; the features below aren't available yet.
    </p>
  )
}
