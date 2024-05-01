// official rollup plugins
import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import commonjs from "@rollup/plugin-commonjs";
import Handlebars from 'handlebars';
import json from "@rollup/plugin-json";
import path from 'path';
import resolve from "@rollup/plugin-node-resolve";
import replace from '@rollup/plugin-replace';
import sass from 'rollup-plugin-sass';
import terser from '@rollup/plugin-terser';
import typescript from "@rollup/plugin-typescript";

// custom plugins
import copyAndWatch from "./plugins/copy-and-watch.mjs";

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = process.env.ENGINE_PATH || 'node_modules/playcanvas';
const PCUI_DIR = path.resolve(process.env.PCUI_PATH || 'node_modules/@playcanvas/pcui', 'react');

const ENGINE_NAME = (BUILD_TYPE === 'debug') ? 'playcanvas.dbg.mjs' : 'playcanvas.mjs';
const ENGINE_PATH = path.resolve(ENGINE_DIR, 'build', ENGINE_NAME);

// compile mustache template
const compileMustache = (content) => {
    return Handlebars.compile(content.toString('utf8'))({
        hasPublicPath: !!process.env.PUBLIC_PATH,
        hasAnalyticsID: !!process.env.ANALYTICS_ID,
        hasOneTrustDeveloperID: !!process.env.ONETRUST_DEVELOPER_ID,
        analyticsID: process.env.ANALYTICS_ID,
        oneTrustDomainKey: process.env.ONETRUST_DOMAIN_KEY,
        oneTrustDeveloperID: process.env.ONETRUST_DEVELOPER_ID
    });
};

export default {
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        copyAndWatch({
            targets: [
                { src: 'src/index.mustache', destFilename: 'index.html', transform: compileMustache },
                { src: 'src/fonts.css' },
                { src: 'static/' }
            ]
        }),
        replace({
            values: {
                'process.env.NODE_ENV': JSON.stringify(BUILD_TYPE === 'release' ? 'production' : 'development'),
                '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
            },
            preventAssignment: true
        }),
        sass({
            insert: false,
            output: 'dist/style.css',
            outputStyle: 'compressed'
        }),
        image({ dom: true }),
        alias({
            entries: {
                'playcanvas': ENGINE_PATH,
                'pcui': PCUI_DIR
            }
        }),
        commonjs(),
        resolve(),
        typescript({
            compilerOptions: {
                baseUrl: '.',
                paths: {
                    'playcanvas': [ENGINE_DIR],
                    'pcui': [PCUI_DIR]
                }
            }
        }),
        json(),
        (BUILD_TYPE !== 'debug') && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
