import { RenderTarget } from 'playcanvas';

function PngExportWorker(href) {
    const initLodepng = () => {
        return new Promise((resolve, reject) => {
            self.importScripts(`${href}static/lib/lodepng/lodepng.js`);
            resolve(self.lodepng({
                locateFile: () => `${href}static/lib/lodepng/lodepng.wasm`
            }));
        });
    };

    const compress = (lodepng, words, width, height) => {
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
        const result = lodepng.HEAPU8.slice(lodepng.HEAPU32[resultDataPtrPtr / 4], lodepng.HEAPU32[resultDataPtrPtr / 4] + lodepng.HEAPU32[resultSizePtr / 4]);

        lodepng._free(resultDataPtrPtr);
        lodepng._free(resultSizePtr);
        lodepng._free(imageData);

        return result;
    };

    const main = async () => {
        const lodepng = await initLodepng();

        self.onmessage = (message) => {
            const data = message.data;

            // compress
            const result = compress(lodepng, data.words, data.width, data.height);

            // return
            self.postMessage({ result: result }, [result.buffer]);
        };
    };

    main();
}

const createWorker = () => {
    const workerBlob = new Blob([`(${PngExportWorker.toString()})('${window.location.href.split('?')[0]}')\n\n`], {
        type: 'application/javascript'
    });
    return new Worker(URL.createObjectURL(workerBlob));
}

const readPixels = (renderTarget) => {
    const device = renderTarget._device;
    const data = new Uint8ClampedArray(renderTarget.width * renderTarget.height * 4);
    device.setFramebuffer(renderTarget._glFrameBuffer);
    device.gl.readPixels(0, 0, renderTarget.width, renderTarget.height, device.gl.RGBA, device.gl.UNSIGNED_BYTE, data);
    return new Uint32Array(data.buffer);
};

const readTexturePixels = (texture, face) => {
    const renderTarget = new RenderTarget({ colorBuffer: texture, depth: false, face: face });
    device.initRenderTarget(renderTarget);
    const result = readPixels(renderTarget);
    renderTarget.destroy();
    return result;
};

// download the data uri
const downloadFile = (filename, data) => {
    const blob = new Blob([data], { type: "octet/stream" });
    const url = window.URL.createObjectURL(blob);

    const lnk = document.createElement('a');
    lnk.download = filename;
    lnk.href = url;

    // create a "fake" click-event to trigger the download
    if (document.createEvent) {
        const e = document.createEvent("MouseEvents");
        e.initMouseEvent("click", true, true, window,
                         0, 0, 0, 0, 0, false, false, false,
                         false, 0, null);
        lnk.dispatchEvent(e);
    } else if (lnk.fireEvent) {
        lnk.fireEvent("onclick");
    }

    window.URL.revokeObjectURL(url);
};

class PngExporter {
    constructor() {
        let receiver;

        this.worker = createWorker();
        this.worker.addEventListener('message', (message) => {
            receiver(message);
        });

        this.promiseFunc = (resolve, reject) => {
            receiver = (message) => {
                resolve(message.data.result);
                receiver = null;
            };
        };
    }

    async export(filename, words, width, height) {
        const compress = (words, width, height) => {
            this.worker.postMessage({
                words: words,
                width: width,
                height: height
            }, [words.buffer]);
    
            return new Promise(this.promiseFunc);
        };

        downloadFile(filename, await compress(words, width, height));
    }

    async exportRenderTarget(filename, renderTarget) {
        this.export(filename, readPixels(renderTarget), renderTarget.width, renderTarget.height);
    }

    async exportTexture(filename, texture) {
        if (texture.cubemap) {
            const faceNames = ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'];
            const lastPoint = filename.lastIndexOf('.');
            const filenameBase = lastPoint === -1 ? filename : filename.substring(0, lastPoint);
            for (let face = 0; face < 6; ++face) {
                this.export(`${filenameBase}_${faceNames[face]}.png`, readTexturePixels(texture, face), texture.width, texture.height);
            }
        } else {
            this.export(filename, readTexturePixels(texture, null), texture.width, texture.height);
        }
    }
}

export {
    PngExporter
};
