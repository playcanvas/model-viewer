import * as pc from 'playcanvas';
import { File, DropHandlerFunc } from './types';

class DropHandler {
    dropHandler: DropHandlerFunc;

    constructor(dropHandler: DropHandlerFunc) {
        this.dropHandler = dropHandler;

        // configure drag and drop
        window.addEventListener('dragstart', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.effectAllowed = "all";
        }, false);
        window.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.effectAllowed = "all";
        }, false);
        window.addEventListener('drop', (event) => this.handleDrop(event), false);
    }

    // use webkitGetAsEntry to extract files so we can include folders
    private handleDrop(event: DragEvent) {

        const removeCommonPrefix = (urls: Array<File>) => {
            const split = (pathname: string) => {
                const parts = pathname.split(pc.path.delimiter);
                const base = parts[0];
                const rest = parts.slice(1).join(pc.path.delimiter);
                return [base, rest];
            };
            while (true) {
                const parts = split(urls[0].filename);
                if (parts[1].length === 0) {
                    return;
                }
                for (let i = 1; i < urls.length; ++i) {
                    const other = split(urls[i].filename);
                    if (parts[0] !== other[0]) {
                        return;
                    }
                }
                for (let i = 0; i < urls.length; ++i) {
                    urls[i].filename = split(urls[i].filename)[1];
                }
            }
        };

        const resolveFiles = (entries: Array<FileSystemFileEntry>) => {
            const files: Array<File> = [];
            entries.forEach((entry: FileSystemFileEntry) => {
                entry.file((entryFile: any) => {
                    files.push({
                        url: URL.createObjectURL(entryFile),
                        filename: entry.fullPath.substring(1)
                    });
                    if (files.length === entries.length) {
                        // remove common prefix from files in order to support dragging in the
                        // root of a folder containing related assets
                        if (files.length > 1) {
                            removeCommonPrefix(files);
                        }

                        // keep shift in to add files to the scene
                        this.dropHandler(files, !event.shiftKey);
                    }
                });
            });
        };

        const resolveDirectories = (entries: Array<FileSystemEntry>) => {
            let awaiting = 0;
            const files: Array<FileSystemFileEntry> = [];
            const recurse = (entries: Array<FileSystemEntry>) => {
                entries.forEach((entry: FileSystemEntry) => {
                    if (entry.isFile) {
                        files.push(entry as FileSystemFileEntry);
                    } else if (entry.isDirectory) {
                        awaiting++;
                        const reader = (entry as FileSystemDirectoryEntry).createReader();
                        reader.readEntries((subEntries: Array<FileSystemEntry>) => {
                            awaiting--;
                            recurse(subEntries);
                        });
                    }
                });
                if (awaiting === 0) {
                    resolveFiles(files);
                }
            };
            recurse(entries);
        };

        // first things first
        event.preventDefault();

        const items = event.dataTransfer.items;
        if (!items) {
            return;
        }

        const entries = [];
        for (let i = 0; i < items.length; ++i) {
            entries.push(items[i].webkitGetAsEntry());
        }
        resolveDirectories(entries);
    }
   
}

export {
    DropHandler
};
