// Momentum for d3-zoom: after a drag or swipe, the view keeps gliding and eases
// to a stop, like a native scroll view. d3-zoom has none built in. Only pans
// glide; pinches and wheel zooms don't. Skipped when the reader prefers reduced
// motion.

import { zoomTransform, type ZoomBehavior } from "d3-zoom"
import { select } from "d3-selection"

const SAMPLE_MS = 80 // velocity is measured over the end of the gesture
const FRICTION = 0.95 // share of velocity kept per 16 ms frame
const MIN_SPEED = 0.03 // px/ms: slower than this, stop (or don't start)

// Attach to a zoom behavior already called on `element`. `axes: "x"` keeps the
// glide horizontal (the timeline); "xy" glides freely (the map).
export function addInertia<E extends Element>(behavior: ZoomBehavior<E, unknown>, element: E, axes: "x" | "xy") {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
  let samples: { t: number; x: number; y: number; k: number }[] = []
  let frame = 0

  // Programmatic moves (including the glide itself) have no sourceEvent; only
  // the reader's own gestures start, feed, or stop a glide.
  behavior
    .on("start.inertia", (e) => {
      if (!e.sourceEvent) return
      cancelAnimationFrame(frame)
      samples = []
    })
    .on("zoom.inertia", (e) => {
      if (!e.sourceEvent) return
      const now = performance.now()
      const { x, y, k } = e.transform
      samples = [...samples.filter((s) => now - s.t < SAMPLE_MS), { t: now, x, y, k }]
    })
    .on("end.inertia", (e) => {
      if (!e.sourceEvent || samples.length < 2) return
      const first = samples[0]
      const last = samples[samples.length - 1]
      // A zoom gesture, or a finger that stopped before lifting: no glide.
      if (first.k !== last.k || performance.now() - last.t > 50) return
      const dt = Math.max(1, last.t - first.t)
      let vx = (last.x - first.x) / dt
      let vy = axes === "x" ? 0 : (last.y - first.y) / dt
      let then = performance.now()

      const glide = (now: number) => {
        const ms = now - then
        then = now
        const k = zoomTransform(element).k
        behavior.translateBy(select(element), (vx * ms) / k, (vy * ms) / k)
        const decay = FRICTION ** (ms / 16)
        vx *= decay
        vy *= decay
        if (Math.hypot(vx, vy) > MIN_SPEED) frame = requestAnimationFrame(glide)
      }
      if (Math.hypot(vx, vy) > MIN_SPEED * 3) frame = requestAnimationFrame(glide)
    })
}
