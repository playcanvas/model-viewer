import * as pc from 'playcanvas';

import { wasmSupported, loadWasmModuleAsync } from '../lib/wasm-loader.js';

import Viewer from './viewer';
import { Skybox, setSkyboxes } from './controls';
import { getAssetPath } from './helpers';
import './cta';

import './style.css';

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
            loadWasmModuleAsync('DracoDecoderModule',
                                wasmSupported() ? getAssetPath('lib/draco/draco.wasm.js') : getAssetPath('lib/draco/draco.js'),
                                wasmSupported() ? getAssetPath('lib/draco/draco.wasm.wasm') : '',
                                function () {
                                    // @ts-ignore: Assign global viewer
                                    window.viewer = new Viewer(document.getElementById("application-canvas"));
                                });
        }
    }
);
