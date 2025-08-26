import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import tailwindcss from '@tailwindcss/vite';

const browser = process.env.BROWSER || 'chrome';
const manifestPath = `manifests/${browser}-manifest.json`;

export default defineConfig({
    build: {
        outDir: './dist',
        rollupOptions: {
            input: {
                sidepanel: resolve(__dirname, 'sidepanel.html'),
                service_worker: resolve(__dirname, 'src/service-worker.ts'),
            },
            output: {
                // This tells Vite where to place bundled JS files
                entryFileNames: 'js/[name].js',
                chunkFileNames: 'js/[name].[hash].js',
                assetFileNames: '[name].[ext]',
            },
        },
    },
    plugins: [
        tailwindcss(),
        viteStaticCopy({
            targets: [
                {
                    src: manifestPath,
                    dest: '.', // Copy to the root of the 'dist' folder
                    rename: 'manifest.json' // Rename the file to manifest.json
                },
                {src: 'images', dest: '.'},
                {src: 'themes', dest: '.'},
                {src: 'js/*', dest: 'js'},
            ]
        })
    ]
});
