import * as pc from 'playcanvas';
import { wasmSupported, loadWasmModuleAsync } from './lib/wasm-loader.js';

import Viewer from './viewer.js';
import { handleAssetManifest, onSceneReset, onAnimationsLoaded, onMorphTargetsLoaded, registerElementEvents } from './controls.js';

import './style.css';

window.pc = pc;
/* eslint-disable no-unused-vars */
var viewer;
function startViewer() {
    viewer = new Viewer(document.getElementById("application-canvas"), onSceneReset, onAnimationsLoaded, onMorphTargetsLoaded);
    registerElementEvents(viewer);
    pc.http.get("asset_manifest.json", { cache: true, responseType: "text", retry: false }, handleAssetManifest(viewer));
}
/* eslint-enable no-unused-vars */

var main = function () {
    pc.basisDownload(
        './lib/basis/basis.wasm.js',
        './lib/basis/basis.wasm.wasm',
        './lib/basis/basis.js',
        function () {
            if (wasmSupported()) {
                loadWasmModuleAsync('DracoDecoderModule',
                                    './lib/draco/draco.wasm.js',
                                    './lib/draco/draco.wasm.wasm',
                                    startViewer);
            } else {
                loadWasmModuleAsync('DracoDecoderModule',
                                    './lib/draco/draco.js',
                                    '',
                                    startViewer);
            }
        });
};

main();