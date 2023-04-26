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
import typescript from 'rollup-plugin-typescript2';
// import { visualizer } from 'rollup-plugin-visualizer';

const PROD_BUILD = process.env.BUILD_TYPE === 'prod';
const ENGINE_DIR = process.env.ENGINE_PATH || 'node_modules/playcanvas';
const PCUI_DIR = process.env.PCUI_PATH || 'node_modules/@playcanvas/pcui';

const ENGINE_NAME = PROD_BUILD ? 'playcanvas.mjs' : 'playcanvas.dbg.mjs';
const ENGINE_PATH = path.resolve(ENGINE_DIR, 'build', ENGINE_NAME);
const EXTRAS_PATH = path.resolve(ENGINE_DIR, 'build', 'playcanvas-extras.js');
const PCUI_PATH = path.resolve(PCUI_DIR, 'react');

// define supported module overrides
const aliasEntries = {
    'playcanvas': ENGINE_PATH,
    'playcanvas-extras': EXTRAS_PATH,
    'pcui': PCUI_PATH
};

const tsCompilerOptions = {
    baseUrl: '.',
    paths: {
        'playcanvas': [ENGINE_DIR],
        'playcanvas-extras': [EXTRAS_PATH],
        'pcui': [PCUI_PATH]
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
    'process.env.NODE_ENV': JSON.stringify(PROD_BUILD ? 'production' : 'development'),
    '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
};

export default {
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'es',
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
            tsconfig: 'tsconfig.json',
            tsconfigDefaults: { compilerOptions: tsCompilerOptions },
            clean: true
        }),
        json(),
        (PROD_BUILD && terser()),
        // visualizer()
    ],
    treeshake: 'smallest',
    cache: false
};
