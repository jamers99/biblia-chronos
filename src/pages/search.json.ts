// The site search index, one small file fetched the first time someone
// searches (see SiteSearch.astro) and cached for offline use (public/sw.js).
import { people, places, events, peopleGroups, periods, eventsOf } from "../lib/data/load.ts"
import { searchIndex } from "../lib/search.ts"

export const GET = () =>
  Response.json(searchIndex({ people, places, events, groups: peopleGroups, periods }, eventsOf))
