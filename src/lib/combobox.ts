// A box that suggests records as you type, for the site search and the ends of
// Connections: the list under it, the arrow keys, Enter to pick, and what a
// screen reader needs. The look is the global .suggestions style; where the
// list sits is up to the caller.

import { hintOf, type SearchEntry } from "./search.ts"

type Options = {
  // The records for a query (an empty query never asks).
  find: (query: string) => SearchEntry[] | Promise<SearchEntry[]>
  pick: (entry: SearchEntry) => void
  // What Esc does (by default, put the list away).
  escape?: () => void
}

export function combobox(input: HTMLInputElement, list: HTMLUListElement, { find, pick, escape }: Options) {
  let results: SearchEntry[] = []
  let active = 0

  function open(show: boolean) {
    list.hidden = !show
    input.ariaExpanded = String(show)
    if (show && results.length) input.setAttribute("aria-activedescendant", `${list.id}-${active}`)
    else input.removeAttribute("aria-activedescendant")
  }

  function render() {
    list.replaceChildren(
      ...results.map((r, i) => {
        const li = document.createElement("li")
        li.id = `${list.id}-${i}`
        li.role = "option"
        li.ariaSelected = String(i === active)
        li.innerHTML = `<span class="name"></span><small></small>`
        li.querySelector(".name")!.textContent = r.name
        li.querySelector("small")!.textContent = hintOf(r)
        if (r.draft) li.classList.add("draft")
        // Keep focus in the box while pressing (so it doesn't blur and close
        // the list mid-tap), and pick on click, so the tap ends here rather
        // than on whatever is under the list once it's gone.
        li.addEventListener("pointerdown", (e) => e.preventDefault())
        li.addEventListener("click", () => choose(r))
        li.addEventListener("pointermove", () => highlight(i))
        return li
      }),
    )
    if (input.value.trim().length > 1 && !results.length)
      list.append(Object.assign(document.createElement("li"), { className: "empty", textContent: "Nothing found" }))
    open(list.children.length > 0)
  }

  function highlight(i: number) {
    active = (i + results.length) % results.length
    for (const [n, li] of [...list.children].entries()) li.ariaSelected = String(n === active)
    input.setAttribute("aria-activedescendant", `${list.id}-${active}`)
    list.children[active]?.scrollIntoView({ block: "nearest" })
  }

  // Empty the list (what was typed stays).
  function clear() {
    results = []
    list.replaceChildren()
    open(false)
  }

  function choose(entry: SearchEntry) {
    clear()
    pick(entry)
  }

  input.addEventListener("input", async () => {
    const query = input.value
    const found = query.trim() ? await find(query) : []
    if (input.value !== query) return // typed on meanwhile
    results = found
    active = 0
    render()
  })
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && results.length) highlight(active + 1)
    else if (e.key === "ArrowUp" && results.length) highlight(active - 1)
    else if (e.key === "Enter" && results[active]) choose(results[active])
    else if (e.key === "Escape") escape ? escape() : open(false)
    else return
    e.preventDefault()
  })
  // Leaving the box puts the list away; coming back brings it back.
  input.addEventListener("blur", () => open(false))
  input.addEventListener("focus", () => list.children.length && open(true))

  return { clear }
}
