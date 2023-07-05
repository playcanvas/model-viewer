import {
    basisInitialize,
    shaderChunks,
    Http,
    WasmModule
} from 'playcanvas';
import { Observer } from '@playcanvas/observer';

import { getAssetPath } from './helpers';
import { Option, ObserverData } from './types';
import { initMaterials } from './material';
import initializeUI from './ui';
import Viewer from './viewer';
import './style.scss';

import { version as modelViewerVersion } from '../package.json';
import { version as pcuiVersion, revision as pcuiRevision } from 'pcui';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

// print out versions of dependent packages
console.log(`Model Viewer v${modelViewerVersion} | PCUI v${pcuiVersion} (${pcuiRevision}) | PlayCanvas Engine v${engineVersion} (${engineRevision})`);

// Permit some additional properties to be set on the window
declare global {
    interface Window {
        pc: any;
        viewer: Viewer;
        webkit?: any;
    }
}

shaderChunks.debugOutputPS = `
#ifdef DEBUG_ALBEDO_PASS
gl_FragColor = vec4(gammaCorrectOutput(litShaderArgs.albedo), 1.0);
#endif

#ifdef DEBUG_UV0_PASS
gl_FragColor = vec4(litShaderArgs.albedo, 1.0);
#endif

#ifdef DEBUG_WORLD_NORMAL_PASS
gl_FragColor = vec4(litShaderArgs.worldNormal * 0.5 + 0.5, 1.0);
#endif

#ifdef DEBUG_OPACITY_PASS
gl_FragColor = vec4(vec3(litShaderArgs.opacity) , 1.0);
#endif

#ifdef DEBUG_SPECULARITY_PASS
gl_FragColor = vec4(litShaderArgs.specularity, 1.0);
#endif

#ifdef DEBUG_GLOSS_PASS
gl_FragColor = vec4(vec3(litShaderArgs.gloss) , 1.0);
#endif

#ifdef DEBUG_METALNESS_PASS
gl_FragColor = vec4(vec3(litShaderArgs.metalness) , 1.0);
#endif

#ifdef DEBUG_AO_PASS
gl_FragColor = vec4(gammaCorrectOutput(vec3(litShaderArgs.ao)), 1.0);
#endif

#ifdef DEBUG_EMISSION_PASS
gl_FragColor = vec4(litShaderArgs.emission, 1.0);
#endif
`;

interface Skybox {
    url: string,
    label: string
}

const observerData: ObserverData = {
    ui: {
        active: null
    },
    camera: {
        fov: 40,
        tonemapping: 'Linear',
        pixelScale: 1,
        multisampleSupported: true,
        multisample: true,
        hq: true
    },
    skybox: {
        value: getAssetPath('./skybox/adams_place_bridge_2k.hdr'),
        options: null,
        default: null,
        exposure: 0,
        rotation: 0,
        background: 'Infinite Sphere',
        backgroundColor: { r: 0.4, g: 0.45, b: 0.5 },
        blur: 0,
        domeProjection: {
            domeRadius: 20,
            domeOffset: 0.4,
            tripodOffset: 0.1
        },
    },
    light: {
        enabled: false,
        color: { r: 1, g: 1, b: 1 },
        intensity: 1,
        follow: false,
        shadow: false
    },
    shadowCatcher: {
        enabled: false,
        intensity: 0.4,
    },
    debug: {
        renderMode: 'default',
        stats: false,
        wireframe: false,
        wireframeColor: { r: 0, g: 0, b: 0 },
        bounds: false,
        skeleton: false,
        axes: false,
        grid: true,
        normals: 0
    },
    animation: {
        playing: false,
        speed: 1.0,
        transition: 0.1,
        loops: 1,
        list: '[]',
        progress: 0,
        selectedTrack: 'ALL_TRACKS'
    },
    scene: {
        urls: [],
        filenames: [],
        nodes: '[]',
        selectedNode: {
            path: '',
            name: null,
            position: {
                0: 0,
                1: 0,
                2: 0
            },
            rotation: {
                0: 0,
                1: 0,
                2: 0,
                3: 0
            },
            scale: {
                0: 0,
                1: 0,
                2: 0
            }
        },
        meshCount: null,
        materialCount: null,
        textureCount: null,
        vertexCount: null,
        primitiveCount: null,
        textureVRAM: null,
        meshVRAM: null,
        bounds: null,
        variant: {
            selected: 0
        },
        variants: {
            list: '[]'
        },
        loadTime: null
    },
    morphs: null,
    spinner: false,
    error: null,
    xrSupported: false,
    xrActive: false
};

// initialize the apps state
const observer: Observer = new Observer(observerData);

const saveOptions = (name: string) => {
    const options = observer.json();
    window.localStorage.setItem(`model-viewer-${name}`, JSON.stringify({
        camera: options.camera,
        skybox: options.skybox,
        light: options.light,
        debug: options.debug
    }));
};

const loadOptions = (name: string) => {
    const loadRec = (path: string, value:any) => {
        const filter = ['skybox.options'];
        if (filter.indexOf(path) !== -1) {
            return;
        }
        if (typeof value === 'object') {
            Object.keys(value).forEach((k) => {
                loadRec(path ? `${path}.${k}` : k, value[k]);
            });
        } else {
            const notSticky = ['debug.renderMode'];
            if (observer.has(path) && notSticky.indexOf(path) === -1) {
                observer.set(path, value);
            }
        }
    };

    const options = window.localStorage.getItem(`model-viewer-${name}`);
    if (options) {
        try {
            loadRec('', JSON.parse(options));
        } catch { }
    }
};

initMaterials();
initializeUI(observer);

basisInitialize({
    glueUrl: getAssetPath('lib/basis/basis.wasm.js'),
    wasmUrl: getAssetPath('lib/basis/basis.wasm.wasm'),
    fallbackUrl: getAssetPath('lib/basis/basis.js'),
    lazyInit: true
});

// @ts-ignore
WasmModule.setConfig('DracoDecoderModule', {
    glueUrl: getAssetPath('lib/draco/draco.wasm.js'),
    wasmUrl: getAssetPath('lib/draco/draco.wasm.wasm'),
    fallbackUrl: getAssetPath('lib/draco/draco.js')
});

// hide / show spinner when loading files
observer.on('spinner:set', (value: boolean) => {
    const spinner = document.getElementById('spinner');
    if (value) {
        spinner.classList.remove('pcui-hidden');
    } else {
        spinner.classList.add('pcui-hidden');
    }
});

const url = getAssetPath("asset_manifest.json");
new Http().get(url, {
    cache: true,
    responseType: "text",
    retry: false
}, function (err: string, result: { skyboxes: Array<Skybox>, defaultSkybox: string }) {
    if (err) {
        console.warn(err);
    } else {
        const skyboxes = result.skyboxes;
        const skyboxOptions: Array<Option> = [{
            v: 'None', t: 'None'
        }];
        skyboxes.forEach((skybox: Skybox) => {
            skyboxOptions.push({ v: getAssetPath(skybox.url), t: skybox.label });
        });
        const skyboxData = observer.get('skybox');
        skyboxData.options = JSON.stringify(skyboxOptions);
        skyboxData.default = getAssetPath(result.defaultSkybox);
        observer.set('skybox', skyboxData);
        loadOptions('uistate');

        observer.on('*:set', () => {
            saveOptions('uistate');
        });

        const canvas = document.getElementById("application-canvas") as HTMLCanvasElement;
        window.viewer = new Viewer(canvas, observer);
        window.viewer.handleUrlParams();
    }
}
);
