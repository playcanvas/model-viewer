import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from '@rollup/plugin-replace';
import alias from '@rollup/plugin-alias';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import sass from 'rollup-plugin-sass';
import sourcemaps from 'rollup-plugin-sourcemaps';
import Handlebars from 'handlebars';
import path from 'path';
import copyAndWatch from "./copy-and-watch";

const PROD_BUILD = process.env.BUILD_TYPE === 'prod';

const paths = {
    PCUI_PATH: process.env.PCUI_PATH && path.resolve(process.env.PCUI_PATH),
    ENGINE_PATH: process.env.ENGINE_PATH && path.resolve(process.env.ENGINE_PATH)
};

// define supported module overrides
const aliasEntries = [];
const tsCompilerOptions = {
    baseUrl: '.',
    paths: { }
};

if (paths.PCUI_PATH) {
    aliasEntries.push({
        find: /^@playcanvas\/pcui(.*)/,
        replacement: `${paths.PCUI_PATH}$1`
    });

    tsCompilerOptions.paths['@playcanvas/pcui/react'] = [`${paths.PCUI_PATH}/react`];
}

if (paths.ENGINE_PATH) {
    aliasEntries.push({
        find: /^playcanvas$/,
        replacement: `${paths.ENGINE_PATH}/build/playcanvas.dbg.mjs`
    });

    aliasEntries.push({
        find: /^playcanvas(.*)/,
        replacement: `${paths.ENGINE_PATH}$1`
    });

    tsCompilerOptions.paths['playcanvas'] = [paths.ENGINE_PATH];
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

const replaceValues = {
    'process.env.NODE_ENV': JSON.stringify(PROD_BUILD ? 'production' : 'development'),
    '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
};

export default {
    cache: false,
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'es',
        sourcemap: true
    },
    plugins: [
        replace({
            values: replaceValues,
            preventAssignment: true
        }),
        sass({
            insert: false,
            output: 'dist/style.css',
            outputStyle: 'compressed'
        }),
        copyAndWatch({
            targets: [
                { src: 'src/index.mustache', destFilename: 'index.html', transform: compileMustache },
                { src: 'src/fonts.css' },
                { src: 'static/' }
            ]
        }),
        alias({ entries: aliasEntries }),
        resolve(),
        sourcemaps(),
        commonjs(),
        typescript({
            tsconfig: 'tsconfig.json',
            clean: true,
            tsconfigDefaults: { compilerOptions: tsCompilerOptions }
        }),
        (PROD_BUILD && terser())
    ]
};
