/// <reference types="node" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: process.env.SIM ? ['scripts/**/*.test.ts'] : ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
