class PngExporter {
    static WORKER_STR = function () {
        type LodePng = {
            _malloc: (size: number) => number;
            _free: (pointer: number) => void;
            _lodepng_encode32: (
                resultData: number,
                resultSize: number,
                imageData: number,
                width: number,
                height: number
            ) => void;
            HEAPU8: Uint8Array;
            HEAPU32: Uint32Array;
        };
        type Scope = typeof self & {
            __baseHref: string;
            importScripts: (url: string) => void;
            lodepng: (options: { locateFile: () => string }) => LodePng | PromiseLike<LodePng>;
        };
        const initLodepng = () => {
            // This function will be invoked after receiving the base href via an 'init' message
            return new Promise<LodePng>((resolve) => {
                const baseHref = (self as unknown as Scope).__baseHref;
                (self as unknown as Scope).importScripts(`${baseHref}static/lib/lodepng/lodepng.js`);
                resolve(
                    (self as unknown as Scope).lodepng({
                        locateFile: () => `${baseHref}static/lib/lodepng/lodepng.wasm`
                    })
                );
            });
        };

        const compress = (lodepng: LodePng, words: Uint32Array, width: number, height: number): Uint8Array => {
            const resultDataPtrPtr = lodepng._malloc(4);
            const resultSizePtr = lodepng._malloc(4);
            const imageData = lodepng._malloc(width * height * 4);

            // copy pixels into wasm memory
            for (let y = 0; y < height; ++y) {
                let soff = y * width;
                let doff = imageData / 4 + (height - 1 - y) * width;
                for (let x = 0; x < width; ++x) {
                    lodepng.HEAPU32[doff++] = words[soff++];
                }
            }

            // invoke compress
            lodepng._lodepng_encode32(resultDataPtrPtr, resultSizePtr, imageData, width, height);

            // read results
            const result = lodepng.HEAPU8.slice(
                lodepng.HEAPU32[resultDataPtrPtr / 4],
                lodepng.HEAPU32[resultDataPtrPtr / 4] + lodepng.HEAPU32[resultSizePtr / 4]
            );

            lodepng._free(resultDataPtrPtr);
            lodepng._free(resultSizePtr);
            lodepng._free(imageData);

            return result;
        };

        const main = () => {
            let lodepngPromise: Promise<LodePng> | null = null;

            self.onmessage = async (message) => {
                const data = message.data;

                if (data && data.type === 'init') {
                    (self as unknown as Scope).__baseHref = data.baseHref as string;
                    lodepngPromise = initLodepng();
                    return;
                }

                if (!lodepngPromise) {
                    return;
                }

                const lodepng = await lodepngPromise;

                // compress
                const result = compress(lodepng, data.words, data.width, data.height);

                // return
                self.postMessage({ result: result }, undefined, [result.buffer]);
            };
        };

        main();
    }.toString();

    worker: Worker;

    receiveCallback: (resolve: (result: Uint8Array<ArrayBuffer>) => void) => void;

    constructor() {
        let receiver: (message: MessageEvent) => void = null;

        const workerBlob = new Blob([`(${PngExporter.WORKER_STR})()\n\n`], {
            type: 'application/javascript'
        });
        this.worker = new Worker(URL.createObjectURL(workerBlob));
        this.worker.addEventListener('message', (message) => {
            receiver(message);
        });

        const url = new URL(window.location.href);
        const baseHref = url.origin + url.pathname;
        this.worker.postMessage({ type: 'init', baseHref });

        this.receiveCallback = (resolve) => {
            receiver = (message) => {
                resolve(message.data.result);
                receiver = null;
            };
        };
    }

    // download the data uri
    _downloadFile(filename: string, data: Uint8Array<ArrayBuffer>) {
        const blob = new Blob([data], { type: 'octet/stream' });
        const url = window.URL.createObjectURL(blob);

        const el = document.createElement('a');
        el.download = filename;
        el.href = url;
        el.click();

        window.URL.revokeObjectURL(url);
    }

    async export(filename: string, words: Uint32Array, width: number, height: number) {
        this.worker.postMessage(
            {
                type: 'encode',
                words: words,
                width: width,
                height: height
            },
            [words.buffer]
        );
        this._downloadFile(filename, await new Promise(this.receiveCallback));
    }
}

export { PngExporter };
