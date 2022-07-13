import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from '@rollup/plugin-replace';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import alias from '@rollup/plugin-alias';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import copyAndWatch from "./copy-and-watch";

const html = fs.readFileSync(`./src/index.mustache`, "utf8");
const template = Handlebars.compile(html);
if (!fs.existsSync('./dist')) fs.mkdirSync('./dist');
fs.writeFileSync(`./dist/index.html`, template({
    hasPublicPath: !!process.env.PUBLIC_PATH,
    hasAnalyticsID: !!process.env.ANALYTICS_ID,
    hasOneTrustDeveloperID: !!process.env.ONETRUST_DEVELOPER_ID,
    analyticsID: process.env.ANALYTICS_ID,
    oneTrustDomainKey: process.env.ONETRUST_DOMAIN_KEY,
    oneTrustDeveloperID: process.env.ONETRUST_DEVELOPER_ID
}));

// define supported module overrides
const moduleOverrides = {
    PCUI_PATH: /^@playcanvas\/pcui(.*)/,
    ENGINE_PATH: /^playcanvas(.*)/
};

const aliasEntries = Object.keys(moduleOverrides)
    .filter(key => process.env.hasOwnProperty(key))
    .map((key) => {
        return {
            find: moduleOverrides[key],
            replacement: `${path.resolve(process.env[key])}$1`
        };
    });


export default {
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'es'
    },
    plugins: [
        alias({
            entries: aliasEntries
        }),
        replace({
            values: {
                'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
                '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
            },
            preventAssignment: true
        }),
        copyAndWatch({
            targets: [
                { src: './src/style.css' },
                { src: './src/fonts.css' },
                { src: './static' }
            ]
        }),
        commonjs(),
        resolve(),
        typescript(),
        (process.env.NODE_ENV === 'production' && terser())
    ]
};
