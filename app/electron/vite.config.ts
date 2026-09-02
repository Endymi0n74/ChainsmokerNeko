import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    // Inline Commander and websocket-rpc into the main-process bundle instead of
    // externalizing them: the packaged app ships without node_modules (npm 11's
    // allowScripts policy breaks the git-dep install inside build/), so these
    // packages must not be required at runtime. Only `electron` stays external,
    // provided by the Electron runtime itself.
    ssr: {
        noExternal: [ 'commander', 'websocket-rpc', 'ws' ],
    },
    build: {
        ssr: true,
        emptyOutDir: false,
        outDir: resolve(__dirname, 'build'),
        lib: {
            // Preload is built separately (vite.preload.config.ts): bundling both
            // entries in one pass makes rolldown hoist shared code into a chunk
            // that collides with the `main.js` entry file, and the emitted
            // preload.js ends up requiring ./main.js (which executes the whole
            // main process in the preload context and fails with
            // "Class extends value undefined").
            entry: [
                resolve(__dirname, 'src', 'Main.ts'),
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