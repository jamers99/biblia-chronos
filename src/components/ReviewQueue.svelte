<script lang="ts">
  // The review queue: every fact that needs a person (/review/queue.json),
  // filtered, grouped, and most severe first (src/lib/review-filter.ts). The
  // filters live in the query string, so a view can be shared. Each fact holds
  // a <review-controls> element (ReviewMode.astro) for its verdict buttons.
  import { onMount } from "svelte"
  import { readPending } from "../lib/review.ts"
  import {
    DEFAULTS,
    GROUPS,
    SEVERITIES,
    STATUSES,
    facets,
    filterItems,
    fromQuery,
    groupItems,
    toQuery,
    type Filters,
    type QueueData,
    type Severity,
    type Status,
  } from "../lib/review-filter.ts"

  let { src }: { src: string } = $props()

  const PAGE = 25 // facts shown per group before "Show more"
  let data = $state<QueueData | undefined>()
  let failed = $state(false)
  let f = $state<Filters>({ ...DEFAULTS })
  let pending = $state(new Set<string>())
  let shown = $state<Record<string, number>>({}) // facts shown per group, past the first PAGE
  let opened = $state<Record<string, boolean>>({}) // groups opened or closed by hand
  const marked = () => new Set(Object.keys(readPending()))

  const visible = $derived(data ? filterItems(data.items, f, pending) : [])
  const counts = $derived(data ? facets(data.items, f, pending) : undefined)
  const groups = $derived(data ? groupItems(visible, f.group, data) : [])
  const kindName = $derived(new Map(data?.kinds ?? []))

  // Severity only applies to flags and missing verses.
  const rated = $derived(f.status.some((s) => s !== "reading"))

  function toggle<T extends string>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  }
  function update(change: Partial<Filters>) {
    f = { ...f, ...change }
    shown = {}
    pending = marked()
    history.replaceState(history.state, "", location.pathname + toQuery(f) + location.hash)
  }

  onMount(() => {
    f = fromQuery(location.search)
    pending = marked()
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((d: QueueData) => (data = d))
      .catch(() => (failed = true))
  })
</script>

{#if failed}
  <p class="muted">The queue didn't load. Check your connection and reload.</p>
{:else if !data}
  <p class="muted">Loading the queue…</p>
{:else}
  <form class="filters" onsubmit={(e) => e.preventDefault()}>
    <fieldset>
      <legend>Show</legend>
      {#each STATUSES as [s, label]}
        <button
          type="button"
          class="pill chip"
          aria-pressed={f.status.includes(s)}
          onclick={() => update({ status: toggle<Status>(f.status, s) })}>{label} <span class="n">{counts?.status.get(s) ?? 0}</span></button
        >
      {/each}
    </fieldset>
    <fieldset disabled={!rated}>
      <legend>Severity</legend>
      {#each SEVERITIES as [s, label]}
        <button
          type="button"
          class="pill chip"
          aria-pressed={f.severity.includes(s)}
          onclick={() => update({ severity: toggle<Severity>(f.severity, s) })}>{label} <span class="n">{counts?.severity.get(s) ?? 0}</span></button
        >
      {/each}
    </fieldset>
    <div class="row">
      <label>
        <span>Kind</span>
        <select class="field" value={f.kind} onchange={(e) => update({ kind: e.currentTarget.value })}>
          <option value="">All kinds</option>
          {#each data.kinds as [k, label]}
            <option value={k} disabled={!counts?.kind.get(k)}>{label} ({counts?.kind.get(k) ?? 0})</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Book</span>
        <select class="field" value={f.book} onchange={(e) => update({ book: e.currentTarget.value })}>
          <option value="">All books</option>
          {#each data.books as [b, label]}
            <option value={b} disabled={!counts?.book.get(b)}>{label} ({counts?.book.get(b) ?? 0})</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Group by</span>
        <select class="field" value={f.group} onchange={(e) => update({ group: e.currentTarget.value as Filters["group"] })}>
          {#each GROUPS as [g, label]}
            <option value={g}>{label}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="row">
      <label class="search">
        <span>Search</span>
        <input type="search" class="field" value={f.q} placeholder="A name, a verse, a word in the note" oninput={(e) => update({ q: e.currentTarget.value })} />
      </label>
      <label class="check">
        <input type="checkbox" checked={f.hide} onchange={(e) => update({ hide: e.currentTarget.checked })} />
        Hide what I've marked
      </label>
    </div>
    <p class="summary">
      {visible.length.toLocaleString()} fact{visible.length === 1 ? "" : "s"}{groups.length > 1 ? ` in ${groups.length} groups` : ""}.
      {#if toQuery(f)}<button type="button" class="link" onclick={() => update({ ...DEFAULTS })}>Reset filters</button>{/if}
    </p>
  </form>

  <!-- The first few groups start open; the rest, and their facts, wait to be opened. -->
  {#each groups as g, gi (g.id)}
    {@const open = !g.title || (opened[g.id] ?? gi < 3)}
    <details class="group" {open} ontoggle={(e) => (opened = { ...opened, [g.id]: e.currentTarget.open })}>
      {#if g.title}
        <summary><h2>{g.title} <span class="n">{g.items.length}</span></h2></summary>
      {/if}
      {#if open}
      <ol class="queue">
        {#each g.items.slice(0, shown[g.id] ?? PAGE) as it (it.key)}
          <li class="queue-item">
            <p class="tags">
              {#if it.severity}<span class="tag sev-{it.severity}">{SEVERITIES.find(([s]) => s === it.severity)?.[1]}</span>{/if}
              <span class="tag">{STATUSES.find(([s]) => s === it.status)?.[1]}</span>
              {#if f.group !== "kind"}<span class="tag">{kindName.get(it.kind)}</span>{/if}
            </p>
            <p class="claim">
              {#each it.claim as p}{#if typeof p === "string"}{p}{:else if p.href}<a href={p.href}>{p.text}</a>{:else}{p.text}{/if}{/each}
            </p>
            {#if it.refs.length}
              <p class="refs">
                {#each it.refs as r, i}{i > 0 ? " · " : ""}<a href={r.url} target="_blank" rel="noopener">{r.label}</a>{/each}
              </p>
            {/if}
            {#if it.note}<p class="note">AI: {it.note}</p>{/if}
            <review-controls data-key={it.key}></review-controls>
          </li>
        {/each}
      </ol>
      {/if}
      {#if open && g.items.length > (shown[g.id] ?? PAGE)}
        <button type="button" class="pill more" onclick={() => (shown = { ...shown, [g.id]: (shown[g.id] ?? PAGE) + PAGE * 4 })}>
          Show more ({(g.items.length - (shown[g.id] ?? PAGE)).toLocaleString()} left)
        </button>
      {/if}
    </details>
  {:else}
    <p class="muted">Nothing matches these filters.</p>
  {/each}
  {#if data.reviewed > 0}
    <p class="muted">{data.reviewed.toLocaleString()} facts already have an editor's verdict and are out of the queue.</p>
  {/if}
{/if}

<style>
  .filters {
    display: grid;
    gap: 0.75rem;
    margin: 1.5rem 0 2rem;
    padding: 1rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 12px;
    font-size: 0.88rem;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  fieldset:disabled {
    opacity: 0.45;
  }
  legend,
  label > span {
    float: left;
    min-width: 4.5rem;
    margin-right: 0.3rem;
    color: var(--ink-3);
  }
  .chip[aria-pressed="true"] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  .chip .n {
    opacity: 0.65;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1.25rem;
    align-items: center;
  }
  .row label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .row label > span {
    min-width: 0;
  }
  .field {
    max-width: 100%;
  }
  .search {
    flex: 1 1 16rem;
  }
  .search input {
    flex: 1;
    min-width: 0;
  }
  .check input {
    accent-color: var(--gold);
  }
  .summary {
    margin: 0;
    color: var(--ink-2);
  }
  .link {
    font: inherit;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .group {
    margin: 0 0 1.5rem;
  }
  .group summary {
    cursor: pointer;
    list-style-position: outside;
  }
  .group h2 {
    display: inline;
    font-size: 1.2rem;
  }
  .n {
    font: 400 0.8rem var(--sans);
    color: var(--ink-3);
  }
  .queue {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
  }
  .queue-item {
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--rule);
  }
  .queue-item p {
    margin: 0 0 0.3rem;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag {
    font: 0.7rem/1 var(--sans);
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    color: var(--ink-3);
  }
  .tag.sev-high {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--paper);
  }
  .tag.sev-medium {
    border-color: var(--accent);
    color: var(--accent);
  }
  .claim {
    font-weight: 600;
  }
  .refs,
  .note {
    font-size: 0.9rem;
    color: var(--ink-2);
  }
  .more {
    margin-top: 0.75rem;
  }
  /* Phones: each label above its options. */
  @media (max-width: 560px) {
    .filters {
      padding: 0.85rem;
    }
    legend,
    label > span {
      float: none;
      display: block;
      width: 100%;
      margin: 0 0 0.25rem;
    }
    .row {
      gap: 0.6rem;
    }
    .row label:not(.check) {
      flex-direction: column;
      align-items: stretch;
      flex: 1 1 8rem;
      min-width: 0;
    }
    .row .field {
      width: 100%;
      min-width: 0;
    }
    .search {
      flex-basis: 100% !important;
    }
  }
  /* Verdicts waiting to be submitted fade, so the eye finds what's left. */
  .queue-item:global(.pending) .claim,
  .queue-item:global(.pending) .refs,
  .queue-item:global(.pending) .note,
  .queue-item:global(.pending) .tags {
    opacity: 0.55;
  }
</style>
