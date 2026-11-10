// A native popover opens centred on the whole screen, which is far from the
// marker on a big monitor. Place it by the marker instead: under it, and, in a
// side panel, centred on that panel. A panel is a copy of a page, so its markers
// share element ids with the page underneath, and popovertarget would find
// the wrong popover; open the one right after the marker instead.
const popOf = (target: EventTarget | null) => {
  const btn = (target as Element | null)?.closest<HTMLElement>("button.how")
  const pop = btn?.nextElementSibling
  return btn && pop instanceof HTMLElement && pop.classList.contains("how-pop") ? { btn, pop } : undefined
}

// Pressing the marker of an open popover light-dismisses it first; the click
// that follows must not reopen it.
let wasOpen = false
document.addEventListener("pointerdown", (e) => (wasOpen = !!popOf(e.target)?.pop.matches(":popover-open")), true)

document.addEventListener("click", (e) => {
  const hit = popOf(e.target)
  if (!hit) return
  e.preventDefault()
  const { btn, pop } = hit
  if (wasOpen) return pop.hidePopover()
  pop.style.visibility = "hidden" // until placed: it has no size before it is shown
  pop.showPopover()
  const b = btn.getBoundingClientRect()
  const frame = btn.closest(".layer")?.getBoundingClientRect()
  const gap = 8
  const centre = frame ? frame.left + frame.width / 2 : b.left + b.width / 2
  const left = Math.min(Math.max(centre - pop.offsetWidth / 2, gap), innerWidth - pop.offsetWidth - gap)
  // Below the marker, or above it if there's no room
  const below = b.bottom + gap
  const top = below + pop.offsetHeight <= innerHeight - gap ? below : Math.max(gap, b.top - gap - pop.offsetHeight)
  Object.assign(pop.style, { inset: "auto", margin: "0", left: `${left}px`, top: `${top}px`, visibility: "" })
})
