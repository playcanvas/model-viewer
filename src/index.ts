import * as pc from 'playcanvas';
// @ts-ignore: library file import
import { wasmSupported, loadWasmModuleAsync } from 'lib/wasm-loader.js';

import Viewer from './viewer';
import { Skybox, setSkyboxes } from './controls';
import { getAssetPath } from './helpers';
import './cta';

import './style.css';

let awaiting = 2;
function dependencyArrived() {
    if (--awaiting === 0) {
        // @ts-ignore: Assign global viewer
        window.viewer = new Viewer(document.getElementById("application-canvas"));
    }
}

// @ts-ignore: Assign global pc
window.pc = pc;

// @ts-ignore: Not defined in pc
pc.basisSetDownloadConfig('lib/basis/basis.wasm.js',
                          'lib/basis/basis.wasm.wasm',
                          'lib/basis/basis.js');

// download asset manifest
new pc.Http().get(
    getAssetPath("asset_manifest.json"),
    {
        cache: true,
        responseType: "text",
        retry: false
    },
    function (err: string, result: { skyboxes: Array<Skybox>, defaultSkybox: string }) {
        if (err) {
            console.warn(err);
        } else {
            setSkyboxes(result);
            dependencyArrived();
        }
    }
);

// initialize draco module
loadWasmModuleAsync('DracoDecoderModule',
                    wasmSupported() ? getAssetPath('lib/draco/draco.wasm.js') : getAssetPath('lib/draco/draco.js'),
                    wasmSupported() ? getAssetPath('lib/draco/draco.wasm.wasm') : '',
                    dependencyArrived);
