// @ts-check
import { defineConfig } from "astro/config"
import svelte from "@astrojs/svelte"

// Static output, hostable on GitHub Pages or any container (no server).
// Served from the root, so there is no base path. No `site` is set: nothing
// builds absolute URLs, so the domain lives only in the GitHub Pages settings.
// Set it if you add a sitemap, canonical links or social-preview tags.
export default defineConfig({
  base: "/",
  integrations: [svelte()],
  // Styles as files, never inlined, so a page shown in a panel over another
  // (see Layers.astro) can bring its stylesheets along.
  build: { inlineStylesheets: "never" },
})
