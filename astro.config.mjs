import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://citizenshiphub.com',
  output: 'server',
  adapter: cloudflare({
    // No raster image optimization at runtime (Sharp is not supported on Workers).
    imageService: 'passthrough',
    platformProxy: {
      enabled: true,
      // Workers AI has no local simulator, so Wrangler would otherwise try to
      // start a "remote preview session" (which requires `wrangler login`).
      // Keep local dev auth-free; `env.AI` is simply undefined here and the
      // scraper falls back deterministically. The binding still works in prod.
      remoteBindings: false,
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
