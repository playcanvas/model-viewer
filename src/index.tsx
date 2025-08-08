import { Observer } from '@playcanvas/observer';
import { version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui/react';
import {
    basisInitialize,
    createGraphicsDevice,
    Vec3,
    WasmModule,
    version as engineVersion,
    revision as engineRevision
} from 'playcanvas';

import { initMaterials } from './material';
import { ObserverData } from './types';
import initializeUI from './ui';
import Viewer from './viewer';
import './style.scss';
import { version as modelViewerVersion } from '../package.json';
import { DummyWebGPU } from './dummy-webgpu';

// Permit some additional properties to be set on the window
declare global {
    interface LaunchParams {
        readonly files: FileSystemFileHandle[];
    }
    interface Window {
        launchQueue: {
            setConsumer: (callback: (launchParams: LaunchParams) => void) => void;
        };
        pc: any;
        viewer: Viewer;
        webkit?: any;
    }
}

const skyboxes = [
    { label: 'Abandoned Tank Farm', url: './skybox/abandoned_tank_farm_01_2k.hdr' },
    { label: 'Adam\'s Place Bridge', url: './skybox/adams_place_bridge_2k.hdr' },
    { label: 'Artist Workshop', url: './skybox/artist_workshop_2k.hdr' },
    { label: 'Ballroom', url: './skybox/ballroom_2k.hdr' },
    { label: 'Circus Arena', url: './skybox/circus_arena_2k.hdr' },
    { label: 'Colorful Studio', url: './skybox/colorful_studio.hdr' },
    { label: 'Golf Course Sunrise', url: './skybox/golf_course_sunrise_2k.hdr' },
    { label: 'Helipad', url: './skybox/Helipad_equi.png' },
    { label: 'Kloppenheim', url: './skybox/kloppenheim_02_2k.hdr' },
    { label: 'Lebombo', url: './skybox/lebombo_2k.hdr' },
    { label: 'Outdoor Umbrellas', url: './skybox/outdoor_umbrellas_2k.hdr' },
    { label: 'Paul Lobe Haus', url: './skybox/paul_lobe_haus_2k.hdr' },
    { label: 'Reinforced Concrete', url: './skybox/reinforced_concrete_01_2k.hdr' },
    { label: 'Rural Asphalt Road', url: './skybox/rural_asphalt_road_2k.hdr' },
    { label: 'Spruit Sunrise', url: './skybox/spruit_sunrise_2k.hdr' },
    { label: 'Studio Small', url: './skybox/studio_small_03_2k.hdr' },
    { label: 'Venice Sunset', url: './skybox/venice_sunset_1k.hdr' },
    { label: 'Vignaioli Night', url: './skybox/vignaioli_night_2k.hdr' },
    { label: 'Wooden Motel', url: './skybox/wooden_motel_2k.hdr' }
];

const observerData: ObserverData = {
    ui: {
        fullscreen: false,
        active: null,
        spinner: false,
        error: null
    },
    camera: {
        fov: 40,
        tonemapping: 'Linear',
        pixelScale: 1,
        multisampleSupported: true,
        multisample: true,
        hq: true,
        mode: 'orbit'
    },
    skybox: {
        value: 'Paul Lobe Haus',
        options: JSON.stringify(['None'].concat(skyboxes.map(s => s.label)).map(l => ({ v: l, t: l }))),
        exposure: 0,
        rotation: 0,
        background: 'Infinite Sphere',
        backgroundColor: { r: 0.4, g: 0.45, b: 0.5 },
        blur: 1,
        domeProjection: {
            domeRadius: 20,
            tripodOffset: 0.1
        }
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
        intensity: 0.4
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
    runtime: {
        activeDeviceType: '',
        viewportWidth: 0,
        viewportHeight: 0,
        xrSupported: false,
        xrActive: false
    },
    morphs: null,
    enableWebGPU: false,
    centerScene: false
};

const saveOptions = (observer: Observer, name: string) => {
    const options = observer.json() as any;
    window.localStorage.setItem(`model-viewer-${name}`, JSON.stringify({
        camera: options.camera,
        skybox: options.skybox,
        light: options.light,
        debug: options.debug,
        shadowCatcher: options.shadowCatcher,
        enableWebGPU: options.enableWebGPU
    }));
};

const loadOptions = (observer: Observer, name: string, skyboxUrls: Map<string, string>) => {
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

// print out versions of dependent packages
console.log(`Model Viewer v${modelViewerVersion} | PCUI v${pcuiVersion} (${pcuiRevision}) | PlayCanvas Engine v${engineVersion} (${engineRevision})`);

const main = () => {
    // initialize the apps state
    const observer: Observer = new Observer(observerData);

    // global url
    const url = new URL(window.location.href);

    initMaterials();

    basisInitialize({
        glueUrl: 'static/lib/basis/basis.wasm.js',
        wasmUrl: 'static/lib/basis/basis.wasm.wasm',
        fallbackUrl: 'static/lib/basis/basis.js',
        lazyInit: true
    });

    WasmModule.setConfig('DracoDecoderModule', {
        glueUrl: 'static/lib/draco/draco.wasm.js',
        wasmUrl: 'static/lib/draco/draco.wasm.wasm',
        fallbackUrl: 'static/lib/draco/draco.js'
    });

    const skyboxUrls = new Map(skyboxes.map(s => [s.label, `static/${s.url}`]));

    // hide / show spinner when loading files
    observer.on('ui.spinner:set', (value: boolean) => {
        const spinner = document.getElementById('spinner');
        if (value) {
            spinner.classList.remove('pcui-hidden');
        } else {
            spinner.classList.add('pcui-hidden');
        }
    });

    if (!url.searchParams.has('default')) {
        // handle options
        loadOptions(observer, 'uistate', skyboxUrls);

        observer.on('*:set', () => {
            saveOptions(observer, 'uistate');
        });
    }

    // create react ui
    initializeUI(observer);

    // create the canvas
    const canvas = document.getElementById('application-canvas') as HTMLCanvasElement;

    // create the graphics device
    createGraphicsDevice(canvas, {
        deviceTypes: url.searchParams.has('webgpu') || observer.get('enableWebGPU') ? ['webgpu'] : [],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: true,
        powerPreference: 'high-performance'
    }).then((device) => {
        observer.set('runtime.activeDeviceType', device.deviceType);

        // create viewer instance
        const viewer = new Viewer(canvas, device, observer, skyboxUrls);

        // make available globally
        window.viewer = viewer;

        // get list of files, decode them
        const files: { url: string, filename: string }[] = [];

        // handle OS-based file association in PWA mode
        const promises: Promise<any>[] = [];
        if ('launchQueue' in window) {
            window.launchQueue.setConsumer((launchParams: LaunchParams) => {
                for (const fileHandle of launchParams.files) {
                    promises.push(
                        fileHandle.getFile().then((file) => {
                            files.push({ url: URL.createObjectURL(file), filename: file.name });
                        })
                    );
                }
            });
        }

        // handle search params
        for (const [key, value] of url.searchParams) {
            switch (key) {
                case 'load':
                case 'assetUrl': {
                    const url = decodeURIComponent(value);
                    files.push({ url, filename: url });
                    break;
                }
                case 'cameraPosition': {
                    const pos = value.split(',').map(Number);
                    if (pos.length === 3) {
                        viewer.initialCameraPosition = new Vec3(pos);
                    }
                    break;
                }
                case 'cameraFocus': {
                    const pos = value.split(',').map(Number);
                    if (pos.length === 3) {
                        viewer.initialCameraFocus = new Vec3(pos);
                    }
                    break;
                }
                case 'dummyWebGPU': {
                    const dummy = new DummyWebGPU(viewer.app);
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

        Promise.all(promises).then(() => {
            if (files.length > 0) {
                viewer.loadFiles(files);
            }
        });
    });
};

// start main
main();
