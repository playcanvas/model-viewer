import {
    basisInitialize,
    Vec3,
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
        value: 'Paul Lobe Haus',
        options: null,
        exposure: 0,
        rotation: 0,
        background: 'Infinite Sphere',
        backgroundColor: { r: 0.4, g: 0.45, b: 0.5 },
        blur: 1,
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

// global url
const url = new URL(window.location.href);

// initialize the apps state
const observer: Observer = new Observer(observerData);

const saveOptions = (name: string) => {
    const options = observer.json();
    window.localStorage.setItem(`model-viewer-${name}`, JSON.stringify({
        camera: options.camera,
        skybox: options.skybox,
        light: options.light,
        debug: options.debug,
        shadowCatcher: options.shadowCatcher
    }));
};

const loadOptions = (name: string, skyboxUrls: Map<string, string>) => {
    const filter = ['skybox.options', 'debug.renderMode'];

    const loadRec = (path: string, value:any) => {
        if (filter.indexOf(path) !== -1) {
            return;
        }

        if (typeof value === 'object') {
            Object.keys(value).forEach((k) => {
                loadRec(path ? `${path}.${k}` : k, value[k]);
            });
        } else {
            if (path !== 'skybox.value' || value === 'None' || skyboxUrls.has(value)) {
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

const main = (skyboxUrls: Map<string, string>) => {
    if (!url.searchParams.has('default')) {
        // handle options
        loadOptions('uistate', skyboxUrls);

        observer.on('*:set', () => {
            saveOptions('uistate');
        });
    }

    // create the canvas
    const canvas = document.getElementById("application-canvas") as HTMLCanvasElement;

    // create viewer instance
    const viewer = new Viewer(canvas, observer, skyboxUrls);

    // make available globally
    window.viewer = viewer;

    // get list of files, decode them
    const files = [];

    // handle search params
    for (const [key, value] of url.searchParams) {
        switch (key) {
            case 'load':
            case 'assetUrl': {
                const url = decodeURIComponent(value);
                files.push({ url, filename: url });
                break;
            };
            case 'cameraPosition': {
                const pos = value.split(',').map(Number);
                if (pos.length === 3) {
                    viewer.initialCameraPosition = new Vec3(pos);
                }
                break;
            }
            default: {
                if (observer.has(key)) {
                    switch (typeof observer.get(key)) {
                        case 'boolean':
                            observer.set(key, value.toLowerCase() === 'true');
                            break;
                        case 'number':
                            observer.set(key, Number(value));
                            break;
                        default:
                            observer.set(key, decodeURIComponent(value));
                            break;
                    }
                }
                break;
            }
        }
    }

    if (files.length > 0) {
        viewer.loadFiles(files);
    }
};

const skyboxes = [
    { label: "Abandoned Tank Farm", url: "./skybox/abandoned_tank_farm_01_2k.hdr" },
    { label: "Adam's Place Bridge", url: "./skybox/adams_place_bridge_2k.hdr" },
    { label: "Artist Workshop", url: "./skybox/artist_workshop_2k.hdr" },
    { label: "Ballroom", url: "./skybox/ballroom_2k.hdr" },
    { label: "Circus Arena", url: "./skybox/circus_arena_2k.hdr" },
    { label: "Colorful Studio", url: "./skybox/colorful_studio.hdr" },
    { label: "Golf Course Sunrise", url: "./skybox/golf_course_sunrise_2k.hdr" },
    { label: "Helipad", url: "./skybox/Helipad_equi.png" },
    { label: "Kloppenheim", url: "./skybox/kloppenheim_02_2k.hdr" },
    { label: "Lebombo", url: "./skybox/lebombo_2k.hdr" },
    { label: "Outdoor Umbrellas", url: "./skybox/outdoor_umbrellas_2k.hdr" },
    { label: "Paul Lobe Haus", url: "./skybox/paul_lobe_haus_2k.hdr" },
    { label: "Reinforced Concrete", url: "./skybox/reinforced_concrete_01_2k.hdr" },
    { label: "Rural Asphalt Road", url: "./skybox/rural_asphalt_road_2k.hdr" },
    { label: "Spruit Sunrise", url: "./skybox/spruit_sunrise_2k.hdr" },
    { label: "Studio Small", url: "./skybox/studio_small_03_2k.hdr" },
    { label: "Venice Sunset", url: "./skybox/venice_sunset_1k.hdr" },
    { label: "Vignaioli Night", url: "./skybox/vignaioli_night_2k.hdr" },
    { label: "Wooden Motel", url: "./skybox/wooden_motel_2k.hdr" }
];

const skyboxUrls = new Map<string, string>();
const skyboxOptions: Array<Option> = [{
    v: 'None', t: 'None'
}];

skyboxes.forEach((skybox: Skybox) => {
    skyboxUrls.set(skybox.label, getAssetPath(skybox.url));
    skyboxOptions.push({ v: skybox.label, t: skybox.label });
});

const skyboxData = observer.get('skybox');
skyboxData.options = JSON.stringify(skyboxOptions);
observer.set('skybox', skyboxData);

// start main
main(skyboxUrls);
