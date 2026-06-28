<script lang="ts">
  // Interactive island: data arrives as props from the Astro page (built at
  // SSG time); hydration adds the draft toggle. Proves the seed → page → island
  // path end to end.
  type Row = {
    id: string
    name: string
    born: string
    died: string
    children: number
    draft: boolean
  }

  let { rows }: { rows: Row[] } = $props()
  let showDrafts = $state(true)

  const visible = $derived(showDrafts ? rows : rows.filter((r) => !r.draft))
</script>

<label class="toggle">
  <input type="checkbox" bind:checked={showDrafts} />
  show draft records
</label>

<ul class="people">
  {#each visible as r (r.id)}
    <li>
      <span class="name">{r.name}{#if r.draft}<span class="badge">draft</span>{/if}</span>
      <span class="dates">b. {r.born} · d. {r.died}</span>
      <span class="kids">{r.children} children</span>
    </li>
  {/each}
</ul>

<style>
  .toggle {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.85rem;
    color: #555;
    margin-bottom: 0.75rem;
    cursor: pointer;
  }
  .people {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 1rem;
    align-items: baseline;
    padding: 0.6rem 0.8rem;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
  }
  .name {
    font-weight: 600;
  }
  .badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #92400e;
    background: #fef3c7;
    border-radius: 4px;
    padding: 0.05rem 0.35rem;
    margin-left: 0.5rem;
  }
  .dates {
    color: #555;
    font-variant-numeric: tabular-nums;
  }
  .kids {
    color: #888;
    font-size: 0.85rem;
  }
</style>
