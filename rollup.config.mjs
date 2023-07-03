import path from 'path';
import copyAndWatch from "./copy-and-watch.mjs";
import Handlebars from 'handlebars';
import alias from '@rollup/plugin-alias';
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import sass from 'rollup-plugin-sass';
import typescript from "@rollup/plugin-typescript";
import sourcemaps from 'rollup-plugin-sourcemaps';

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = process.env.ENGINE_PATH || 'node_modules/playcanvas';
const EXTRAS_DIR = path.resolve(ENGINE_DIR, 'build', 'playcanvas-extras.mjs');
const PCUI_DIR = path.resolve(process.env.PCUI_PATH || 'node_modules/@playcanvas/pcui', 'react');

const ENGINE_NAME = (BUILD_TYPE === 'debug') ? 'playcanvas.dbg.mjs' : 'playcanvas.mjs';
const ENGINE_PATH = path.resolve(ENGINE_DIR, 'build', ENGINE_NAME);

// define supported module overrides
const aliasEntries = {
    'playcanvas': ENGINE_PATH,
    'playcanvas-extras': EXTRAS_DIR,
    'pcui': PCUI_DIR
};

const tsCompilerOptions = {
    baseUrl: '.',
    paths: {
        'playcanvas': [ENGINE_DIR],
        'playcanvas-extras': [EXTRAS_DIR],
        'pcui': [PCUI_DIR]
    }
};

// compile mustache template
const compileMustache = (content, srcFilename) => {
    return Handlebars.compile(content.toString('utf8'))({
        hasPublicPath: !!process.env.PUBLIC_PATH,
        hasAnalyticsID: !!process.env.ANALYTICS_ID,
        hasOneTrustDeveloperID: !!process.env.ONETRUST_DEVELOPER_ID,
        analyticsID: process.env.ANALYTICS_ID,
        oneTrustDomainKey: process.env.ONETRUST_DOMAIN_KEY,
        oneTrustDeveloperID: process.env.ONETRUST_DEVELOPER_ID
    });
};

const replaceValues = {
    'process.env.NODE_ENV': JSON.stringify(BUILD_TYPE === 'release' ? 'production' : 'development'),
    '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
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
            values: replaceValues,
            preventAssignment: true
        }),
        sass({
            insert: false,
            output: 'dist/style.css',
            outputStyle: 'compressed'
        }),
        alias({ entries: aliasEntries }),
        commonjs(),
        resolve(),
        typescript({
            compilerOptions: tsCompilerOptions
        }),
        sourcemaps(),
        json(),
        (BUILD_TYPE !== 'debug') && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
