import * as pc from 'playcanvas';
// @ts-ignore: No extras declarations
import * as pcx from 'playcanvas/build/playcanvas-extras.js';
import DebugLines from './debug';
// @ts-ignore: library file import
import * as MeshoptDecoder from 'lib/meshopt_decoder.js';
import { getAssetPath } from './helpers';
import { Morph, URL, Observer, HierarchyNode } from './types';
// @ts-ignore: library file import
import { registerVoxParser } from 'playcanvas/scripts/parsers/vox-parser.mjs';

// model filename extensions
const modelExtensions = ['.gltf', '.glb', '.vox'];

class Viewer {
    app: pc.Application;
    prevCameraMat: pc.Mat4;
    camera: pc.Entity;
    cameraFocusBBox: pc.BoundingBox | null;
    cameraPosition: pc.Vec3 | null;
    light: pc.Entity;
    sceneRoot: pc.Entity;
    debugRoot: pc.Entity;
    entities: Array<pc.Entity>;
    assets: Array<pc.Asset>;
    meshInstances: Array<pc.MeshInstance>;
    // TODO replace with Array<pc.AnimTrack> when definition is available in pc
    animTracks: Array<any>;
    animationMap: Record<string, string>;
    morphs: Array<Morph>;
    firstFrame: boolean;
    skyboxLoaded: boolean;
    animSpeed: number;
    animTransition: number;
    animLoops: number;
    showWireframe: boolean;
    showBounds: boolean;
    showSkeleton: boolean;
    normalLength: number;
    skyboxMip: number;
    dirtyWireframe: boolean;
    dirtyBounds: boolean;
    dirtySkeleton: boolean;
    dirtyNormals: boolean;
    debugBounds: DebugLines;
    debugSkeleton: DebugLines;
    debugNormals: DebugLines;
    miniStats: any;
    observer: Observer;

    constructor(canvas: any, observer: Observer) {
        // create the application
        const app = new pc.Application(canvas, {
            mouse: new pc.Mouse(canvas),
            touch: new pc.TouchDevice(canvas),
            graphicsDeviceOptions: {
                alpha: false,
                preferWebGl2: true
            }
        });
        this.app = app;

        // register vox support
        registerVoxParser(app);

        app.graphicsDevice.maxPixelRatio = window.devicePixelRatio;
        app.scene.gammaCorrection = pc.GAMMA_SRGB;

        // Set the canvas to fill the window and automatically change resolution to be the same as the canvas size
        const canvasSize = this.getCanvasSize();
        app.setCanvasFillMode(pc.FILLMODE_NONE, canvasSize.width, canvasSize.height);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        window.addEventListener("resize", () => {
            this.resizeCanvas();
        });

        // create the orbit camera
        const camera = new pc.Entity("Camera");
        camera.addComponent("camera", {
            fov: 75,
            clearColor: new pc.Color(0.4, 0.45, 0.5),
            frustumCulling: true
        });

        // load orbit script
        app.assets.loadFromUrl(
            getAssetPath("scripts/orbit-camera.js"),
            "script",
            function () {
                // setup orbit script component
                camera.addComponent("script");
                camera.script.create("orbitCamera", {
                    attributes: {
                        inertiaFactor: 0.1
                    }
                });
                camera.script.create("orbitCameraInputMouse");
                camera.script.create("orbitCameraInputTouch");
                app.root.addChild(camera);
            });

        // create the light
        const light = new pc.Entity();
        light.addComponent("light", {
            type: "directional",
            color: new pc.Color(1, 1, 1),
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
        this.prevCameraMat = new pc.Mat4();
        app.on('update', this.update, this);

        // configure drag and drop
        const preventDefault = function (ev: { preventDefault: () => void }) {
            ev.preventDefault();
        };

        window.addEventListener('dragenter', preventDefault, false);
        window.addEventListener('dragover', preventDefault, false);
        window.addEventListener('drop', this.dropHandler.bind(this), false);

        app.on('prerender', this.onPrerender, this);
        app.on('frameend', this.onFrameend, this);

        // create the scene and debug root nodes
        const sceneRoot = new pc.Entity("sceneRoot", app);
        app.root.addChild(sceneRoot);

        const debugRoot = new pc.Entity("debugRoot", app);
        app.root.addChild(debugRoot);

        // store app things
        this.camera = camera;
        this.cameraFocusBBox = null;
        this.cameraPosition = null;
        this.light = light;
        this.sceneRoot = sceneRoot;
        this.debugRoot = debugRoot;
        this.entities = [];
        this.assets = [];
        this.meshInstances = [];
        this.animTracks = [];
        this.animationMap = { };
        this.morphs = [];
        this.firstFrame = false;
        this.skyboxLoaded = false;

        this.animSpeed = observer.get('animation.speed');
        this.animTransition = observer.get('animation.transition');
        this.animLoops = observer.get('animation.loops');
        this.showWireframe = observer.get('show.wireframe');
        this.showBounds = observer.get('show.bounds');
        this.showSkeleton = observer.get('show.skeleton');
        this.normalLength = observer.get('show.normals');
        this.skyboxMip = observer.get('lighting.skybox.mip');
        this.setTonemapping(observer.get('lighting.tonemapping'));

        this.dirtyWireframe = false;
        this.dirtyBounds = false;
        this.dirtySkeleton = false;
        this.dirtyNormals = false;
        this.debugBounds = new DebugLines(app, camera);
        this.debugSkeleton = new DebugLines(app, camera);
        this.debugNormals = new DebugLines(app, camera);

        // construct ministats, default off
        this.miniStats = new pcx.MiniStats(app);
        this.miniStats.enabled = observer.get('show.stats');
        this.observer = observer;

        // initialize control events
        this.bindControlEvents();

        // start the application
        app.start();

        // extract query params. taken from https://stackoverflow.com/a/21152762
        const urlParams: any = {};
        if (location.search) {
            location.search.substr(1).split("&").forEach((item) => {
                const s = item.split("="),
                    k = s[0],
                    v = s[1] && decodeURIComponent(s[1]);
                (urlParams[k] = urlParams[k] || []).push(v);
            });
        }

        // handle load url param
        const loadUrls = (urlParams.load || []).concat(urlParams.assetUrl || []);
        if (loadUrls.length > 0) {
            this.load(
                loadUrls.map((url: string) => {
                    return { url, filename: url };
                })
            );
        }

        // load the default skybox if one wasn't specified in url params
        if (!this.skyboxLoaded) {
            const skybox = observer.get('lighting.skybox.value') || observer.get('lighting.skybox.default');
            this.load([{ url: skybox, filename: skybox }]);
        }

        // set camera position
        if (urlParams.hasOwnProperty('cameraPosition')) {
            const pos = urlParams.cameraPosition[0].split(',').map(Number);
            if (pos.length === 3) {
                this.cameraPosition = new pc.Vec3(pos);
            }
        }
    }

    // collects all mesh instances from entity hierarchy
    private collectMeshInstances(entity: pc.Entity) {
        const meshInstances: Array<pc.MeshInstance> = [];
        if (entity) {
            const components = entity.findComponents("render");
            for (let i = 0; i < components.length; i++) {
                const render = components[i] as pc.RenderComponent;
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
    private static calcMeshBoundingBox(meshInstances: Array<pc.MeshInstance>) {
        const bbox = new pc.BoundingBox();
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
    private static calcHierBoundingBox(rootNode: pc.Entity) {
        const position = rootNode.getPosition();
        let min_x = position.x;
        let min_y = position.y;
        let min_z = position.z;
        let max_x = position.x;
        let max_y = position.y;
        let max_z = position.z;

        const recurse = (node: pc.GraphNode) => {
            const p = node.getPosition();
            if (p.x < min_x) min_x = p.x; else if (p.x > max_x) max_x = p.x;
            if (p.y < min_y) min_y = p.y; else if (p.y > max_y) max_y = p.y;
            if (p.z < min_z) min_z = p.z; else if (p.z > max_z) max_z = p.z;
            for (let i = 0; i < node.children.length; ++i) {
                recurse(node.children[i]);
            }
        };
        recurse(rootNode);

        const result = new pc.BoundingBox();
        result.setMinMax(new pc.Vec3(min_x, min_y, min_z), new pc.Vec3(max_x, max_y, max_z));
        return result;
    }

    // calculate the intersection of the two bounding boxes
    private static calcBoundingBoxIntersection(bbox1: pc.BoundingBox, bbox2: pc.BoundingBox) {
        // bounds don't intersect
        if (!bbox1.intersects(bbox2)) {
            return null;
        }
        const min1 = bbox1.getMin();
        const max1 = bbox1.getMax();
        const min2 = bbox2.getMin();
        const max2 = bbox2.getMax();
        const result = new pc.BoundingBox();
        result.setMinMax(new pc.Vec3(Math.max(min1.x, min2.x), Math.max(min1.y, min2.y), Math.max(min1.z, min2.z)),
                         new pc.Vec3(Math.min(max1.x, max2.x), Math.min(max1.y, max2.y), Math.min(max1.z, max2.z)));
        return result;
    }

    // construct the controls interface and initialize controls
    private bindControlEvents() {
        const controlEvents:any = {
            'show.stats': this.setStats.bind(this),
            'show.wireframe': this.setShowWireframe.bind(this),
            'show.bounds': this.setShowBounds.bind(this),
            'show.skeleton': this.setShowSkeleton.bind(this),
            'show.normals': this.setNormalLength.bind(this),
            'show.fov': this.setFov.bind(this),

            'lighting.shadow': this.setDirectShadow.bind(this),
            'lighting.direct': this.setDirectLighting.bind(this),
            'lighting.env': this.setEnvLighting.bind(this),
            'lighting.tonemapping': this.setTonemapping.bind(this),
            'lighting.skybox.mip': this.setSkyboxMip.bind(this),
            'lighting.skybox.value': (value: string) => {
                if (value) {
                    this.load([{ url: value, filename: value }]);
                } else {
                    this.clearSkybox();
                }
            },
            'lighting.rotation': this.setLightingRotation.bind(this),

            'animation.playing': (playing: boolean) => {
                if (playing) {
                    this.play();
                } else {
                    this.stop();
                }
            },
            'animation.selectedTrack': this.play.bind(this),
            'animation.speed': this.setSpeed.bind(this),
            'animation.transition': this.setTransition.bind(this),
            'animation.loops': this.setLoops.bind(this),
            'animation.progress': this.setAnimationProgress.bind(this),

            'model.selectedNode.path': this.setSelectedNode.bind(this)
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

    // initialize the faces and prefiltered lighting data from the given
    // skybox texture, which is either a cubemap or equirect texture.
    private initSkyboxFromTextureNew(env: pc.Texture) {
        // @ts-ignore
        const t0 = pc.now();

        // @ts-ignore
        const skybox = pc.EnvLighting.generateSkyboxCubemap(env);

        // @ts-ignore
        const t1 = pc.now();

        // @ts-ignore
        const lighting = pc.EnvLighting.generateLightingSource(env);

        // @ts-ignore
        const t2 = pc.now();

        // @ts-ignore
        const envAtlas = pc.EnvLighting.generateAtlas(lighting);

        // @ts-ignore
        const t3 = pc.now();

        lighting.destroy();

        // @ts-ignore
        this.app.scene.envAtlas = envAtlas;
        this.app.scene.skybox = skybox;
        this.app.renderNextFrame = true;                         // ensure we render again when the cubemap arrives

        // @ts-ignore
        console.log(`prefilter timings skybox=${(t1 - t0).toFixed(2)}ms lighting=${(t2 - t1).toFixed(2)}ms envAtlas=${(t3 - t2).toFixed(2)}ms`);
    }

    // initialize the faces and prefiltered lighting data from the given
    // skybox texture, which is either a cubemap or equirect texture.
    private initSkyboxFromTexture(skybox: pc.Texture) {
        // @ts-ignore
        if (pc.EnvLighting) {
            return this.initSkyboxFromTextureNew(skybox);
        }

        const createCubemap = (size: number) => {
            return new pc.Texture(device, {
                name: `skyboxFaces-${size}`,
                cubemap: true,
                width: size,
                height: size,
                type: pc.TEXTURETYPE_RGBM,
                addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                addressV: pc.ADDRESS_CLAMP_TO_EDGE,
                fixCubemapSeams: true,
                mipmaps: false
            });
        };

        const app = this.app;
        const device = app.graphicsDevice;
        const cubemaps = [];

        // @ts-ignore skybox
        cubemaps.push(pc.EnvLighting.generateSkyboxCubemap(skybox));

        // @ts-ignore
        const lightingSource = pc.EnvLighting.generateLightingSource(skybox);

        // create top level
        const top = createCubemap(128);
        pc.reprojectTexture(lightingSource, top, {
            numSamples: 1
        });
        cubemaps.push(top);

        // generate prefiltered lighting data
        const sizes = [128, 64, 32, 16, 8, 4];
        const specPower = [1, 512, 128, 32, 8, 2];
        for (let i = 1; i < sizes.length; ++i) {
            const level = createCubemap(sizes[i]);
            pc.reprojectTexture(lightingSource, level, {
                numSamples: 1024,
                specularPower: specPower[i],
                // @ts-ignore
                distribution: 'ggx'
            });

            cubemaps.push(level);
        }

        lightingSource.destroy();

        // assign the textures to the scene
        app.scene.setSkybox(cubemaps);
        app.renderNextFrame = true;                         // ensure we render again when the cubemap arrives
    }

    // load the image files into the skybox. this function supports loading a single equirectangular
    // skybox image or 6 cubemap faces.
    private loadSkybox(files: Array<URL>) {
        const app = this.app;

        if (files.length !== 6) {
            // load equirectangular skybox
            const textureAsset = new pc.Asset('skybox_equi', 'texture', {
                url: files[0].url,
                filename: files[0].filename
            });
            textureAsset.ready(() => {
                const texture = textureAsset.resource;
                if (texture.type === pc.TEXTURETYPE_DEFAULT && texture.format === pc.PIXELFORMAT_R8_G8_B8_A8) {
                    // assume RGBA data (pngs) are RGBM
                    texture.type = pc.TEXTURETYPE_RGBM;
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

            const sortPred = (first: URL, second: URL) => {
                const firstOrder = getOrder(first.filename);
                const secondOrder = getOrder(second.filename);
                return firstOrder < secondOrder ? -1 : (secondOrder < firstOrder ? 1 : 0);
            };

            files.sort(sortPred);

            // construct an asset for each cubemap face
            const faceAssets = files.map((file, index) => {
                const faceAsset = new pc.Asset('skybox_face' + index, 'texture', file);
                app.assets.add(faceAsset);
                app.assets.load(faceAsset);
                return faceAsset;
            });

            // construct the cubemap asset
            const cubemapAsset = new pc.Asset('skybox_cubemap', 'cubemap', null, {
                textures: faceAssets.map(faceAsset => faceAsset.id)
            });
            // @ts-ignore TODO not defined in pc
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

        const cubemap = new pc.Asset('helipad', 'cubemap', {
            url: getAssetPath("cubemaps/Helipad.dds")
        }, {
            magFilter: pc.FILTER_LINEAR,
            minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
            anisotropy: 1,
            type: pc.TEXTURETYPE_RGBM
        });
        cubemap.on('load', () => {
            app.scene.setSkybox(cubemap.resources);
            app.renderNextFrame = true;                             // ensure we render again when the cubemap arrives
        });
        app.assets.add(cubemap);
        app.assets.load(cubemap);
        this.skyboxLoaded = true;
    }

    private getCanvasSize() {
        return {
            width: document.body.clientWidth - document.getElementById("panel").offsetWidth,
            height: document.body.clientHeight
        };
    }

    resizeCanvas() {
        const canvasSize = this.getCanvasSize();
        this.app.resizeCanvas(canvasSize.width, canvasSize.height);
        this.app.renderNextFrame = true;
    }

    // reset the viewer, unloading resources
    resetScene() {
        const app = this.app;

        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            this.sceneRoot.removeChild(entity);
            entity.destroy();
        }
        this.entities = [];

        for (let i = 0; i < this.assets.length; ++i) {
            const asset = this.assets[i];
            app.assets.remove(asset);
            asset.unload();
        }
        this.assets = [];

        this.meshInstances = [];

        // reset animation state
        this.animTracks = [];
        this.animationMap = { };
        this.observer.set('animations.list', '[]');

        this.morphs = [];
        this.observer.set('morphTargets', null);

        this.dirtyWireframe = this.dirtyBounds = this.dirtySkeleton = this.dirtyNormals = true;

        this.app.renderNextFrame = true;
    }

    clearSkybox() {
        this.app.scene.setSkybox(null);
        this.app.renderNextFrame = true;
        this.skyboxLoaded = false;
    }

    // move the camera to view the loaded object
    focusCamera() {
        const camera = this.camera.camera;

        const bbox = this.meshInstances.length ?
            Viewer.calcMeshBoundingBox(this.meshInstances) :
            Viewer.calcHierBoundingBox(this.sceneRoot);

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

        // @ts-ignore TODO not defined in pc
        const orbitCamera = this.camera.script.orbitCamera;

        // calculate scene bounding box
        const radius = bbox.halfExtents.length();
        const distance = (radius * 1.4) / Math.sin(0.5 * camera.fov * camera.aspectRatio * pc.math.DEG_TO_RAD);

        if (this.cameraPosition) {
            orbitCamera.resetAndLookAtPoint(this.cameraPosition, bbox.center);
            this.cameraPosition = null;
        } else {
            orbitCamera.pivotPoint = bbox.center;
            orbitCamera.distance = distance;
        }
        camera.nearClip = distance / 10;
        camera.farClip = distance * 10;

        const light = this.light;
        light.light.shadowDistance = distance * 2;

        this.cameraFocusBBox = bbox;
    }

    // load gltf model given its url and list of external urls
    private loadGltf(gltfUrl: URL, externalUrls: Array<URL>) {

        // provide buffer view callback so we can handle models compressed with MeshOptimizer
        // https://github.com/zeux/meshoptimizer
        const processBufferView = function (gltfBuffer: any, buffers: Array<any>, continuation: (err: string, result: any) => void) {
            if (gltfBuffer.extensions && gltfBuffer.extensions.EXT_meshopt_compression) {
                const extensionDef = gltfBuffer.extensions.EXT_meshopt_compression;

                const decoder = MeshoptDecoder;

                decoder.ready.then(() => {
                    const byteOffset = extensionDef.byteOffset || 0;
                    const byteLength = extensionDef.byteLength || 0;

                    const count = extensionDef.count;
                    const stride = extensionDef.byteStride;

                    const result = new Uint8Array(count * stride);
                    const source = new Uint8Array(buffers[extensionDef.buffer].buffer,
                                                  buffers[extensionDef.buffer].byteOffset + byteOffset,
                                                  byteLength);

                    decoder.decodeGltfBuffer(result, count, stride, source, extensionDef.mode, extensionDef.filter);

                    continuation(null, result);
                });
            } else {
                continuation(null, null);
            }
        };

        const processImage = function (gltfImage: any, continuation: (err: string, result: any) => void) {
            const u: URL = externalUrls.find((url) => {
                return url.filename === pc.path.normalize(gltfImage.uri || "");
            });
            if (u) {
                const textureAsset = new pc.Asset(u.filename, 'texture', {
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

        const processBuffer = function (gltfBuffer: any, continuation: (err: string, result: any) => void) {
            const u = externalUrls.find((url) => {
                return url.filename === pc.path.normalize(gltfBuffer.uri || "");
            });
            if (u) {
                const bufferAsset = new pc.Asset(u.filename, 'binary', {
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

        const containerAsset = new pc.Asset(gltfUrl.filename, 'container', gltfUrl, null, {
            // @ts-ignore TODO no definition in pc
            bufferView: {
                processAsync: processBufferView.bind(this)
            },
            image: {
                processAsync: processImage.bind(this)
            },
            buffer: {
                processAsync: processBuffer.bind(this)
            }
        });
        containerAsset.on('load', () => {
            this.onLoaded(null, containerAsset);
        });
        containerAsset.on('error', (err : string) => {
            this.onLoaded(err, containerAsset);
        });

        this.observer.set('spinner', true);
        this.observer.set('error', null);
        this.clearCta();

        this.app.assets.add(containerAsset);
        this.app.assets.load(containerAsset);
    }

    // load the list of urls.
    // urls can reference glTF files, glb files and skybox textures.
    // returns true if a model was loaded.
    load(urls: Array<URL>) {
        // convert single url to list
        if (!Array.isArray(urls)) {
            urls = [urls];
        }

        // step through urls loading gltf/glb models
        let result = false;
        urls.forEach((url) => {
            const filenameExt = pc.path.getExtension(url.filename).toLowerCase();
            if (modelExtensions.indexOf(filenameExt) !== -1) {
                this.loadGltf(url, urls);
                result = true;
            }
        });

        if (!result) {
            // if no models were loaded, load the files as skydome images instead
            this.loadSkybox(urls);
        }

        // return true if a model/scene was loaded and false otherwise
        return result;
    }

    // play an animation / play all the animations
    play() {
        let a: string;
        const animationName: string = this.observer.get('animation.selectedTrack');
        if (animationName !== 'ALL_TRACKS') {
            a = this.animationMap[animationName];
        }
        this.entities.forEach((e) => {
            const anim = e.anim;
            if (anim) {
                anim.setBoolean('loop', !!a);
                anim.findAnimationLayer('all_layer').play(a || pc.ANIM_STATE_START);
                anim.playing = true;
            }
        });
    }

    // stop playing animations
    stop() {
        this.entities.forEach((e) => {
            const anim = e.anim;
            if (anim) {
                anim.findAnimationLayer('all_layer').pause();
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
        this.observer.set('animation.playing', false);
        this.entities.forEach((e) => {
            const anim = e.anim;
            anim.playing = true;
            anim.baseLayer.activeStateCurrentTime = anim.baseLayer.activeStateDuration * progress;
            // @ts-ignore
            anim.system.onAnimationUpdate(0);
            anim.playing = false;
            anim.baseLayer.play();
        });
    }

    setSelectedNode(path: string) {
        const graphNode = this.app.root.findByPath(path);
        if (graphNode) {
            this.observer.set('model.selectedNode', {
                name: graphNode.name,
                path: path,
                position: graphNode.getLocalPosition().toString(),
                rotation: graphNode.getLocalRotation().toString(),
                scale: graphNode.getLocalScale().toString()
            });
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
        const rot = new pc.Quat();
        rot.setFromEulerAngles(0, factor, 0);
        this.app.scene.skyboxRotation = rot;

        // update directional light
        this.light.setLocalEulerAngles(45, 30 + factor, 0);

        this.renderNextFrame();
    }

    setEnvLighting(factor: number) {
        this.app.scene.skyboxIntensity = factor;
        this.renderNextFrame();
    }

    setTonemapping(tonemapping: string) {
        const mapping: Record<string, number> = {
            Linear: pc.TONEMAP_LINEAR,
            Filmic: pc.TONEMAP_FILMIC,
            Hejl: pc.TONEMAP_HEJL,
            ACES: pc.TONEMAP_ACES
        };

        this.app.scene.toneMapping = mapping.hasOwnProperty(tonemapping) ? mapping[tonemapping] : pc.TONEMAP_ACES;
        this.renderNextFrame();
    }

    setSkyboxMip(mip: number) {
        this.skyboxMip = mip;
        this.app.scene.skyboxMip = mip;
        this.renderNextFrame();
    }

    update() {
        // if the camera has moved since the last render
        const cameraWorldTransform = this.camera.getWorldTransform();
        if (!this.prevCameraMat.equals(cameraWorldTransform)) {
            this.prevCameraMat.copy(cameraWorldTransform);
            this.renderNextFrame();
        }

        // or an animation is loaded and we're animating
        let isAnimationPlaying = false;
        for (let i = 0; i < this.entities.length; ++i) {
            const anim = this.entities[i].anim;
            if (anim && anim.findAnimationLayer('all_layer').playing) {
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
    }

    // use webkitGetAsEntry to extract files so we can include folders
    private dropHandler(event: DragEvent) {

        const removeCommonPrefix = (urls: Array<URL>) => {
            const split = (pathname: string) => {
                const parts = pathname.split(pc.path.delimiter);
                const base = parts[0];
                const rest = parts.slice(1).join(pc.path.delimiter);
                return [base, rest];
            };
            while (true) {
                const parts = split(urls[0].filename);
                if (parts[1].length === 0) {
                    return;
                }
                for (let i = 1; i < urls.length; ++i) {
                    const other = split(urls[i].filename);
                    if (parts[0] !== other[0]) {
                        return;
                    }
                }
                for (let i = 0; i < urls.length; ++i) {
                    urls[i].filename = split(urls[i].filename)[1];
                }
            }
        };

        const resolveFiles = (entries: Array<FileSystemFileEntry>) => {
            const urls: Array<URL> = [];
            entries.forEach((entry: FileSystemFileEntry) => {
                entry.file((file: File) => {
                    urls.push({
                        url: URL.createObjectURL(file),
                        filename: entry.fullPath.substring(1)
                    });
                    if (urls.length === entries.length) {
                        // remove common prefix from files in order to support dragging in the
                        // root of a folder containing related assets
                        if (urls.length > 1) {
                            removeCommonPrefix(urls);
                        }

                        // if a scene was loaded (and not just a skybox), clear the current scene
                        if (this.load(urls) && !event.shiftKey) {
                            this.resetScene();
                        }
                    }
                });
            });
        };

        const resolveDirectories = (entries: Array<FileSystemEntry>) => {
            let awaiting = 0;
            const files: Array<FileSystemFileEntry> = [];
            const recurse = (entries: Array<FileSystemEntry>) => {
                entries.forEach((entry: FileSystemEntry) => {
                    if (entry.isFile) {
                        files.push(entry as FileSystemFileEntry);
                    } else if (entry.isDirectory) {
                        awaiting++;
                        const reader = (entry as FileSystemDirectoryEntry).createReader();
                        reader.readEntries((subEntries: Array<FileSystemEntry>) => {
                            awaiting--;
                            recurse(subEntries);
                        });
                    }
                });
                if (awaiting === 0) {
                    resolveFiles(files);
                }
            };
            recurse(entries);
        };

        // first things first
        event.preventDefault();

        const items = event.dataTransfer.items;
        if (!items) {
            return;
        }

        const entries = [];
        for (let i = 0; i < items.length; ++i) {
            entries.push(items[i].webkitGetAsEntry());
        }
        resolveDirectories(entries);
    }

    clearCta() {
        document.querySelector('#panel').classList.add('no-cta');
        document.querySelector('#application-canvas').classList.add('no-cta');
        document.querySelector('.load-button-panel').classList.add('hide');
    }

    // container asset has been loaded, add it to the scene
    private onLoaded(err: string, asset: pc.Asset) {
        this.observer.set('spinner', false);

        if (err) {
            this.observer.set('error', err);
            return;
        }

        const resource = asset.resource;
        const meshesLoaded = resource.renders && resource.renders.length > 0;
        const animLoaded = resource.animations && resource.animations.length > 0;
        const prevEntity : pc.Entity = this.entities.length === 0 ? null : this.entities[this.entities.length - 1];

        let entity: pc.Entity;

        if (prevEntity) {
            // check if this loaded resource can be added to the existing entity,
            // for example loading an animation onto an existing model (or visa versa)
            const preEntityRenders = !!prevEntity.findComponent("render");
            if ((meshesLoaded && !preEntityRenders) ||
                (animLoaded && !meshesLoaded)) {
                entity = prevEntity;
            }
        }

        let meshCount = 0;
        let vertexCount = 0;
        let primitiveCount = 0;

        if (!entity) {
            // create entity
            entity = asset.resource.instantiateRenderEntity();

            // update mesh stats
            resource.renders.forEach((renderAsset : pc.Asset) => {
                renderAsset.resource.meshes.forEach((mesh : pc.Mesh) => {
                    meshCount++;
                    vertexCount += mesh.vertexBuffer.getNumVertices();
                    primitiveCount += mesh.primitive[0].count;
                });
            });

            this.entities.push(entity);
            this.sceneRoot.addChild(entity);
        }

        const mapChildren = function (node: pc.GraphNode): Array<HierarchyNode> {
            return node.children.map((child: pc.GraphNode) => ({
                name: child.name,
                path: child.path,
                children: mapChildren(child)
            }));
        };

        const graph: Array<HierarchyNode> = [{
            name: entity.name,
            path: entity.path,
            children: mapChildren(entity)
        }];

        // hierarchy
        this.observer.set('model.nodes', JSON.stringify(graph));

        // mesh stats
        this.observer.set('model.meshCount', meshCount);
        this.observer.set('model.vertexCount', vertexCount);
        this.observer.set('model.primitiveCount', primitiveCount);

        // create animation component
        if (animLoaded) {
            // create the anim component if there isn't one already
            if (!entity.anim) {
                entity.addComponent('anim', {
                    activate: true,
                    speed: this.animSpeed
                });
                entity.anim.rootBone = this.sceneRoot;
            }

            // append anim tracks to global list
            resource.animations.forEach((a : any) => {
                this.animTracks.push(a.resource);
            });
        }

        // rebuild the anim state graph
        if (this.animTracks.length > 0) {
            this.rebuildAnimTracks();
        }

        // get all morph targets
        const morphInstances: Array<pc.MorphInstance> = [];
        const meshInstances = this.collectMeshInstances(entity);
        for (let i = 0; i < meshInstances.length; i++) {
            if (meshInstances[i].morphInstance) {
                morphInstances.push(meshInstances[i].morphInstance);
            }
        }

        // initialize morph targets
        if (morphInstances.length > 0) {
            // make a list of all the morph instance target names
            const morphs: Array<Morph> = this.morphs;
            morphInstances.forEach((morphInstance: any, morphIndex: number) => {
                const meshInstance = morphInstance.meshInstance;

                // mesh name line
                morphs.push(<Morph> {
                    name: (meshInstance && meshInstance.node && meshInstance.node.name) || "Mesh " + morphIndex
                });

                // morph targets
                // @ts-ignore TODO accessing private const
                morphInstance.morph._targets.forEach((target, targetIndex) => {
                    morphs.push({
                        name: target.name,
                        targetIndex: targetIndex
                    });
                });
            });

            const morphTargets: Record<number, { name: string, morphs: Record<number, Morph> }> = {};
            let panelCount = 0;
            let morphCount = 0;
            morphs.forEach((morph: Morph) => {
                if (!morph.hasOwnProperty('targetIndex')) {
                    morphTargets[panelCount] = { name: morph.name, morphs: {} };
                    panelCount++;
                    morphCount = 0;
                } else {
                    morphTargets[panelCount - 1].morphs[morphCount] = {
                        // prepend morph index to morph target diplay name
                        name: (morph.name === `${morph.targetIndex}`) ? `${morph.name}.` : `${morph.targetIndex}. ${morph.name}`,
                        targetIndex: morph.targetIndex
                    };
                    const morphInstance = morphInstances[panelCount - 1];
                    this.observer.on(`morphTargets.${panelCount - 1}.morphs.${morphCount}.weight:set`, (weight: number) => {
                        if (!morphInstance) return;
                        morphInstance.setWeight(morph.targetIndex, weight);
                        this.dirtyNormals = true;
                        this.renderNextFrame();
                    });
                    morphCount++;
                }
            });
            this.observer.set('morphTargets', morphTargets);
            this.observer.on('animationUpdate', () => {
                const morphTargets = this.observer.get('morphTargets');
                morphInstances.forEach((morphInstance: any, i: number) => {
                    if (morphTargets && morphTargets[i]) {
                        Object.keys(morphTargets[i].morphs).forEach((morphKey) => {
                            const newWeight = morphInstance.getWeight(Number(morphKey));
                            if (morphTargets[i].morphs[morphKey].weight !== newWeight) {
                                this.observer.set(`morphTargets.${i}.morphs.${morphKey}.weight`, newWeight);
                            }
                        });
                    }
                });
            });
        }

        // store the loaded asset
        this.assets.push(asset);

        // construct a list of meshInstances so we can quickly access them when configuring wireframe rendering etc.
        this.updateMeshInstanceList();

        // if no meshes are loaded then enable skeleton rendering so user can see something
        if (this.meshInstances.length === 0) {
            this.observer.set('show.skeleton', true);
        }

        // dirty everything
        this.dirtyWireframe = this.dirtyBounds = this.dirtySkeleton = this.dirtyNormals = true;

        // we can't refocus the camera here because the scene hierarchy only gets updated
        // during render. we must instead set a flag, wait for a render to take place and
        // then focus the camera.
        this.firstFrame = true;
        this.renderNextFrame();
    }

    // rebuild the animation state graph
    private rebuildAnimTracks() {
        const entity = this.entities[this.entities.length - 1];

        // create states
        const states : Array<{ name: string, speed?: number }> = [{ name: pc.ANIM_STATE_START }];
        this.animTracks.forEach((t, i) => {
            states.push({ name: 'track_' + i, speed: 1 });
        });

        // create a transition for each state
        const transition = this.animTransition;
        const loops = this.animLoops;
        const transitions = states.map((s, i) => {
            return {
                from: s.name,
                to: states[(i + 1) % states.length || 1].name,
                time: s.name ===  pc.ANIM_STATE_START ? 0 : transition,
                exitTime: s.name === pc.ANIM_STATE_START ? 0 : loops,
                conditions: [{
                    parameterName: 'loop',
                    predicate: pc.ANIM_EQUAL_TO,
                    value: false
                }],
                interruptionSource: pc.ANIM_INTERRUPTION_NEXT
            };
        });

        // create the state graph instance
        // @ts-ignore TODO AnimStateGraph constructor argument missing from typings
        entity.anim.loadStateGraph(new pc.AnimStateGraph({
            layers: [{ name: 'all_layer', states: states, transitions: transitions }],
            parameters: {
                loop: {
                    name: 'loop',
                    type: pc.ANIM_PARAMETER_BOOLEAN,
                    value: false
                }
            }
        }));

        const allLayer = entity.anim.findAnimationLayer('all_layer');
        this.animTracks.forEach((t: any, i: number) => {
            const name = states[i + 1].name;
            allLayer.assignAnimation(name, t);
            this.animationMap[t.name] = name;
        });

        // let the controls know about the new animations
        this.observer.set('animation.list', JSON.stringify(Object.keys(this.animationMap)));

        // immediately start playing the animation
        this.observer.set('animation.playing', true);
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
                    this.meshInstances[i].renderStyle = this.showWireframe ? pc.RENDERSTYLE_WIREFRAME : pc.RENDERSTYLE_SOLID;
                }
            }

            // debug bounds
            if (this.dirtyBounds) {
                this.dirtyBounds = false;
                this.debugBounds.clear();

                if (this.showBounds) {
                    const bbox = Viewer.calcMeshBoundingBox(this.meshInstances);
                    this.debugBounds.box(bbox.getMin(), bbox.getMax());
                }
                this.debugBounds.update();
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
                            // @ts-ignore TODO not defined in pc
                            const skinMatrices = meshInstance.skinInstance ?
                                // @ts-ignore TODO not defined in pc
                                meshInstance.skinInstance.matrices : null;

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

                if (this.showSkeleton) {
                    for (let i = 0; i < this.entities.length; ++i) {
                        const entity = this.entities[i];
                        if (entity.findComponent("render")) {
                            this.debugSkeleton.generateSkeleton(entity);
                        }
                    }
                }

                this.debugSkeleton.update();
            }
        }
    }

    private onFrameend() {
        if (this.firstFrame) {
            this.firstFrame = false;

            // focus camera after first frame otherwise skinned model bounding
            // boxes are incorrect
            this.focusCamera();
            this.renderNextFrame();
        }
    }
}

export default Viewer;
