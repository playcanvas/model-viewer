import {
    ADDRESS_CLAMP_TO_EDGE,
    FILLMODE_NONE,
    FILTER_LINEAR,
    FILTER_LINEAR_MIPMAP_LINEAR,
    FILTER_NEAREST,
    LAYERID_DEPTH,
    LAYERID_SKYBOX,
    PIXELFORMAT_DEPTH,
    PIXELFORMAT_RGBA8,
    RENDERSTYLE_SOLID,
    RENDERSTYLE_WIREFRAME,
    RESOLUTION_AUTO,
    TEXTURETYPE_DEFAULT,
    TEXTURETYPE_RGBM,
    TONEMAP_LINEAR,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_ACES,
    XRSPACE_LOCALFLOOR,
    XRTYPE_AR,
    math,
    path,
    reprojectTexture,
    AnimEvents,
    AnimTrack,
    Asset,
    BoundingBox,
    Color,
    Entity,
    EnvLighting,
    GraphNode,
    Mat4,
    Mesh,
    MeshInstance,
    MorphInstance,
    MorphTarget,
    Mouse,
    Quat,
    RenderComponent,
    RenderTarget,
    Texture,
    TouchDevice,
    Vec3,
    Vec4,
    WebglGraphicsDevice
} from 'playcanvas';

import { App } from './app';

import { Observer } from '@playcanvas/observer';
// @ts-ignore: library file import
import { MiniStats } from 'playcanvas-extras';
// @ts-ignore: library file import
// import * as VoxParser from 'playcanvas/scripts/parsers/vox-parser.js';
import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';
import { getAssetPath } from './helpers';
import { DropHandler } from './drop-handler';
import { MorphTargetData, File, HierarchyNode } from './types';
import { DebugLines } from './debug';
import { Multiframe } from './multiframe';
import { ReadDepth } from './read-depth';
import { OrbitCamera, OrbitCameraInputMouse, OrbitCameraInputTouch } from './orbit-camera';
import { PngExporter } from './png-exporter.js';

// model filename extensions
const modelExtensions = ['.gltf', '.glb', '.vox'];

const defaultSceneBounds = new BoundingBox(new Vec3(0, 1, 0), new Vec3(1, 1, 1));

class Viewer {
    app: App;
    dropHandler: DropHandler;
    pngExporter: PngExporter = null;
    prevCameraMat: Mat4;
    camera: Entity;
    orbitCamera: OrbitCamera;
    orbitCameraInputMouse: OrbitCameraInputMouse;
    orbitCameraInputTouch: OrbitCameraInputTouch;
    cameraFocusBBox: BoundingBox | null;
    cameraPosition: Vec3 | null;
    light: Entity;
    sceneRoot: Entity;
    debugRoot: Entity;
    entities: Array<Entity>;
    entityAssets: Array<{entity: Entity, asset: Asset }>;
    assets: Array<Asset>;
    meshInstances: Array<MeshInstance>;
    animTracks: Array<AnimTrack>;
    animationMap: Record<string, string>;
    firstFrame: boolean;
    skyboxLoaded: boolean;
    animSpeed: number;
    animTransition: number;
    animLoops: number;
    showWireframe: boolean;
    showBounds: boolean;
    showSkeleton: boolean;
    showAxes: boolean;
    showGrid: boolean;
    normalLength: number;
    skyboxMip: number;
    dirtyWireframe: boolean;
    dirtyBounds: boolean;
    dirtySkeleton: boolean;
    dirtyGrid: boolean;
    dirtyNormals: boolean;
    sceneBounds: BoundingBox;
    debugBounds: DebugLines;
    debugSkeleton: DebugLines;
    debugGrid: DebugLines;
    debugNormals: DebugLines;
    // @ts-ignore
    miniStats: MiniStats;
    observer: Observer;
    suppressAnimationProgressUpdate: boolean;

    selectedNode: GraphNode | null;

    multiframe: Multiframe | null;
    multiframeBusy = false;
    readDepth: ReadDepth = null;
    cursorWorld = new Vec3();

    loadTimestamp?: number = null;

    constructor(canvas: HTMLCanvasElement, observer: Observer) {
        // create the application
        const app = new App(canvas, {
            mouse: new Mouse(canvas),
            touch: new TouchDevice(canvas),
            graphicsDeviceOptions: {
                preferWebGl2: true,
                alpha: true,
                // the following aren't needed since we're rendering to an offscreen render target
                // and would only result in extra memory usage.
                antialias: false,
                depth: false,
                preserveDrawingBuffer: true
            }
        });
        this.app = app;

        // set xr supported
        observer.set('xrSupported', false);
        observer.set('xrActive', false);

        // xr is supported
        if (this.app.xr.supported) {
            app.xr.on("available:" + XRTYPE_AR, (available) => {
                observer.set('xrSupported', !!available);
            });

            app.xr.on("start", () => {
                console.log("Immersive AR session has started");
                observer.set('xrActive', true);

                this.app.scene.layers.getLayerById(LAYERID_SKYBOX).enabled = false;
            });

            app.xr.on("end", () => {
                console.log("Immersive AR session has ended");
                observer.set('xrActive', false);
                this.setSkyboxMip(this.observer.get('lighting.env.skyboxMip'));
            });
        }

        // monkeypatch the mouse and touch input devices to ignore touch events
        // when they don't originate from the canvas.
        const origMouseHandler = app.mouse._moveHandler;
        app.mouse.detach();
        app.mouse._moveHandler = (event: MouseEvent) => {
            if (event.target === canvas) {
                origMouseHandler(event);
            }
        };
        app.mouse.attach(canvas);

        const origTouchHandler = app.touch._moveHandler;
        app.touch.detach();
        app.touch._moveHandler = (event: MouseEvent) => {
            if (event.target === canvas) {
                origTouchHandler(event);
            }
        };
        app.touch.attach(canvas);

        // @ts-ignore
        const multisampleSupported = app.graphicsDevice.maxSamples > 1;
        observer.set('render.multisampleSupported', multisampleSupported);
        observer.set('render.multisample', multisampleSupported && observer.get('render.multisample'));

        // register vox support
        // VoxParser.registerVoxParser(app);

        // create the exporter
        this.pngExporter = new PngExporter();

        // create drop handler
        this.dropHandler = new DropHandler((files: Array<File>, resetScene: boolean) => {
            this.loadFiles(files, resetScene);
            if (resetScene) {
                this.observer.set('glbUrl', '');
            }
        });

        // Set the canvas to fill the window and automatically change resolution to be the same as the canvas size
        const canvasSize = this.getCanvasSize();
        app.setCanvasFillMode(FILLMODE_NONE, canvasSize.width, canvasSize.height);
        app.setCanvasResolution(RESOLUTION_AUTO);
        window.addEventListener("resize", () => {
            this.resizeCanvas();
        });

        // Depth layer is where the framebuffer is copied to a texture to be used in the following layers.
        // Move the depth layer to take place after World and Skydome layers, to capture both of them.
        const depthLayer = app.scene.layers.getLayerById(LAYERID_DEPTH);
        app.scene.layers.remove(depthLayer);
        app.scene.layers.insertOpaque(depthLayer, 2);

        // create the orbit camera
        const camera = new Entity("Camera");
        camera.addComponent("camera", {
            fov: 75,
            frustumCulling: true,
            clearColor: new Color(0, 0, 0, 0)
        });
        camera.camera.requestSceneColorMap(true);

        this.orbitCamera = new OrbitCamera(camera, 0.25);
        this.orbitCameraInputMouse = new OrbitCameraInputMouse(this.app, this.orbitCamera);
        this.orbitCameraInputTouch = new OrbitCameraInputTouch(this.app, this.orbitCamera);

        this.orbitCamera.focalPoint.snapto(new Vec3(0, 1, 0));

        app.root.addChild(camera);

        // create the light
        const light = new Entity();
        light.addComponent("light", {
            type: "directional",
            color: new Color(1, 1, 1),
            castShadows: true,
            intensity: 1,
            shadowBias: 0.2,
            shadowDistance: 5,
            normalOffsetBias: 0.05,
            shadowResolution: 2048
        });
        light.setLocalEulerAngles(45, 30, 0);
        app.root.addChild(light);

        // disable autorender
        app.autoRender = false;
        this.prevCameraMat = new Mat4();
        app.on('update', this.update, this);
        app.on('prerender', this.onPrerender, this);
        app.on('postrender', this.onPostrender, this);
        app.on('frameend', this.onFrameend, this);

        // create the scene and debug root nodes
        const sceneRoot = new Entity("sceneRoot", app);
        app.root.addChild(sceneRoot);

        const debugRoot = new Entity("debugRoot", app);
        app.root.addChild(debugRoot);

        // store app things
        this.camera = camera;
        this.cameraFocusBBox = null;
        this.cameraPosition = null;
        this.light = light;
        this.sceneRoot = sceneRoot;
        this.debugRoot = debugRoot;
        this.entities = [];
        this.entityAssets = [];
        this.assets = [];
        this.meshInstances = [];
        this.animTracks = [];
        this.animationMap = { };
        this.firstFrame = false;
        this.skyboxLoaded = false;

        this.animSpeed = observer.get('animation.speed');
        this.animTransition = observer.get('animation.transition');
        this.animLoops = observer.get('animation.loops');
        this.showWireframe = observer.get('show.wireframe');
        this.showBounds = observer.get('show.bounds');
        this.showSkeleton = observer.get('show.skeleton');
        this.showAxes = observer.get('show.axes');
        this.normalLength = observer.get('show.normals');
        this.setTonemapping(observer.get('lighting.tonemapping'));
        this.setBackgroundColor(observer.get('lighting.env.backgroundColor'));

        this.dirtyWireframe = false;
        this.dirtyBounds = false;
        this.dirtySkeleton = false;
        this.dirtyGrid = false;
        this.dirtyNormals = false;

        this.sceneBounds = null;

        this.debugBounds = new DebugLines(app, camera);
        this.debugSkeleton = new DebugLines(app, camera);
        this.debugGrid = new DebugLines(app, camera, false);
        this.debugNormals = new DebugLines(app, camera, false);

        // construct ministats, default off
        this.miniStats = new MiniStats(app);
        this.miniStats.enabled = observer.get('show.stats');
        this.observer = observer;

        const device = this.app.graphicsDevice as WebglGraphicsDevice;

        // multiframe
        this.multiframe = new Multiframe(device, this.camera.camera, 5);

        // initialize control events
        this.bindControlEvents();

        this.resizeCanvas();

        // construct the depth reader
        this.readDepth = new ReadDepth(device);
        this.cursorWorld = new Vec3();

        // double click handler
        canvas.addEventListener('dblclick', (event) => {
            const camera = this.camera.camera;
            const x = event.offsetX / canvas.clientWidth;
            const y = 1.0 - event.offsetY / canvas.clientHeight;

            // read depth
            const depth = this.readDepth.read(camera.renderTarget.depthBuffer, x, y);

            if (depth < 1) {
                const pos = new Vec4(x, y, depth, 1.0).mulScalar(2.0).subScalar(1.0);            // clip space
                camera.projectionMatrix.clone().invert().transformVec4(pos, pos);                   // homogeneous view space
                pos.mulScalar(1.0 / pos.w);                                                         // perform perspective divide
                this.cursorWorld.set(pos.x, pos.y, pos.z);
                this.camera.getWorldTransform().transformPoint(this.cursorWorld, this.cursorWorld); // world space

                // move camera towards focal point
                this.orbitCamera.focalPoint.goto(this.cursorWorld);
            }
        });

        // start the application
        app.start();
    }

    // extract query params. taken from https://stackoverflow.com/a/21152762
    handleUrlParams() {
        const urlParams: any = {};
        if (location.search) {
            location.search.substring(1).split("&").forEach((item) => {
                const s = item.split("="),
                    k = s[0],
                    v = s[1] && decodeURIComponent(s[1]);
                (urlParams[k] = urlParams[k] || []).push(v);
            });
        }

        // handle load url param
        const loadUrls = (urlParams.load || []).concat(urlParams.assetUrl || []);
        if (loadUrls.length > 0) {
            this.loadFiles(
                loadUrls.map((url: string) => {
                    return { url, filename: url };
                })
            );
        }
        if (loadUrls.length === 1) {
            this.observer.set('glbUrl', loadUrls[0]);
        }

        // set camera position
        if (urlParams.hasOwnProperty('cameraPosition')) {
            const pos = urlParams.cameraPosition[0].split(',').map(Number);
            if (pos.length === 3) {
                this.cameraPosition = new Vec3(pos);
            }
        }
    }

    // collects all mesh instances from entity hierarchy
    private collectMeshInstances(entity: Entity) {
        const meshInstances: Array<MeshInstance> = [];
        if (entity) {
            const components = entity.findComponents("render");
            for (let i = 0; i < components.length; i++) {
                const render = components[i] as RenderComponent;
                if (render.meshInstances) {
                    for (let m = 0; m < render.meshInstances.length; m++) {
                        const meshInstance = render.meshInstances[m];
                        meshInstances.push(meshInstance);
                    }
                }
            }
        }
        return meshInstances;
    }

    private updateMeshInstanceList() {

        this.meshInstances = [];
        for (let e = 0; e < this.entities.length; e++) {
            const meshInstances = this.collectMeshInstances(this.entities[e]);
            this.meshInstances = this.meshInstances.concat(meshInstances);
        }
    }

    // calculate the bounding box of the given mesh
    private static calcMeshBoundingBox(meshInstances: Array<MeshInstance>) {
        const bbox = new BoundingBox();
        for (let i = 0; i < meshInstances.length; ++i) {
            if (i === 0) {
                bbox.copy(meshInstances[i].aabb);
            } else {
                bbox.add(meshInstances[i].aabb);
            }
        }
        return bbox;
    }

    // calculate the bounding box of the graph-node hierarchy
    private static calcHierBoundingBox(rootNode: Entity) {
        const position = rootNode.getPosition();
        let min_x = position.x;
        let min_y = position.y;
        let min_z = position.z;
        let max_x = position.x;
        let max_y = position.y;
        let max_z = position.z;

        const recurse = (node: GraphNode) => {
            const p = node.getPosition();
            if (p.x < min_x) min_x = p.x; else if (p.x > max_x) max_x = p.x;
            if (p.y < min_y) min_y = p.y; else if (p.y > max_y) max_y = p.y;
            if (p.z < min_z) min_z = p.z; else if (p.z > max_z) max_z = p.z;
            for (let i = 0; i < node.children.length; ++i) {
                recurse(node.children[i]);
            }
        };
        recurse(rootNode);

        const result = new BoundingBox();
        result.setMinMax(new Vec3(min_x, min_y, min_z), new Vec3(max_x, max_y, max_z));
        return result;
    }

    // calculate the intersection of the two bounding boxes
    private static calcBoundingBoxIntersection(bbox1: BoundingBox, bbox2: BoundingBox) {
        // bounds don't intersect
        if (!bbox1.intersects(bbox2)) {
            return null;
        }
        const min1 = bbox1.getMin();
        const max1 = bbox1.getMax();
        const min2 = bbox2.getMin();
        const max2 = bbox2.getMax();
        const result = new BoundingBox();
        result.setMinMax(new Vec3(Math.max(min1.x, min2.x), Math.max(min1.y, min2.y), Math.max(min1.z, min2.z)),
                         new Vec3(Math.min(max1.x, max2.x), Math.min(max1.y, max2.y), Math.min(max1.z, max2.z)));
        return result;
    }

    // construct the controls interface and initialize controls
    private bindControlEvents() {
        const controlEvents:any = {
            'render.multisample': this.resizeCanvas.bind(this),
            'render.hq': (enabled: boolean) => {
                this.multiframe.enabled = enabled;
                this.renderNextFrame();
            },
            'render.pixelScale': this.resizeCanvas.bind(this),
            'show.stats': this.setStats.bind(this),
            'show.wireframe': this.setShowWireframe.bind(this),
            'show.bounds': this.setShowBounds.bind(this),
            'show.skeleton': this.setShowSkeleton.bind(this),
            'show.axes': this.setShowAxes.bind(this),
            'show.grid': this.setShowGrid.bind(this),
            'show.normals': this.setNormalLength.bind(this),
            'show.fov': this.setFov.bind(this),

            'lighting.shadow': this.setDirectShadow.bind(this),
            'lighting.direct': this.setDirectLighting.bind(this),
            'lighting.env.value': (value: string) => {
                if (value && value !== 'None') {
                    this.loadFiles([{ url: value, filename: value }]);
                } else {
                    this.clearSkybox();
                }
            },
            'lighting.env.skyboxMip': this.setSkyboxMip.bind(this),
            'lighting.env.exposure': this.setEnvExposure.bind(this),
            'lighting.env.backgroundColor': this.setBackgroundColor.bind(this),
            'lighting.rotation': this.setLightingRotation.bind(this),
            'lighting.tonemapping': this.setTonemapping.bind(this),

            'animation.playing': (playing: boolean) => {
                if (playing) {
                    this.play();
                } else {
                    this.stop();
                }
            },
            'animation.selectedTrack': this.setSelectedTrack.bind(this),
            'animation.speed': this.setSpeed.bind(this),
            'animation.transition': this.setTransition.bind(this),
            'animation.loops': this.setLoops.bind(this),
            'animation.progress': this.setAnimationProgress.bind(this),

            'scene.selectedNode.path': this.setSelectedNode.bind(this),
            'scene.variant.selected': this.setSelectedVariant.bind(this)
        };

        // register control events
        Object.keys(controlEvents).forEach((e) => {
            this.observer.on(`${e}:set`, controlEvents[e]);
            this.observer.set(e, this.observer.get(e), false, false, true);
        });

        this.observer.on('canvasResized', () => {
            this.resizeCanvas();
        });
    }

    private clearSkybox() {
        this.app.scene.envAtlas = null;
        this.app.scene.setSkybox(null);
        this.renderNextFrame();
        this.skyboxLoaded = false;
    }

    // initialize the faces and prefiltered lighting data from the given
    // skybox texture, which is either a cubemap or equirect texture.
    private initSkyboxFromTextureNew(env: Texture) {
        const skybox = EnvLighting.generateSkyboxCubemap(env);
        const lighting = EnvLighting.generateLightingSource(env);
        // The second options parameter should not be necessary but the TS declarations require it for now
        const envAtlas = EnvLighting.generateAtlas(lighting, {});
        lighting.destroy();
        this.app.scene.envAtlas = envAtlas;
        this.app.scene.skybox = skybox;

        this.renderNextFrame();
    }

    // initialize the faces and prefiltered lighting data from the given
    // skybox texture, which is either a cubemap or equirect texture.
    private initSkyboxFromTexture(skybox: Texture) {
        if (EnvLighting) {
            return this.initSkyboxFromTextureNew(skybox);
        }

        const app = this.app;
        const device = app.graphicsDevice;

        const createCubemap = (size: number) => {
            return new Texture(device, {
                name: `skyboxFaces-${size}`,
                cubemap: true,
                width: size,
                height: size,
                type: TEXTURETYPE_RGBM,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                fixCubemapSeams: true,
                mipmaps: false
            });
        };

        const cubemaps = [];

        cubemaps.push(EnvLighting.generateSkyboxCubemap(skybox));

        const lightingSource = EnvLighting.generateLightingSource(skybox);

        // create top level
        const top = createCubemap(128);
        reprojectTexture(lightingSource, top, {
            numSamples: 1
        });
        cubemaps.push(top);

        // generate prefiltered lighting data
        const sizes = [128, 64, 32, 16, 8, 4];
        const specPower = [1, 512, 128, 32, 8, 2];
        for (let i = 1; i < sizes.length; ++i) {
            const level = createCubemap(sizes[i]);
            reprojectTexture(lightingSource, level, {
                numSamples: 1024,
                specularPower: specPower[i],
                distribution: 'ggx'
            });

            cubemaps.push(level);
        }

        lightingSource.destroy();

        // assign the textures to the scene
        app.scene.setSkybox(cubemaps);
        this.renderNextFrame();
    }

    // load the image files into the skybox. this function supports loading a single equirectangular
    // skybox image or 6 cubemap faces.
    private loadSkybox(files: Array<File>) {
        const app = this.app;

        if (files.length !== 6) {
            // load equirectangular skybox
            const textureAsset = new Asset('skybox_equi', 'texture', {
                url: files[0].url,
                filename: files[0].filename
            });
            textureAsset.ready(() => {
                const texture = textureAsset.resource;
                if (texture.type === TEXTURETYPE_DEFAULT && texture.format === PIXELFORMAT_RGBA8) {
                    // assume RGBA data (pngs) are RGBM
                    texture.type = TEXTURETYPE_RGBM;
                }
                this.initSkyboxFromTexture(texture);
            });
            app.assets.add(textureAsset);
            app.assets.load(textureAsset);
        } else {
            // sort files into the correct order based on filename
            const names = [
                ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'],
                ['px', 'nx', 'py', 'ny', 'pz', 'nz'],
                ['right', 'left', 'up', 'down', 'front', 'back'],
                ['right', 'left', 'top', 'bottom', 'forward', 'backward'],
                ['0', '1', '2', '3', '4', '5']
            ];

            const getOrder = (filename: string) => {
                const fn = filename.toLowerCase();
                for (let i = 0; i < names.length; ++i) {
                    const nameList = names[i];
                    for (let j = 0; j < nameList.length; ++j) {
                        if (fn.indexOf(nameList[j] + '.') !== -1) {
                            return j;
                        }
                    }
                }
                return 0;
            };

            const sortPred = (first: File, second: File) => {
                const firstOrder = getOrder(first.filename);
                const secondOrder = getOrder(second.filename);
                return firstOrder < secondOrder ? -1 : (secondOrder < firstOrder ? 1 : 0);
            };

            files.sort(sortPred);

            // construct an asset for each cubemap face
            const faceAssets = files.map((file, index) => {
                const faceAsset = new Asset('skybox_face' + index, 'texture', file);
                app.assets.add(faceAsset);
                app.assets.load(faceAsset);
                return faceAsset;
            });

            // construct the cubemap asset
            const cubemapAsset = new Asset('skybox_cubemap', 'cubemap', null, {
                textures: faceAssets.map(faceAsset => faceAsset.id)
            });
            cubemapAsset.loadFaces = true;
            cubemapAsset.on('load', () => {
                this.initSkyboxFromTexture(cubemapAsset.resource);
            });
            app.assets.add(cubemapAsset);
            app.assets.load(cubemapAsset);
        }
        this.skyboxLoaded = true;
    }

    // load the built in helipad cubemap
    private loadHeliSkybox() {
        const app = this.app;

        const cubemap = new Asset('helipad', 'cubemap', {
            url: getAssetPath("cubemaps/Helipad.dds")
        }, {
            magFilter: FILTER_LINEAR,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            anisotropy: 1,
            type: TEXTURETYPE_RGBM
        });
        cubemap.on('load', () => {
            app.scene.setSkybox(cubemap.resources);
            this.renderNextFrame();
        });
        app.assets.add(cubemap);
        app.assets.load(cubemap);
        this.skyboxLoaded = true;
    }

    private getCanvasSize() {
        return {
            width: document.body.clientWidth - document.getElementById("panel-left").offsetWidth, // - document.getElementById("panel-right").offsetWidth,
            height: document.body.clientHeight
        };
    }

    resizeCanvas() {
        const observer = this.observer;

        const device = this.app.graphicsDevice as WebglGraphicsDevice;
        const canvasSize = this.getCanvasSize();

        device.maxPixelRatio = window.devicePixelRatio;
        this.app.resizeCanvas(canvasSize.width, canvasSize.height);
        this.renderNextFrame();

        const createTexture = (width: number, height: number, format: number) => {
            return new Texture(device, {
                width: width,
                height: height,
                format: format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // out with the old
        const old = this.camera.camera.renderTarget;
        if (old) {
            old.colorBuffer.destroy();
            old.depthBuffer.destroy();
            old.destroy();
        }

        // in with the new
        const pixelScale = observer.get('render.pixelScale');
        const w = Math.floor(canvasSize.width * window.devicePixelRatio / pixelScale);
        const h = Math.floor(canvasSize.height * window.devicePixelRatio / pixelScale);
        const colorBuffer = createTexture(w, h, PIXELFORMAT_RGBA8);
        const depthBuffer = createTexture(w, h, PIXELFORMAT_DEPTH);
        const renderTarget = new RenderTarget({
            colorBuffer: colorBuffer,
            depthBuffer: depthBuffer,
            flipY: false,
            samples: observer.get('render.multisample') ? device.maxSamples : 1,
            autoResolve: false
        });
        this.camera.camera.renderTarget = renderTarget;
    }

    // reset the viewer, unloading resources
    resetScene() {
        const app = this.app;

        this.entities.forEach((entity) => {
            this.sceneRoot.removeChild(entity);
            entity.destroy();
        });
        this.entities = [];
        this.entityAssets = [];

        this.assets.forEach((asset) => {
            app.assets.remove(asset);
            asset.unload();
        });
        this.assets = [];

        this.meshInstances = [];

        // reset animation state
        this.animTracks = [];
        this.animationMap = { };
        this.observer.set('animation.list', '[]');
        this.observer.set('scene.variants.list', '[]');

        this.observer.set('morphs', null);

        this.updateSceneInfo();

        this.dirtyWireframe = this.dirtyBounds = this.dirtySkeleton = this.dirtyGrid = this.dirtyNormals = true;
        this.renderNextFrame();
    }

    updateSceneInfo() {
        let meshCount = 0;
        let vertexCount = 0;
        let primitiveCount = 0;
        let variants: string[] = [];

        // update mesh stats
        this.assets.forEach((asset) => {
            variants = variants.concat(asset.resource.getMaterialVariants());
            asset.resource.renders.forEach((renderAsset: Asset) => {
                renderAsset.resource.meshes.forEach((mesh: Mesh) => {
                    meshCount++;
                    vertexCount += mesh.vertexBuffer.getNumVertices();
                    primitiveCount += mesh.primitive[0].count;
                });
            });
        });

        const mapChildren = function (node: GraphNode): Array<HierarchyNode> {
            return node.children.map((child: GraphNode) => ({
                name: child.name,
                path: child.path,
                children: mapChildren(child)
            }));
        };

        const graph: Array<HierarchyNode> = this.entities.map((entity) => {
            return {
                name: entity.name,
                path: entity.path,
                children: mapChildren(entity)
            };
        });

        // hierarchy
        this.observer.set('scene.nodes', JSON.stringify(graph));

        // mesh stats
        this.observer.set('scene.meshCount', meshCount);
        this.observer.set('scene.vertexCount', vertexCount);
        this.observer.set('scene.primitiveCount', primitiveCount);

        // variant stats
        this.observer.set('scene.variants.list', JSON.stringify(variants));
        this.observer.set('scene.variant.selected', variants[0]);
    }

    downloadPngScreenshot() {
        const device = this.app.graphicsDevice as WebglGraphicsDevice;

        // save the backbuffer
        const w = device.width;
        const h = device.height;
        const data = new Uint8Array(w * h * 4);
        device.setRenderTarget(null);
        device.gl.readPixels(0, 0, w, h, device.gl.RGBA, device.gl.UNSIGNED_BYTE, data);
        this.pngExporter.export('model-viewer.png', new Uint32Array(data.buffer), w, h);
    }

    startXr() {
        if (this.app.xr.isAvailable(XRTYPE_AR)) {
            this.camera.camera.startXr(XRTYPE_AR, XRSPACE_LOCALFLOOR, {
                callback: (err) => {
                    console.log(err);
                }
            });
        }
    }

    // move the camera to view the loaded object
    focusCamera() {
        const camera = this.camera.camera;

        const bbox = this.calcSceneBounds();

        if (this.cameraFocusBBox) {
            const intersection = Viewer.calcBoundingBoxIntersection(this.cameraFocusBBox, bbox);
            if (intersection) {
                const len1 = bbox.halfExtents.length();
                const len2 = this.cameraFocusBBox.halfExtents.length();
                const len3 = intersection.halfExtents.length();
                if ((Math.abs(len3 - len1) / len1 < 0.1) &&
                    (Math.abs(len3 - len2) / len2 < 0.1)) {
                    return;
                }
            }
        }

        // calculate scene bounding box
        const radius = bbox.halfExtents.length();
        const distance = (radius * 1.4) / Math.sin(0.5 * camera.fov * camera.aspectRatio * math.DEG_TO_RAD);

        if (this.cameraPosition) {
            const vec = bbox.center.clone().sub(this.cameraPosition);
            this.orbitCamera.vecToAzimElevDistance(vec, vec);
            this.orbitCamera.azimElevDistance.snapto(vec);
            this.cameraPosition = null;
        } else {
            const aed = this.orbitCamera.azimElevDistance.target.clone();
            aed.z = distance;
            this.orbitCamera.azimElevDistance.snapto(aed);
        }
        this.orbitCamera.focalPoint.snapto(bbox.center);
        camera.nearClip = distance / 100;
        camera.farClip = distance * 10;

        const light = this.light;
        light.light.shadowDistance = distance * 2;

        this.cameraFocusBBox = bbox;
    }

    // load gltf model given its url and list of external urls
    private loadGltf(gltfUrl: File, externalUrls: Array<File>, finishedCallback: (err: string | null, asset: Asset) => void) {

        // provide buffer view callback so we can handle models compressed with MeshOptimizer
        // https://github.com/zeux/meshoptimizer
        const processBufferView = function (gltfBuffer: any, buffers: Array<any>, continuation: (err: string, result: any) => void) {
            if (gltfBuffer.extensions && gltfBuffer.extensions.EXT_meshopt_compression) {
                const extensionDef = gltfBuffer.extensions.EXT_meshopt_compression;

                MeshoptDecoder.ready.then(() => {
                    const byteOffset = extensionDef.byteOffset || 0;
                    const byteLength = extensionDef.byteLength || 0;

                    const count = extensionDef.count;
                    const stride = extensionDef.byteStride;

                    const result = new Uint8Array(count * stride);
                    const source = new Uint8Array(buffers[extensionDef.buffer].buffer,
                                                  buffers[extensionDef.buffer].byteOffset + byteOffset,
                                                  byteLength);

                    MeshoptDecoder.decodeGltfBuffer(result, count, stride, source, extensionDef.mode, extensionDef.filter);

                    continuation(null, result);
                });
            } else {
                continuation(null, null);
            }
        };

        const processImage = function (gltfImage: any, continuation: (err: string, result: any) => void) {
            const u: File = externalUrls.find((url) => {
                return url.filename === path.normalize(gltfImage.uri || "");
            });
            if (u) {
                const textureAsset = new Asset(u.filename, 'texture', {
                    url: u.url,
                    filename: u.filename
                });
                textureAsset.on('load', () => {
                    continuation(null, textureAsset);
                });
                this.app.assets.add(textureAsset);
                this.app.assets.load(textureAsset);
            } else {
                continuation(null, null);
            }
        };

        const postProcessImage = (gltfImage: any, textureAsset: Asset) => {
            // max anisotropy on all textures
            textureAsset.resource.anisotropy = this.app.graphicsDevice.maxAnisotropy;
        };

        const processBuffer = function (gltfBuffer: any, continuation: (err: string, result: any) => void) {
            const u = externalUrls.find((url) => {
                return url.filename === path.normalize(gltfBuffer.uri || "");
            });
            if (u) {
                const bufferAsset = new Asset(u.filename, 'binary', {
                    url: u.url,
                    filename: u.filename
                });
                bufferAsset.on('load', () => {
                    continuation(null, new Uint8Array(bufferAsset.resource));
                });
                this.app.assets.add(bufferAsset);
                this.app.assets.load(bufferAsset);
            } else {
                continuation(null, null);
            }
        };

        const containerAsset = new Asset(gltfUrl.filename, 'container', gltfUrl, null, {
            // @ts-ignore TODO no definition in pc
            bufferView: {
                processAsync: processBufferView.bind(this)
            },
            image: {
                processAsync: processImage.bind(this),
                postprocess: postProcessImage
            },
            buffer: {
                processAsync: processBuffer.bind(this)
            }
        });
        containerAsset.on('load', () => {
            finishedCallback(null, containerAsset);
        });
        containerAsset.on('error', (err : string) => {
            finishedCallback(err, containerAsset);
        });

        this.observer.set('spinner', true);
        this.observer.set('error', null);
        this.clearCta();

        this.app.assets.add(containerAsset);
        this.app.assets.load(containerAsset);
    }

    // returns true if the filename has one of the recognized model extensions
    isModelFilename(filename: string) {
        const filenameExt = path.getExtension(filename).toLowerCase();
        return modelExtensions.indexOf(filenameExt) !== -1;
    }

    // load the list of urls.
    // urls can reference glTF files, glb files and skybox textures.
    // returns true if a model was loaded.
    loadFiles(files: Array<File>, resetScene = false) {
        // convert single url to list
        if (!Array.isArray(files)) {
            files = [files];
        }

        // check if any file is a model
        const hasModelFilename = files.reduce((p, f) => p || this.isModelFilename(f.filename), false);

        if (hasModelFilename) {
            if (resetScene) {
                this.resetScene();
            }

            const loadTimestamp = Date.now();

            // kick off simultaneous asset load
            let awaiting = 0;
            const assets: { err: string, asset: Asset }[] = [];
            files.forEach((file, index) => {
                if (this.isModelFilename(file.filename)) {
                    awaiting++;
                    this.loadGltf(file, files, (err, asset) => {
                        assets[index] = { err: err, asset: asset };
                        if (--awaiting === 0) {
                            this.loadTimestamp = loadTimestamp;

                            // done loading assets, add them to the scene
                            assets.forEach((asset) => {
                                if (asset) {
                                    this.addToScene(asset.err, asset.asset);
                                }
                            });
                        }
                    });
                }
            });
        } else {
            // load skybox
            this.loadSkybox(files);
        }

        // return true if a model/scene was loaded and false otherwise
        return hasModelFilename;
    }

    // set the currently selected track
    setSelectedTrack(trackName: string) {
        if (trackName !== 'ALL_TRACKS') {
            const a = this.animationMap[trackName];
            this.entities.forEach((e) => {
                e.anim?.baseLayer?.transition(a);
            });
        }
    }

    // play an animation / play all the animations
    play() {
        this.entities.forEach((e) => {
            if (e.anim) {
                e.anim.playing = true;
                e.anim.baseLayer?.play();
            }
        });
    }

    // stop playing animations
    stop() {
        this.entities.forEach((e) => {
            if (e.anim) {
                e.anim.playing = false;
                e.anim.baseLayer?.pause();
            }
        });
    }

    // set the animation speed
    setSpeed(speed: number) {
        this.animSpeed = speed;
        this.entities.forEach((e) => {
            const anim = e.anim;
            if (anim) {
                anim.speed = speed;
            }
        });
    }

    setTransition(transition: number) {
        this.animTransition = transition;

        // it's not possible to change the transition time after creation,
        // so rebuilt the animation graph with the new transition
        if (this.animTracks.length > 0) {
            this.rebuildAnimTracks();
        }
    }

    setLoops(loops: number) {
        this.animLoops = loops;

        // it's not possible to change the transition time after creation,
        // so rebuilt the animation graph with the new transition
        if (this.animTracks.length > 0) {
            this.rebuildAnimTracks();
        }
    }

    setAnimationProgress(progress: number) {
        if (this.suppressAnimationProgressUpdate) return;
        this.entities.forEach((e) => {
            const anim = e.anim;
            const baseLayer = anim?.baseLayer;
            if (baseLayer) {
                this.play();
                baseLayer.activeStateCurrentTime = baseLayer.activeStateDuration * progress;
                anim.update(0);
                anim.playing = false;
            }
        });
        this.renderNextFrame();
    }

    setSelectedNode(path: string) {
        const graphNode = this.app.root.findByPath(path);
        if (graphNode) {
            this.observer.set('scene.selectedNode', {
                name: graphNode.name,
                path: path,
                position: graphNode.getLocalPosition().toString(),
                rotation: graphNode.getLocalEulerAngles().toString(),
                scale: graphNode.getLocalScale().toString()
            });
        }

        this.selectedNode = graphNode;
        this.dirtySkeleton = true;
        this.renderNextFrame();
    }

    setSelectedVariant(variant: string) {
        if (variant) {
            this.entityAssets.forEach((entityAsset) => {
                if (entityAsset.asset.resource.getMaterialVariants().indexOf(variant) !== -1) {
                    entityAsset.asset.resource.applyMaterialVariant(entityAsset.entity, variant);
                }
            });
            this.renderNextFrame();
        }
    }

    setStats(show: boolean) {
        this.miniStats.enabled = show;
        this.renderNextFrame();
    }

    setShowWireframe(show: boolean) {
        this.showWireframe = show;
        this.dirtyWireframe = true;
        this.renderNextFrame();
    }

    setShowBounds(show: boolean) {
        this.showBounds = show;
        this.dirtyBounds = true;
        this.renderNextFrame();
    }

    setShowSkeleton(show: boolean) {
        this.showSkeleton = show;
        this.dirtySkeleton = true;
        this.renderNextFrame();
    }

    setShowAxes(show: boolean) {
        this.showAxes = show;
        this.dirtySkeleton = true;
        this.renderNextFrame();
    }

    setShowGrid(show: boolean) {
        this.showGrid = show;
        this.dirtyGrid = true;
        this.renderNextFrame();
    }

    setNormalLength(length: number) {
        this.normalLength = length;
        this.dirtyNormals = true;
        this.renderNextFrame();
    }

    setFov(fov: number) {
        this.camera.camera.fov = fov;
        this.renderNextFrame();
    }

    setDirectLighting(factor: number) {
        this.light.light.intensity = factor;
        this.renderNextFrame();
    }

    setDirectShadow(enable: boolean) {
        this.light.light.castShadows = enable;
        this.renderNextFrame();
    }

    setLightingRotation(factor: number) {
        // update skybox
        const rot = new Quat();
        rot.setFromEulerAngles(0, factor, 0);
        this.app.scene.skyboxRotation = rot;

        // update directional light
        this.light.setLocalEulerAngles(45, 30 + factor, 0);

        this.renderNextFrame();
    }

    setEnvExposure(factor: number) {
        this.app.scene.skyboxIntensity = Math.pow(2, factor);
        this.renderNextFrame();
    }

    setTonemapping(tonemapping: string) {
        const mapping: Record<string, number> = {
            Linear: TONEMAP_LINEAR,
            Filmic: TONEMAP_FILMIC,
            Hejl: TONEMAP_HEJL,
            ACES: TONEMAP_ACES
        };

        this.app.scene.toneMapping = mapping.hasOwnProperty(tonemapping) ? mapping[tonemapping] : TONEMAP_ACES;
        this.renderNextFrame();
    }

    setBackgroundColor(color: { r: number, g: number, b: number }) {
        const cnv = (value: number) => Math.max(0, Math.min(255, Math.floor(value * 255)));
        document.getElementById('canvas-wrapper').style.backgroundColor = `rgb(${cnv(color.r)}, ${cnv(color.g)}, ${cnv(color.b)})`;
    }

    setSkyboxMip(mip: number) {
        this.app.scene.layers.getLayerById(LAYERID_SKYBOX).enabled = (mip !== 0);
        this.app.scene.skyboxMip = mip - 1;
        this.renderNextFrame();
    }

    update(deltaTime: number) {
        // update the orbit camera
        this.orbitCamera.update(deltaTime);

        const maxdiff = (a: Mat4, b: Mat4) => {
            let result = 0;
            for (let i = 0; i < 16; ++i) {
                result = Math.max(result, Math.abs(a.data[i] - b.data[i]));
            }
            return result;
        };

        // if the camera has moved since the last render
        const cameraWorldTransform = this.camera.getWorldTransform();
        if (maxdiff(cameraWorldTransform, this.prevCameraMat) > 1e-04) {
            this.prevCameraMat.copy(cameraWorldTransform);
            this.renderNextFrame();
        }

        // always render during xr sessions
        if (this.observer.get('xrActive')) {
            this.renderNextFrame();
        }

        // or an animation is loaded and we're animating
        let isAnimationPlaying = false;
        for (let i = 0; i < this.entities.length; ++i) {
            const anim = this.entities[i].anim;
            if (anim && anim.baseLayer && anim.baseLayer.playing) {
                isAnimationPlaying = true;
                break;
            }
        }

        if (isAnimationPlaying) {
            this.dirtyBounds = true;
            this.dirtySkeleton = true;
            this.dirtyNormals = true;
            this.renderNextFrame();
            this.observer.emit('animationUpdate');
        }

        // or the ministats is enabled
        if (this.miniStats.enabled) {
            this.renderNextFrame();
        }
    }

    renderNextFrame() {
        this.app.renderNextFrame = true;
        if (this.multiframe) {
            this.multiframe.moved();
        }
    }

    clearCta() {
        document.querySelector('#panel-left').classList.add('no-cta');
        document.querySelector('#application-canvas').classList.add('no-cta');
        document.querySelector('.load-button-panel').classList.add('hide');
    }

    // add a loaded asset to the scene
    // asset is a container asset with renders and/or animations
    private addToScene(err: string, asset: Asset) {
        this.observer.set('spinner', false);

        if (err) {
            this.observer.set('error', err);
            return;
        }

        const resource = asset.resource;
        const meshesLoaded = resource.renders && resource.renders.length > 0;
        const animsLoaded = resource.animations && resource.animations.length > 0;
        const prevEntity : Entity = this.entities.length === 0 ? null : this.entities[this.entities.length - 1];

        let entity: Entity;

        // create entity
        if (!meshesLoaded && prevEntity && prevEntity.findComponent("render")) {
            entity = prevEntity;
        } else {
            entity = asset.resource.instantiateRenderEntity();
            this.entities.push(entity);
            this.entityAssets.push({ entity: entity, asset: asset });
            this.sceneRoot.addChild(entity);
        }

        // create animation component
        if (animsLoaded) {
            // append anim tracks to global list
            resource.animations.forEach((a : any) => {
                this.animTracks.push(a.resource);
            });
        }

        // rebuild the anim state graph
        if (this.animTracks.length > 0) {
            this.rebuildAnimTracks();
        }

        // make a list of all the morph instance target names
        const morphs: Record<string, { name: string, targets: Record<string, MorphTargetData> }> = {};

        const morphInstances: Record<string, MorphInstance> = {};
        // get all morph targets
        const meshInstances = this.collectMeshInstances(entity);
        meshInstances.forEach((meshInstance, i) => {
            if (meshInstance.morphInstance) {
                const morphInstance = meshInstance.morphInstance;
                morphInstances[i] = morphInstance;

                // mesh name line
                const meshName = (meshInstance && meshInstance.node && meshInstance.node.name) || "Mesh " + i;
                morphs[i] = {
                    name: meshName,
                    targets: {}
                };

                // morph targets
                morphInstance.morph.targets.forEach((target: MorphTarget, targetIndex: number) => {
                    morphs[i].targets[targetIndex] = {
                        name: target.name,
                        targetIndex: targetIndex
                    };
                    this.observer.on(`morphs.${i}.targets.${targetIndex}.weight:set`, (weight: number) => {
                        morphInstances[i].setWeight(targetIndex, weight);
                        this.dirtyNormals = true;
                        this.renderNextFrame();
                    });
                });
            }
        });

        this.observer.suspendEvents = true;
        this.observer.set('morphs', morphs);
        this.observer.suspendEvents = false;

        // handle animation update
        const observer = this.observer;
        observer.on('animationUpdate', () => {
            // set progress
            for (let i = 0; i < this.entities.length; ++i) {
                const entity = this.entities[i];
                if (entity && entity.anim) {
                    const baseLayer = entity.anim.baseLayer;
                    const progress = baseLayer.activeStateCurrentTime / baseLayer.activeStateDuration;
                    this.suppressAnimationProgressUpdate = true;
                    observer.set('animation.progress', progress === 1 ? progress : progress % 1);
                    this.suppressAnimationProgressUpdate = false;
                    break;
                }
            }
        });

        // store the loaded asset
        this.assets.push(asset);

        // update
        this.updateSceneInfo();

        // construct a list of meshInstances so we can quickly access them when configuring wireframe rendering etc.
        this.updateMeshInstanceList();

        // if no meshes are loaded then enable skeleton rendering so user can see something
        if (this.meshInstances.length === 0) {
            this.observer.set('show.skeleton', true);
        }

        // dirty everything
        this.dirtyWireframe = this.dirtyBounds = this.dirtySkeleton = this.dirtyGrid = this.dirtyNormals = true;

        // we can't refocus the camera here because the scene hierarchy only gets updated
        // during render. we must instead set a flag, wait for a render to take place and
        // then focus the camera.
        this.firstFrame = true;
        this.renderNextFrame();
    }

    // rebuild the animation state graph
    private rebuildAnimTracks() {
        this.entities.forEach((entity) => {
            // create the anim component if there isn't one already
            if (!entity.anim) {
                entity.addComponent('anim', {
                    activate: true,
                    speed: this.animSpeed
                });
                entity.anim.rootBone = entity;
            } else {
                // clean up any previous animations
                entity.anim.removeStateGraph();
            }

            this.animTracks.forEach((t: any, i: number) => {
                // add an event to each track which transitions to the next track when it ends
                t.events = new AnimEvents([
                    {
                        name: "transition",
                        time: t.duration,
                        nextTrack: "track_" + (i === this.animTracks.length - 1 ? 0 : i + 1)
                    }
                ]);
                entity.anim.assignAnimation('track_' + i, t);
                this.animationMap[t.name] = 'track_' + i;
            });
            // if the user has selected to play all tracks in succession, then transition to the next track after a set amount of loops
            entity.anim.on('transition', (e) => {
                const animationName: string = this.observer.get('animation.selectedTrack');
                if (animationName === 'ALL_TRACKS' && entity.anim.baseLayer.activeStateProgress >= this.animLoops) {
                    entity.anim.baseLayer.transition(e.nextTrack, this.animTransition);
                }
            });
        });

        // let the controls know about the new animations, set the selected track and immediately start playing the animation
        const animationState = this.observer.get('animation');
        const animationKeys = Object.keys(this.animationMap);
        animationState.list = JSON.stringify(animationKeys);
        animationState.selectedTrack = animationKeys[0];
        animationState.playing = true;
        this.observer.set('animation', animationState);
    }

    private calcSceneBounds() {
        return this.meshInstances.length ?
            Viewer.calcMeshBoundingBox(this.meshInstances) :
            (this.sceneRoot.children.length ?
                Viewer.calcHierBoundingBox(this.sceneRoot) : defaultSceneBounds);
    }

    // generate and render debug elements on prerender
    private onPrerender() {
        // don't update on the first frame
        if (!this.firstFrame) {
            let meshInstance;

            // wireframe
            if (this.dirtyWireframe) {
                this.dirtyWireframe = false;
                for (let i = 0; i < this.meshInstances.length; ++i) {
                    this.meshInstances[i].renderStyle = this.showWireframe ? RENDERSTYLE_WIREFRAME : RENDERSTYLE_SOLID;
                }
            }

            // debug bounds
            if (this.dirtyBounds) {
                this.dirtyBounds = false;

                // calculate bounds
                this.sceneBounds = this.calcSceneBounds();

                this.debugBounds.clear();
                if (this.showBounds) {
                    this.debugBounds.box(this.sceneBounds.getMin(), this.sceneBounds.getMax());
                }
                this.debugBounds.update();

                const v = new Vec3(
                    this.sceneBounds.halfExtents.x * 2,
                    this.sceneBounds.halfExtents.y * 2,
                    this.sceneBounds.halfExtents.z * 2
                );
                this.observer.set('scene.bounds', v.toString());
            }

            // debug normals
            if (this.dirtyNormals) {
                this.dirtyNormals = false;
                this.debugNormals.clear();

                if (this.normalLength > 0) {
                    for (let i = 0; i < this.meshInstances.length; ++i) {
                        meshInstance = this.meshInstances[i];

                        const vertexBuffer = meshInstance.morphInstance ?
                            // @ts-ignore TODO not defined in pc
                            meshInstance.morphInstance._vertexBuffer : meshInstance.mesh.vertexBuffer;

                        if (vertexBuffer) {
                            const skinMatrices = meshInstance.skinInstance ? meshInstance.skinInstance.matrices : null;

                            // if there is skinning we need to manually update matrices here otherwise
                            // our normals are always a frame behind
                            if (skinMatrices) {
                                // @ts-ignore TODO not defined in pc
                                meshInstance.skinInstance.updateMatrices(meshInstance.node);
                            }

                            this.debugNormals.generateNormals(vertexBuffer,
                                                              meshInstance.node.getWorldTransform(),
                                                              this.normalLength,
                                                              skinMatrices);
                        }
                    }
                }
                this.debugNormals.update();
            }

            // debug skeleton
            if (this.dirtySkeleton) {
                this.dirtySkeleton = false;
                this.debugSkeleton.clear();

                if (this.showSkeleton || this.showAxes) {
                    this.entities.forEach((entity) => {
                        if (this.meshInstances.length === 0 || entity.findComponent("render")) {
                            this.debugSkeleton.generateSkeleton(entity, this.showSkeleton, this.showAxes, this.selectedNode);
                        }
                    });
                }

                this.debugSkeleton.update();
            }

            // debug grid
            if (this.sceneBounds && this.dirtyGrid) {
                this.dirtyGrid = false;

                this.debugGrid.clear();
                if (this.showGrid) {
                    // calculate primary spacing
                    const spacing = Math.pow(10, Math.floor(Math.log10(this.sceneBounds.halfExtents.length())));

                    const v0 = new Vec3(0, 0, 0);
                    const v1 = new Vec3(0, 0, 0);

                    const numGrids = 10;
                    const a = numGrids * spacing;
                    for (let x = -numGrids; x < numGrids + 1; ++x) {
                        const b = x * spacing;

                        v0.set(-a, 0, b);
                        v1.set(a, 0, b);
                        this.debugGrid.line(v0, v1, b === 0 ? (0x80000000 >>> 0) : (0x80ffffff >>> 0));

                        v0.set(b, 0, -a);
                        v1.set(b, 0, a);
                        this.debugGrid.line(v0, v1, b === 0 ? (0x80000000 >>> 0) : (0x80ffffff >>> 0));
                    }
                }
                this.debugGrid.update();
            }
        }

        // this.app.drawWireSphere(this.cursorWorld, 0.01);
    }

    private onPostrender() {
        // resolve the (possibly multisampled) render target
        if (this.camera.camera.renderTarget._samples > 1) {
            this.camera.camera.renderTarget.resolve();
        }

        // perform mulitiframe update. returned flag indicates whether more frames
        // are needed.
        this.multiframeBusy = this.multiframe.update();
    }

    private onFrameend() {
        if (this.firstFrame) {
            this.firstFrame = false;

            // focus camera after first frame otherwise skinned model bounding
            // boxes are incorrect
            this.focusCamera();
            this.renderNextFrame();
        } else if (this.loadTimestamp !== null) {
            this.observer.set('scene.loadTime', `${Date.now() - this.loadTimestamp} ms`);
            this.loadTimestamp = null;
        }

        if (this.multiframeBusy) {
            this.app.renderNextFrame = true;
        }
    }

    // to change samples at runtime execute in the debugger 'viewer.setSamples(5, false, 2, 0)'
    setSamples(numSamples: number, jitter = false, size = 1, sigma = 0) {
        this.multiframe.setSamples(numSamples, jitter, size, sigma);
        this.renderNextFrame();
    }
}

export default Viewer;
