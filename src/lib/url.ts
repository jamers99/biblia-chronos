// Links respect the site's base path (/biblia-chronos on GitHub Pages).
const base = import.meta.env.BASE_URL.replace(/\/$/, "")

export const url = (path: string) => `${base}${path}`

const SECTION = { person: "people", place: "places", event: "events", peopleGroup: "groups" } as const

export const entityUrl = (e: { kind: keyof typeof SECTION; id: string }) =>
  url(`/${SECTION[e.kind]}/${e.id}/`)

// The path of a link to a person, place, event, or group page on this site, or
// undefined for any other link. (Those links open as panels; see Layers.astro.)
const ENTITY = new RegExp(`^${base}/(${Object.values(SECTION).join("|")})/[^/]+/$`)
export function entityPath(href: string): string | undefined {
  const { origin, pathname } = new URL(href, location.href)
  return origin === location.origin && ENTITY.test(pathname) ? pathname : undefined
}

// Put a selection in the URL hash without a history entry. Keeps the history
// state, which holds the open panels.
export const setHash = (hash: string) =>
  history.replaceState(history.state, "", hash ? `#${hash}` : location.pathname + location.search)
