import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Separate build for the preload script: keep it fully self-contained (it only
// needs `electron`), so it can never depend on or collide with main.js.
export default defineConfig({
    build: {
        ssr: true,
        emptyOutDir: false,
        outDir: resolve(__dirname, 'build'),
        lib: {
            entry: [
                resolve(__dirname, 'src', 'ipc', 'Preload.ts'),
            ],
            formats: [ 'cjs' ]
        },
        rolldownOptions: {
            output: {
                entryFileNames: ({ name }) => `${name}.js`.toLowerCase(),
                chunkFileNames: ({ name }) => `${name}.js`.toLowerCase(),
            }
        }
    },
});