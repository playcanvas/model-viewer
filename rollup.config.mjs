// official rollup plugins
import path from 'path';

import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import image from '@rollup/plugin-image';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import sass from 'rollup-plugin-sass';

// custom plugins
import { copyAndWatch } from './plugins/copy-and-watch.mjs';

// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);

const BLUE_OUT = '\x1b[34m';
const BOLD_OUT = '\x1b[1m';
const REGULAR_OUT = '\x1b[22m';
const RESET_OUT = '\x1b[0m';

const title = [
    'Building PlayCanvas Model Viewer',
    `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`,
    `engine ${BOLD_OUT}${ENGINE_DIR}${REGULAR_OUT}`
].map(l => `${BLUE_OUT}${l}`).join('\n');
console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);

const TARGETS = [
    {
        src: 'src/index.html',
        transform: (contents) => {
            return contents.toString()
            .replace('__BASE_HREF__', process.env.BASE_HREF || '')
            .replace('__');
        }
    },
    { src: 'src/manifest.json' },
    { src: 'src/fonts.css' },
    { src: 'static/' }
];

export default {
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    treeshake: 'smallest',
    plugins: [
        copyAndWatch(TARGETS),
        replace({
            values: {
                // NOTE: this is required for react (??) - see https://github.com/rollup/rollup/issues/487#issuecomment-177596512
                'process.env.NODE_ENV': JSON.stringify(BUILD_TYPE === 'release' ? 'production' : 'development')
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
                'playcanvas': ENGINE_DIR
            }
        }),
        commonjs(),
        resolve(),
        typescript({
            tsconfig: './tsconfig.json'
        }),
        json(),
        (BUILD_TYPE !== 'debug') && terser({
            mangle: {
                // script classes can't be mangeled
                reserved: ['CameraControls']
            }
        })
    ]
};
