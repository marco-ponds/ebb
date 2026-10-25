// One-off icon generation (output is committed):
//   npx pwa-assets-generator --config scripts/pwa-assets.config.ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const background = '#1B1929';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, resizeOptions: { background, fit: 'contain' } },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background, fit: 'contain' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background, fit: 'contain' } },
    assetName: (type, size) => {
      if (type === 'maskable') return `icon-maskable-${size.width}.png`;
      if (type === 'apple') return `apple-touch-icon-${size.width}.png`;
      return `icon-${size.width}.png`;
    },
  },
  images: ['public/icons/icon.svg'],
});
