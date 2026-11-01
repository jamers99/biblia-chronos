// Offline support, so the installed app opens without a connection.
// - Pages: network first, falling back to the cache. Online you always get
//   the latest; offline, anything you've visited still opens.
// - Hashed build assets (/_astro/…) never change: cache first.
// - Everything else (basemap, icons, manifest): serve from cache, refresh in
//   the background.
// Paths are relative to this file, so they follow the site's base path.
const CACHE = "chronos-v1"
const SHELL = ["./", "map/", "map/basemap.svg", "about/", "manifest.webmanifest", "icons/icon-192.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return
  // Pages, whether navigated to or fetched for a panel (see Layers.astro)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html"))
    event.respondWith(networkFirst(request))
  else if (request.url.includes("/_astro/")) event.respondWith(cacheFirst(request))
  else event.respondWith(staleWhileRevalidate(request))
})

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match("./")) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached ?? fresh
}
