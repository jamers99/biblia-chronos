// @ts-check
import { defineConfig } from "astro/config"
import svelte from "@astrojs/svelte"

// Static output, hostable on GitHub Pages or any container (no server).
// Deployed to GitHub Pages under the custom domain https://chronos.jamers99.com,
// served from the root, so there is no base path.
export default defineConfig({
  site: "https://chronos.jamers99.com",
  base: "/",
  integrations: [svelte()],
  // Styles as files, never inlined, so a page shown in a panel over another
  // (see Layers.astro) can bring its stylesheets along.
  build: { inlineStylesheets: "never" },
})
