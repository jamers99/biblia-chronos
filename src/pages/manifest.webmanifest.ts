// The web app manifest, so the site can be installed as an app. Generated so
// its paths follow the site's base path.
import { url } from "../lib/url.ts"

const start = url("/")

export const GET = () =>
  Response.json({
    name: "Biblia Chronos",
    short_name: "Chronos",
    description: "Explore the story of Scripture, from Creation to the early church, on an interactive timeline.",
    id: start,
    start_url: `${start}?app`, // so the app can reopen on the last view (see Page.astro)
    scope: start,
    display: "standalone",
    background_color: "#f7f3ea",
    theme_color: "#f7f3ea",
    categories: ["education", "books", "reference"],
    icons: [
      { src: url("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: url("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: url("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: url("/icons/icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  })
