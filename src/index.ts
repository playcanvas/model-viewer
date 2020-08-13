import * as pc from 'playcanvas';

import { wasmSupported, loadWasmModuleAsync } from '../lib/wasm-loader.js';

import Viewer from './viewer';
import { onSceneReset, onAnimationsLoaded, onMorphTargetsLoaded, registerElementEvents } from './controls';
import { getAssetPath } from './helpers';
import './cta';

import './style.css';

// @ts-ignore: Assign global pc
window.pc = pc;

function startViewer() {
    var viewer = new Viewer(document.getElementById("application-canvas"), onSceneReset, onAnimationsLoaded, onMorphTargetsLoaded);
    registerElementEvents(viewer);
    // @ts-ignore: Assign global viewer
    window.viewer = viewer;
}

// @ts-ignore: Not defined in pc
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
