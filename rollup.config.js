import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from '@rollup/plugin-replace';
import typescript from 'rollup-plugin-typescript2';
import copy from 'rollup-plugin-copy';
import { terser } from 'rollup-plugin-terser';
import alias from '@rollup/plugin-alias';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

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

const aliasEntries = () => {
    const entries = [];

    if (process.env.PCUI_PATH) {
        entries.push({
            find: /^@playcanvas\/pcui/,
            replacement: path.resolve(process.env.PCUI_PATH)
        });
    }

    if (process.env.ENGINE_PATH) {
        entries.push({
            find: /^playcanvas/,
            replacement: path.resolve(process.env.ENGINE_PATH)
        });
    }

    return {
        entries: entries
    };
};

export default {
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'es'
    },
    plugins: [
        alias(aliasEntries()),
        replace({
            values: {
                'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
                '__PUBLIC_PATH__': JSON.stringify(process.env.PUBLIC_PATH)
            },
            preventAssignment: true
        }),
        copy({
            targets: [
                { src: './src/style.css', dest: 'dist/' },
                { src: './src/fonts.css', dest: 'dist/' },
                { src: './static/*', dest: 'dist/static/' }
            ]
        }),
        commonjs(),
        resolve(),
        typescript(),
        (process.env.NODE_ENV === 'production' && terser())
    ]
};
