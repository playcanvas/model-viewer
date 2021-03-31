import * as pc from 'playcanvas';
import React from 'react';
import ReactDOM from 'react-dom';
// @ts-ignore: library file import
import { wasmSupported, loadWasmModuleAsync } from 'lib/wasm-loader.js';

import Viewer from './viewer';
// import { Skybox, setSkyboxes } from './controls';
import Controls from './controls';
import LoadControls from './load-ui';
import ErrorBox from './errors';
// @ts-ignore: library file import
import { Observer } from '@playcanvas/pcui/pcui-binding';
// @ts-ignore: library file import
import { Container, Spinner } from '@playcanvas/pcui/pcui-react';
import { getAssetPath, getRootPath } from './helpers';
import { Skybox, Option } from './types';

import './style.css';
import './fonts.css';

// initialize the apps state
const observer: Observer = new Observer({
    show: {
        stats: false,
        wireframe: false,
        bounds: false,
        skeleton: false,
        normals: 0,
        fov: 75
    },
    lighting: {
        direct: 1,
        env: 1,
        tonemapping: 'ACES',
        skybox: {
            mip: 1,
            value: null,
            options: JSON.stringify([
                { v: null, t: 'None' }
            ]),
            default: null
        },
        rotation: 0
    },
    animation: {
        playing: false,
        speed: 1.0,
        transition: 0.1,
        loops: 1,
        graphs: false,
        list: '[]',
        progress: 0,
        selectedTrack: 'ALL_TRACKS'
    },
    model: {
        nodes: '[]',
        selectedNode: {
            path: '',
            name: null,
            position: '[0, 0, 0]',
            rotation: '[0, 0, 0]',
            scale: '[0, 0, 0]'
        },
        meshCount: null,
        vertexCount: null,
        primitiveCount: null
    },
    morphTargets: null,
    spinner: false,
    error: null
});

// render out the app
ReactDOM.render(
    <div id="flex-container">
        <Container id="panel" resizable='right' resizeMin={220} resizeMax={600} onResize={() => observer.emit('canvasResized')}>
            <div id="panel-toggle"></div>
            <div className="header" style={{ display: 'none' }}><a href={getRootPath()}><img src={getAssetPath('playcanvas-logo.png')}/><div><b>PLAY</b>CANVAS <span>viewer</span></div></a></div>
            <Controls observer={observer} />
        </Container>
        <div id='canvas-wrapper'>
            <LoadControls observer={observer} />
            <ErrorBox observer={observer} path='error' />
            <canvas id="application-canvas" />
            <Spinner id="spinner" size={30} hidden={true} />
        </div>
    </div>,
    document.getElementById('app')
);

let awaiting = 2;
function dependencyArrived() {
    if (--awaiting === 0) {
        // @ts-ignore: Assign global viewer
        window.viewer = new Viewer(document.getElementById("application-canvas"), observer);
    }
}

// @ts-ignore: Assign global pc
window.pc = pc;

// @ts-ignore: Not defined in pc
pc.basisSetDownloadConfig(getAssetPath('lib/basis/basis.wasm.js'),
                          getAssetPath('lib/basis/basis.wasm.wasm'),
                          getAssetPath('lib/basis/basis.js'));

// download asset manifest
new pc.Http().get(
    getAssetPath("asset_manifest.json"),
    {
        cache: true,
        responseType: "text",
        retry: false
    },
    function (err: string, result: { skyboxes: Array<Skybox>, defaultSkybox: string }) {
    // (err: string) => {
        if (err) {
            console.warn(err);
        } else {
            const skyboxes = result.skyboxes;
            const skyboxOptions: Array<Option> = [{
                v: null, t: 'None'
            }];
            skyboxes.forEach(function (skybox: Skybox ) {
                skyboxOptions.push({ v: getAssetPath(skybox.url), t: skybox.label });
            });
            const skyboxData = observer.get('lighting.skybox');
            skyboxData.options = JSON.stringify(skyboxOptions);
            skyboxData.default = getAssetPath(result.defaultSkybox);
            observer.set('lighting.skybox', skyboxData);
            dependencyArrived();
        }
    }
);

// hide / show spinner when loading files
observer.on('spinner:set', (value: boolean) => {
    const spinner = document.getElementById('spinner');
    if (value) {
        spinner.classList.remove('pcui-hidden');
    } else {
        spinner.classList.add('pcui-hidden');
    }
});

// initialize draco module
loadWasmModuleAsync('DracoDecoderModule',
                    wasmSupported() ? getAssetPath('lib/draco/draco.wasm.js') : getAssetPath('lib/draco/draco.js'),
                    wasmSupported() ? getAssetPath('lib/draco/draco.wasm.wasm') : '',
                    dependencyArrived);
