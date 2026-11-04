// Where you were in a view (the timeline's span, the map's chapter and
// framing), kept on this device. Going back to a view, through the site bar
// or by reopening the app, lands where you left it. Storage can be missing or
// refuse (private windows, blocked site data); then views just start fresh.

export function remember<T>(key: string) {
  return {
    load(): T | undefined {
      try {
        const saved = localStorage.getItem(key)
        return saved ? (JSON.parse(saved) as T) : undefined
      } catch {
        return undefined
      }
    },
    // Saved as you leave or hide the page (an installed app may be closed
    // from the app switcher without ever leaving), so it costs nothing while
    // you explore.
    onLeave(state: () => T) {
      const save = () => {
        try {
          localStorage.setItem(key, JSON.stringify(state()))
        } catch {}
      }
      const onHide = () => document.visibilityState === "hidden" && save()
      addEventListener("pagehide", save)
      document.addEventListener("visibilitychange", onHide)
      return () => {
        removeEventListener("pagehide", save)
        document.removeEventListener("visibilitychange", onHide)
      }
    },
  }
}
