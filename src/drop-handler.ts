import { path } from 'playcanvas';

type File = {
    url: string,
    filename?: string
}

type DropHandlerFunc = (files: File[], resetScene: boolean) => void;

const resolveDirectories = (entries: FileSystemEntry[]): Promise<FileSystemFileEntry[]> => {
    const promises: Promise<FileSystemFileEntry[]>[] = [];
    const result: FileSystemFileEntry[] = [];

    entries.forEach((entry) => {
        if (entry.isFile) {
            result.push(entry as FileSystemFileEntry);
        } else if (entry.isDirectory) {
            promises.push(new Promise<any>((resolve) => {
                const reader = (entry as FileSystemDirectoryEntry).createReader();

                const p: Promise<any>[] = [];

                const read = () => {
                    reader.readEntries((children: FileSystemEntry[]) => {
                        if (children.length > 0) {
                            p.push(resolveDirectories(children));
                            read();
                        } else {
                            Promise.all(p)
                            .then((children: FileSystemFileEntry[][]) => {
                                resolve(children.flat());
                            });
                        }
                    });
                };
                read();
            }));
        }
    });

    return Promise.all(promises)
    .then((children: FileSystemFileEntry[][]) => {
        return result.concat(...children);
    });
};

const removeCommonPrefix = (urls: File[]) => {
    const split = (pathname: string) => {
        const parts = pathname.split(path.delimiter);
        const base = parts[0];
        const rest = parts.slice(1).join(path.delimiter);
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

// configure drag and drop
const CreateDropHandler = (target: HTMLElement, dropHandler: DropHandlerFunc) => {
    target.addEventListener('dragstart', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.effectAllowed = 'all';
    }, false);

    target.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.effectAllowed = 'all';
    }, false);

    target.addEventListener('drop', (ev) => {
        ev.preventDefault();

        const entries =
            Array.from(ev.dataTransfer.items)
            .map(item => item.webkitGetAsEntry());

        resolveDirectories(entries)
        .then((entries: FileSystemFileEntry[]) => {
            return Promise.all(entries.map((entry) => {
                return new Promise((resolve) => {
                    entry.file((entryFile: any) => {
                        resolve({
                            url: URL.createObjectURL(entryFile),
                            filename: entry.fullPath.substring(1)
                        });
                    });
                });
            }));
        })
        .then((files: File[]) => {
            if (files.length > 1) {
                removeCommonPrefix(files);
            }
            dropHandler(files, !ev.shiftKey);
        });
    }, false);
};

export { CreateDropHandler, File };
