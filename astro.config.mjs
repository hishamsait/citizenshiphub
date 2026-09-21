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
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
