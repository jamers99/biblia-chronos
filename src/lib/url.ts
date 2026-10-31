// Links respect the site's base path (/biblia-chronos on GitHub Pages).
const base = import.meta.env.BASE_URL.replace(/\/$/, "")

export const url = (path: string) => `${base}${path}`

const SECTION = { person: "people", place: "places", event: "events", peopleGroup: "groups" } as const

export const entityUrl = (e: { kind: keyof typeof SECTION; id: string }) =>
  url(`/${SECTION[e.kind]}/${e.id}/`)
