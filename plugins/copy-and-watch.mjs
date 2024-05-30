import fs from 'fs';
import path from 'path';

const isDir = src => fs.lstatSync(src).isDirectory();

/**
 * Copy files and directories to the output directory and watch for changes.
 *
 * @param {object[]} targets - The array of objects with src, dest, and transform properties.
 * @param {string} targets.src - The source file or directory.
 * @param {string} targets.dest - The destination directory.
 * @param {function} targets.transform - Optional function to transform file contents.
 * @returns {import('rollup').Plugin} - The rollup plugin.
 */
export function copyAndWatch(targets = []) {
    const resolvedTargets = [];

    // resolve source directories into files
    targets.forEach((target) => {
        const readTargets = (pathname) => {
            if (!fs.existsSync(pathname)) {
                console.log(`skipping missing file ${target.src}`);
                return;
            }

            if (isDir(pathname)) {
                fs.readdirSync(pathname).forEach((childPath) => {
                    readTargets(path.join(pathname, childPath));
                });
                return;
            }

            let dest = path.join(target.dest || '', path.basename(target.src));
            if (isDir(target.src)) {
                dest = path.join(dest, path.relative(target.src, pathname));
            }

            resolvedTargets.push({
                src: pathname,
                dest: dest,
                transform: target.transform
            });
        };
        readTargets(target.src);
    });

    return {
        name: 'copy-and-watch',
        buildStart() {
            resolvedTargets.forEach((target) => {
                this.addWatchFile(target.src);
            });
        },
        generateBundle() {
            resolvedTargets.forEach((target) => {
                const contents = fs.readFileSync(target.src);
                this.emitFile({
                    type: 'asset',
                    fileName: target.dest,
                    source: target.transform ? target.transform(contents, target.src) : contents
                });
            });
        }
    };
}
