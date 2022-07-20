import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from '@rollup/plugin-replace';
import alias from '@rollup/plugin-alias';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import sourcemaps from 'rollup-plugin-sourcemaps';
import Handlebars from 'handlebars';
import path from 'path';
import copyAndWatch from "./copy-and-watch";

const PROD_BUILD = process.env.BUILD_TYPE === 'prod';

const paths = {};
['PCUI_PATH', 'ENGINE_PATH'].forEach((p) => {
    const envPath = process.env[p];
    if (envPath) {
        paths[p] = path.resolve(envPath)
    }
});

// define supported module overrides
const aliasEntries = [];

if (paths.PCUI_PATH) {
    aliasEntries.push({
        find: /^@playcanvas\/pcui(.*)/,
        replacement: `${paths.PCUI_PATH}$1`
    });
}

if (paths.ENGINE_PATH) {
    aliasEntries.push({
        find: /^playcanvas$/,
        replacement: `${paths.ENGINE_PATH}/build/playcanvas.dbg.js`
    });

    aliasEntries.push({
        find: /^playcanvas(.*)/,
        replacement: `${paths.ENGINE_PATH}$1`
    });
}

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
                { src: 'src/style.css' },
                { src: 'src/fonts.css' },
                { src: 'static/' }
            ]
        }),
        alias({ entries: aliasEntries }),
        resolve(),
        replace({
            values: {
                'process.env.NODE_ENV': JSON.stringify(PROD_BUILD ? 'production' : 'development'),
                '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
            },
            preventAssignment: true
        }),
        sourcemaps(),
        commonjs(),
        typescript(),
        (PROD_BUILD && terser())
    ]
};
