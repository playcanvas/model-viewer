import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from '@rollup/plugin-replace';
import typescript from 'rollup-plugin-typescript';
import copy from 'rollup-plugin-copy';
import { terser } from 'rollup-plugin-terser';
import replacement from "rollup-plugin-module-replacement";
import Handlebars from 'handlebars';
import fs from 'fs';

const html = fs.readFileSync(`./src/index.mustache`, "utf8");
const template = Handlebars.compile(html);
if (!fs.existsSync('./dist')) fs.mkdirSync('./dist');
fs.writeFileSync(`./dist/index.html`, template({
    hasPublicPath: !!process.env.PUBLIC_PATH,
    analyticsID: process.env.ANALYTICS_ID,
    oneTrustDomainKey: process.env.ONETRUST_DOMAIN_KEY,
    oneTrustDeveloperId: process.env.ONETRUST_DEVELOPER_ID
}));

export default {
    input: 'src/index.tsx',
    output: {
        dir: 'dist',
        format: 'es'
    },
    plugins: [
        replacement({
            entries: [
                {
                    find: /^playcanvas$/,
                    replacement: (importee) => {
                        if (!process.env.ENGINE_PATH) return;
                        importee.replace('playcanvas', process.env.ENGINE_PATH);
                    }
                }
            ]
        }),
        replace({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
            '__PUBLIC_PATH__': process.env.PUBLIC_PATH
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
