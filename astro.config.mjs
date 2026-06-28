// @ts-check
import { defineConfig } from "astro/config"
import svelte from "@astrojs/svelte"

// Static output, hostable on GitHub Pages or any container (no server).
// Deployed to the project Pages site at https://jamers99.github.io/biblia-chronos,
// so assets and links are served under the `/biblia-chronos` base path.
export default defineConfig({
  site: "https://jamers99.github.io",
  base: "/biblia-chronos",
  integrations: [svelte()],
})
