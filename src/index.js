const pc = require(__PLAYCANVAS_IMPORT__);
import { wasmSupported, loadWasmModuleAsync } from './lib/wasm-loader.js';

import Viewer from './viewer.js';
import { onSceneReset, onAnimationsLoaded, onMorphTargetsLoaded, registerElementEvents } from './controls.js';
import { getAssetPath } from './helpers.js';
import './cta.js';

import './style.css';

window.pc = pc;

function startViewer() {
    var viewer = new Viewer(document.getElementById("application-canvas"), onSceneReset, onAnimationsLoaded, onMorphTargetsLoaded);
    registerElementEvents(viewer);
    window.viewer = viewer;
}

pc.basisDownload(
    getAssetPath('lib/basis/basis.wasm.js'),
    getAssetPath('lib/basis/basis.wasm.wasm'),
    getAssetPath('lib/basis/basis.js'),
    function () {
        if (wasmSupported()) {
            loadWasmModuleAsync('DracoDecoderModule',
                                getAssetPath('lib/draco/draco.wasm.js'),
                                getAssetPath('lib/draco/draco.wasm.wasm'),
                                startViewer);
        } else {
            loadWasmModuleAsync('DracoDecoderModule',
                                getAssetPath('lib/draco/draco.js'),
                                '',
                                startViewer);
        }
    }
);
