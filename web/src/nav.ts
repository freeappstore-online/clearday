/**
 * Go to a screen from a link inside the app. Goes through history + popstate
 * so App and the Shell's nav highlight follow along, just like the back button.
 */
export function goTo(href: string) {
  window.history.pushState(null, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
