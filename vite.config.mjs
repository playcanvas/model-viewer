import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { context } from 'esbuild';
import { compileAsync } from 'sass-embedded';
import { defineConfig } from 'vite';

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const DEBUG = BUILD_TYPE === 'debug';
const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, 'dist');
const ENGINE = path.join(ROOT, `node_modules/playcanvas/build/playcanvas${DEBUG ? '.dbg' : ''}/src/index.js`);
const INPUT = '\0model-viewer';
const NOOP = '.noop.js';
const FILES = ['src/index.html', 'src/manifest.json', 'src/fonts.css'];

let ctx;

const dispose = async () => {
    await fs.rm(path.join(DIST, NOOP), { force: true });
    await ctx?.dispose();
    ctx = undefined;
};

const files = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const file = path.join(dir, entry.name);
            return entry.isDirectory() ? files(file) : file;
        })
    );
    return nested.flat();
};

const plugin = {
    name: 'model-viewer',
    resolveId(id) {
        if (id === INPUT) {
            return id;
        }
    },
    load(id) {
        if (id === INPUT) {
            return '';
        }
    },
    async buildStart() {
        const watch = [...(await files(path.join(ROOT, 'src'))), ...(await files(path.join(ROOT, 'static')))];
        watch.forEach((file) => this.addWatchFile(file));
        this.addWatchFile(path.join(ROOT, 'src'));
        this.addWatchFile(path.join(ROOT, 'static'));

        await fs.mkdir(DIST, { recursive: true });
        ctx ??= await context({
            entryPoints: [path.join(ROOT, 'src/index.tsx')],
            outfile: path.join(DIST, 'index.js'),
            alias: { playcanvas: ENGINE },
            bundle: true,
            define: {
                'process.env.NODE_ENV': JSON.stringify(DEBUG ? 'development' : 'production')
            },
            format: 'esm',
            keepNames: !DEBUG,
            loader: { '.svg': 'dataurl' },
            minify: !DEBUG,
            platform: 'browser',
            plugins: [
                {
                    name: 'node',
                    setup(build) {
                        build.onResolve({ filter: /^node:worker_threads$/ }, (args) => ({
                            path: args.path,
                            namespace: 'empty'
                        }));
                        build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({
                            contents: 'export default {};',
                            loader: 'js'
                        }));
                    }
                },
                {
                    name: 'scss',
                    setup(build) {
                        build.onLoad({ filter: /\.scss$/ }, () => ({ contents: '', loader: 'js' }));
                    }
                }
            ],
            sourcemap: true,
            target: 'es2022',
            treeShaking: true
        });

        const css = compileAsync(path.join(ROOT, 'src/style.scss'), { style: 'compressed' }).then(async (result) => {
            result.loadedUrls.forEach((url) => this.addWatchFile(fileURLToPath(url)));
            await fs.writeFile(path.join(DIST, 'style.css'), result.css);
        });
        const copy = Promise.all(
            FILES.map(async (file) => {
                const src = path.join(ROOT, file);
                const dest = path.join(DIST, path.basename(file));
                if (file === 'src/index.html') {
                    const html = await fs.readFile(src, 'utf8');
                    await fs.writeFile(dest, html.replace('__BASE_HREF__', process.env.BASE_HREF || ''));
                } else {
                    await fs.copyFile(src, dest);
                }
            })
        ).then(() => fs.cp(path.join(ROOT, 'static'), path.join(DIST, 'static'), { recursive: true }));

        await Promise.all([ctx.rebuild(), css, copy]);
    },
    closeBundle: dispose,
    closeWatcher: dispose
};

console.log(`Building PlayCanvas Model Viewer\ntype ${BUILD_TYPE}\nengine ${ENGINE}\n`);

export default defineConfig({
    build: {
        rollupOptions: {
            input: INPUT,
            output: { entryFileNames: NOOP },
            onwarn(warning, warn) {
                if (warning.code !== 'EMPTY_BUNDLE') {
                    warn(warning);
                }
            }
        },
        write: false
    },
    plugins: [plugin]
});
