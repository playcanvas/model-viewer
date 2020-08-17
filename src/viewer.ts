import * as pc from 'playcanvas';
// @ts-ignore: No extras declarations
import * as pcx from 'playcanvas/build/playcanvas-extras.js';
import Graph from './graph';
import DebugLines from './debug';
import HdrParser from '../lib/hdr-texture.js';
import * as MeshoptDecoder from '../lib/meshopt_decoder.js';
import { getAssetPath } from './helpers';
import { Morph, Controls, initControls } from './controls';

interface URL {
    url: string,
    filename: string
}

interface Animation {
    play: (animation?: string) => void,
    pause: () => void,
    playing: boolean
}

class Viewer {
    controls: Controls;
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
    graph: Graph;
    meshInstances: Array<pc.MeshInstance>;
    stateGraph: { layers: Array<any>, parameters: any };
    // TODO replace with Array<pc.AnimTrack> when definition is available in pc
    animTracks: Array<any>;
    animationMap: Record<string, Animation>;
    morphs: Array<Morph>;
    firstFrame: boolean;
    skyboxLoaded: boolean;
    showGraphs: boolean;
    showWireframe: boolean;
    showBounds: boolean;
    showSkeleton: boolean;
    normalLength: number;
    directLightingFactor: number;
    envLightingFactor: number;
    skyboxMip: number;
    dirtyWireframe: boolean;
    dirtyBounds: boolean;
    dirtySkeleton: boolean;
    dirtyNormals: boolean;
    debugBounds: DebugLines;
    debugSkeleton: DebugLines;
    debugNormals: DebugLines;
    miniStats: any;

    constructor(canvas: any) {
        // create the application
        const app = new pc.Application(canvas, {
            mouse: new pc.Mouse(canvas),
            touch: new pc.TouchDevice(canvas)
        });
        this.app = app;

        app.graphicsDevice.maxPixelRatio = window.devicePixelRatio;

        // Set the canvas to fill the window and automatically change resolution to be the same as the canvas size
        const canvasSize = this.getCanvasSize();
        app.setCanvasFillMode(pc.FILLMODE_NONE, canvasSize.width, canvasSize.height);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        window.addEventListener("resize", function () {
            this.resizeCanvas();
        }.bind(this));

        // create the orbit camera
        const camera = new pc.Entity("Camera");
        camera.addComponent("camera", {
            fov: 75,
            clearColor: new pc.Color(0.4, 0.45, 0.5)
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
                        inertiaFactor: 0.02
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
            intensity: 2,
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
        app.on('update', this.update.bind(this));

        // configure drag and drop
        const preventDefault = function (ev: { preventDefault: () => void }) {
            ev.preventDefault();
        };

        window.addEventListener('dragenter', preventDefault, false);
        window.addEventListener('dragover', preventDefault, false);
        window.addEventListener('drop', this.dropHandler.bind(this), false);

        // construct the debug animation graphs
        const graph = new Graph(app, 128);
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
        this.graph = graph;
        this.meshInstances = [];
        this.stateGraph = {
            layers: [],
            parameters: { }
        };
        this.animTracks = [];
        this.animationMap = { };
        this.morphs = [];
        this.firstFrame = false;
        this.skyboxLoaded = false;

        this.showGraphs = false;
        this.showWireframe = false;
        this.showBounds = false;
        this.showSkeleton = false;
        this.normalLength = 0;
        this.directLightingFactor = 1;
        this.envLightingFactor = 1;
        this.skyboxMip = 1;

        this.dirtyWireframe = false;
        this.dirtyBounds = false;
        this.dirtySkeleton = false;
        this.dirtyNormals = false;
        this.debugBounds = new DebugLines(app, camera);
        this.debugSkeleton = new DebugLines(app, camera);
        this.debugNormals = new DebugLines(app, camera);

        // construct ministats, default off
        this.miniStats = new pcx.MiniStats(app);
        this.miniStats.enabled = false;

        // initialize the envmap
        // @ts-ignore: Missing pc definition
        app.loader.getHandler(pc.ASSET_TEXTURE).parsers.hdr = new HdrParser(app.assets, false);

        // initialize controls
        this.initControls();

        // start the application
        app.start();

        // extract query params. taken from https://stackoverflow.com/a/21152762
        const urlParams: any = {};
        if (location.search) {
            location.search.substr(1).split("&").forEach(function (item) {
                const s = item.split("="),
                    k = s[0],
                    v = s[1] && decodeURIComponent(s[1]);
                (urlParams[k] = urlParams[k] || []).push(v);
            });
        }

        // handle load url param
        const loadUrls = (urlParams.load || []).concat(urlParams.assetUrl || []);
        if (loadUrls.length > 0) {
            for (let i = 0; i < loadUrls.length; ++i) {
                this.load(loadUrls[i]);
            }
        }

        // load the default skybox if one wasn't specified in url params
        // if (!this.skyboxLoaded) {
        //     this.load([{
        //         url: './static/skybox/Helipad_equi_small.png',
        //         filename: './static/skybox/Helipad_equi_small.png'
        //     }]);
        // }

        // set camera position
        if (urlParams.hasOwnProperty('cameraPosition')) {
            const pos = urlParams.cameraPosition[0].split(',').map(Number);
            if (pos.length === 3) {
                this.cameraPosition = new pc.Vec3(pos);
            }
        }
    }

    // flatten a hierarchy of nodes
    private static flatten(node: pc.GraphNode) {
        const result: Array<pc.GraphNode> = [];
        node.forEach(function (n) {
            result.push(n);
        });
        return result;
    }

    // get the set of unique values from the array
    private static distinct(array: Array<any>) {
        const result = [];
        for (let i = 0; i < array.length; ++i) {
            if (result.indexOf(array[i]) === -1) {
                result.push(array[i]);
            }
        }
        return result;
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

        const recurse = function (node: pc.GraphNode) {
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
    private static calcBoundingBoxIntersection = function (bbox1: pc.BoundingBox, bbox2: pc.BoundingBox) {
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
    private initControls() {
        this.controls = new Controls();
        this.controls.onShowStats = this.setStats.bind(this);
        this.controls.onShowWireframe = this.setShowWireframe.bind(this);
        this.controls.onShowBounds = this.setShowBounds.bind(this);
        this.controls.onShowSkeleton = this.setShowSkeleton.bind(this);
        this.controls.onNormalLength = this.setNormalLength.bind(this);
        this.controls.onFov = this.setFov.bind(this);

        this.controls.onDirectLighting = this.setDirectLighting.bind(this);
        this.controls.onEnvLighting = this.setEnvLighting.bind(this);
        this.controls.onSkyboxMip = this.setSkyboxMip.bind(this);

        this.controls.onPlay = this.play.bind(this);
        this.controls.onPlayAnimation = this.play.bind(this);
        this.controls.onStop = this.stop.bind(this);
        this.controls.onSpeed = this.setSpeed.bind(this);
        this.controls.onShowGraphs = this.setShowGraphs.bind(this);

        this.controls.onCanvasResized = this.resizeCanvas.bind(this);
        this.controls.onLoad = this.load.bind(this);
        this.controls.onClearSkybox = this.clearSkybox.bind(this);

        // and initialize the controls
        initControls(this.controls);
    }

    // initialize the faces and prefiltered lighting data from the given
    // skybox texture, which is either a cubemap or equirect texture.
    private initSkyboxFromTexture(skybox: pc.Texture) {
        const app = this.app;
        const device = app.graphicsDevice;

        const cubemaps = [];

        const reprojectToCubemap = function (src: pc.Texture, size: number) {
            // generate faces cubemap
            const faces = new pc.Texture(device, {
                name: 'skyboxFaces',
                cubemap: true,
                width: size,
                height: size,
                type: pc.TEXTURETYPE_RGBM.toString(),
                addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                addressV: pc.ADDRESS_CLAMP_TO_EDGE
            });
            pc.reprojectTexture(device, src, faces);
            return faces;
        };

        if (skybox.cubemap) {
            // @ts-ignore TODO type property missing from pc.Texture
            if (skybox.type === pc.TEXTURETYPE_DEFAULT || skybox.type === pc.TEXTURETYPE_RGBM) {
                // cubemap format is acceptible, use it directly
                cubemaps.push(skybox);
            } else {
                // cubemap must be rgbm or default to be used on the skybox
                cubemaps.push(reprojectToCubemap(skybox, skybox.width));
            }
        } else {
            // reproject equirect to cubemap for skybox
            cubemaps.push(reprojectToCubemap(skybox, skybox.width / 4));
        }

        // generate prefiltered lighting data
        const sizes = [128, 64, 32, 16, 8, 4];
        const specPower = [undefined, 512, 128, 32, 8, 2];
        for (let i = 0; i < sizes.length; ++i) {
            const prefilter = new pc.Texture(device, {
                cubemap: true,
                name: 'skyboxPrefilter' + i,
                width: sizes[i],
                height: sizes[i],
                // @ts-ignore TODO type property missing from pc.Texture
                type: pc.TEXTURETYPE_RGBM,
                addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                addressV: pc.ADDRESS_CLAMP_TO_EDGE
            });
            pc.reprojectTexture(device, cubemaps[1] || skybox, prefilter, specPower[i]);
            cubemaps.push(prefilter);
        }

        // assign the textures to the scene
        app.scene.gammaCorrection = pc.GAMMA_SRGB;
        app.scene.toneMapping = pc.TONEMAP_ACES;
        app.scene.skyboxMip = this.skyboxMip;               // Set the skybox to the 128x128 cubemap mipmap level
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

            const getOrder = function (filename: string) {
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

            const sortPred = function (first: URL, second: URL) {
                const firstOrder = getOrder(first.filename);
                const secondOrder = getOrder(second.filename);
                return firstOrder < secondOrder ? -1 : (secondOrder < firstOrder ? 1 : 0);
            };

            files.sort(sortPred);

            // construct an asset for each cubemap face
            const faceAssets = files.map(function (file, index) {
                const faceAsset = new pc.Asset('skybox_face' + index, 'texture', file);
                app.assets.add(faceAsset);
                app.assets.load(faceAsset);
                return faceAsset;
            });

            // construct the cubemap asset
            const cubemapAsset = new pc.Asset('skybox_cubemap', 'cubemap', null, {
                textures: faceAssets.map(function (faceAsset) {
                    return faceAsset.id;
                })
            });
            // @ts-ignore TODO not defined in pc
            cubemapAsset.loadFaces = true;
            cubemapAsset.on('load', function () {
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
        cubemap.on('load', function () {
            app.scene.gammaCorrection = pc.GAMMA_SRGB;
            app.scene.toneMapping = pc.TONEMAP_ACES;
            app.scene.skyboxMip = this.skyboxMip;                   // Set the skybox to the 128x128 cubemap mipmap level
            app.scene.setSkybox(cubemap.resources);
            app.renderNextFrame = true;                             // ensure we render again when the cubemap arrives

            // generate Helipad_equi.png from cubemaps
            // reproject the heli to equirect
            // const equi = new pc.Texture(app.graphicsDevice, {
            //     name: 'heli_equirect',
            //     width: 2048,
            //     height: 1024,
            //     type: pc.TEXTURETYPE_RGBM
            // });
            // pc.reprojectTexture(app.graphicsDevice, cubemap.resource, equi);
            // pc.downloadTexture(equi, 'Helipad_equi.png', 0, true);

            // pc.downloadTexture(cubemap.resource, 'Helipad_cube.png');
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

        this.graph.clear();
        this.meshInstances = [];

        this.controls.resetScene();

        // reset animation state
        this.stateGraph = {
            layers: [],
            parameters: { }
        };
        this.animTracks = [];
        this.animationMap = { };
        this.controls.animationsLoaded([]);

        this.morphs = [];
        this.controls.morphTargetsLoaded([]);

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

        // provide buffer view callback so we can handle meshoptimizer'd models
        // https://github.com/zeux/meshoptimizer
        const processBufferView = function (gltfBuffer: any, buffers: Array<any>, continuation: (err: string, result: any) => void) {
            if (gltfBuffer.extensions && gltfBuffer.extensions.EXT_meshopt_compression) {
                const extensionDef = gltfBuffer.extensions.EXT_meshopt_compression;

                const decoder = MeshoptDecoder;

                decoder.ready.then(function () {
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
            const u: URL = externalUrls.find(function (url) {
                return url.filename === gltfImage.uri;
            });
            if (u) {
                const textureAsset = new pc.Asset(u.filename, 'texture', { url: u.url, filename: u.filename });
                textureAsset.on('load', function () {
                    continuation(null, textureAsset);
                });
                this.app.assets.add(textureAsset);
                this.app.assets.load(textureAsset);
            } else {
                continuation(null, null);
            }
        };

        const processBuffer = function (gltfBuffer: any, continuation: (err: string, result: any) => void) {
            const u = externalUrls.find(function (url) {
                return url.filename === gltfBuffer.uri;
            });
            if (u) {
                const bufferAsset = new pc.Asset(u.filename, 'binary', { url: u.url, filename: u.filename });
                bufferAsset.on('load', function () {
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
                processAsync: processBufferView
            },
            image: {
                processAsync: processImage
            },
            buffer: {
                processAsync: processBuffer
            }
        });
        containerAsset.on('load', () => {
            this.onLoaded(null, containerAsset);
        });
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

        // convert url strings to url structs
        urls = urls.map(function (url) {
            return typeof url === "string" ? {
                url: url,
                filename: url
            } : url;
        });

        // step through urls loading gltf/glb models
        let result = false;
        urls.forEach((url) =>  {
            const filenameExt = pc.path.getExtension(url.filename).toLowerCase();
            if (filenameExt === '.gltf' || filenameExt === '.glb') {
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
    play(animationName: string, appendAnimation: boolean) {
        if (!animationName || !appendAnimation) {
            for (const key in this.animationMap) {
                if (this.animationMap.hasOwnProperty(key)) {
                    if (animationName) {
                        this.animationMap[key].pause();
                    } else {
                        this.animationMap[key].play('default');
                    }
                }
            }
        }
        if (animationName) {
            this.animationMap[animationName].play('default');
        }
    }

    // stop playing animations
    stop() {
        for (const key in this.animationMap) {
            if (this.animationMap.hasOwnProperty(key)) {
                this.animationMap[key].pause();
            }
        }
    }

    setSpeed(speed: number) {
        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            // @ts-ignore TODO anim property missing from pc.Entity
            if (entity.anim) {
                // @ts-ignore TODO anim property missing from pc.Entity
                entity.anim.speed = speed;
            }
        }
    }

    setShowGraphs(show: boolean) {
        this.showGraphs = show;
        this.renderNextFrame();
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

    setEnvLighting(factor: number) {
        this.app.scene.skyboxIntensity = factor;
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
        for (const key in this.animationMap) {
            if (this.animationMap.hasOwnProperty(key)) {
                if (this.animationMap[key].playing) {
                    isAnimationPlaying = true;
                    break;
                }
            }
        }

        if (isAnimationPlaying) {
            this.dirtyBounds = true;
            this.dirtySkeleton = true;
            this.dirtyNormals = true;
            this.renderNextFrame();

            // copy (possibly) animated morph weights to UI widgets
            for (let i = 0; i < this.morphs.length; ++i) {
                const morph = this.morphs[i];
                if (morph.onWeightChanged) {
                    morph.onWeightChanged();
                }
            }
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

        const removeCommonPrefix = function (urls: Array<URL>) {
            const split = function (pathname: string) {
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

        interface Entry {
            isFile: boolean,
            isDirectory: boolean,
            createReader: any,
            file: any,
            fullPath: string
        }

        const resolveFiles = (entries: Array<Entry>) => {
            const urls: Array<URL> = [];
            entries.forEach((entry: Entry) => {
                entry.file((file: URL) => {
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

        const resolveDirectories = function (entries: Array<Entry>) {
            let awaiting = 0;
            const files: Array<Entry> = [];
            const recurse = function (entries: Array<Entry>) {
                entries.forEach(function (entry: Entry) {
                    if (entry.isFile) {
                        files.push(entry);
                    } else if (entry.isDirectory) {
                        awaiting++;
                        entry.createReader().readEntries(function (subEntries: Array<Entry>) {
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
        document.querySelector('.initial-cta').classList.add('no-cta');
    }

    // container asset has been loaded, add it to the scene
    private onLoaded(err: string, asset: pc.Asset) {
        if (err) {
            return;
        }

        const resource = asset.resource;

        let entity: pc.Entity;
        if (resource.model || this.entities.length === 0) {
            // create entity and add model
            entity = new pc.Entity();
            entity.addComponent("model", {
                type: "asset",
                asset: resource.model,
                castShadows: true
            });
            this.entities.push(entity);
            this.sceneRoot.addChild(entity);
        } else {
            // use the last model that was added to the scene, presumably this is animation data
            // that we want to play on an already-existing model
            entity = this.entities[this.entities.length - 1];
        }

        // create animations
        if (resource.animations && resource.animations.length > 0) {
            // create the anim component if there isn't one already
            // @ts-ignore TODO not defined in pc
            if (!entity.anim) {
                entity.addComponent('anim', {
                    activate: true
                });
            }

            const stateGraph = this.stateGraph;

            // create a layer per animation so we can play them all simultaniously if needed
            for (let i = 0; i < resource.animations.length; ++i) {
                // construct a state graph to include the loaded animations
                stateGraph.layers.push( {
                    name: 'layer_' + this.animTracks.length,
                    states: [
                        { name: 'START' },
                        { name: 'default', speed: 1 },
                        { name: 'END' }
                    ],
                    transitions: [
                        {
                            "from": "START",
                            "to": "default",
                            "time": 0,
                            "priority": 0
                        }
                    ]
                } );

                // store anim track
                this.animTracks.push(resource.animations[i].resource);
            }

            // load the new state graph
            // @ts-ignore TODO anim property missing from pc.Entity
            entity.anim.loadStateGraph(new pc.AnimStateGraph(stateGraph));

            // set animations on each layer
            for (let i = 0; i < this.animTracks.length; ++i) {
                const animTrack = this.animTracks[i];
                // @ts-ignore TODO anim property missing from pc.Entity
                const layer = entity.anim.findAnimationLayer('layer_' + i);
                layer.assignAnimation('default', animTrack);
                layer.pause();
                this.animationMap[animTrack.name] = layer;
            }

            this.controls.animationsLoaded(Object.keys(this.animationMap));

            // create animation graphs
            const createAnimGraphs = function () {
                const graph = this.graph;

                const extract = function (transformPropertyGetter: () => Record<string, number>, dimension: string){
                    return () => transformPropertyGetter()[dimension];
                };

                const recurse = function (node: pc.GraphNode) {
                    if (!graph.hasNode(node)) {
                        graph.addGraph(node, new pc.Color(1, 1, 0, 1), extract(node.getLocalPosition.bind(node), 'x'));
                        graph.addGraph(node, new pc.Color(0, 1, 1, 1), extract(node.getLocalPosition.bind(node), 'y'));
                        graph.addGraph(node, new pc.Color(1, 0, 1, 1), extract(node.getLocalPosition.bind(node), 'z'));

                        graph.addGraph(node, new pc.Color(1, 0, 0, 1), extract(node.getLocalRotation.bind(node), 'x'));
                        graph.addGraph(node, new pc.Color(0, 1, 0, 1), extract(node.getLocalRotation.bind(node), 'y'));
                        graph.addGraph(node, new pc.Color(0, 0, 1, 1), extract(node.getLocalRotation.bind(node), 'z'));
                        graph.addGraph(node, new pc.Color(1, 1, 1, 1), extract(node.getLocalRotation.bind(node), 'w'));

                        graph.addGraph(node, new pc.Color(1.0, 0.5, 0.5, 1), extract(node.getLocalScale.bind(node), 'x'));
                        graph.addGraph(node, new pc.Color(0.5, 1.0, 0.5, 1), extract(node.getLocalScale.bind(node), 'y'));
                        graph.addGraph(node, new pc.Color(0.5, 0.5, 1.0, 1), extract(node.getLocalScale.bind(node), 'z'));
                    }

                    for (let i = 0; i < node.children.length; ++i) {
                        recurse(node.children[i]);
                    }
                };
                recurse(entity);
            };

            // create animation graphs
            setTimeout(createAnimGraphs.bind(this), 1000);
        }

        // initialize morph targets
        if (entity.model && entity.model.model && entity.model.model.morphInstances.length > 0) {
            const morphInstances = entity.model.model.morphInstances;
            // make a list of all the morph instance target names
            const morphs: Array<Morph> = this.morphs;
            morphInstances.forEach((morphInstance, morphIndex) => {
                // @ts-ignore TODO expose meshInstance on morphInstance in pc
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
                        setWeight: (weight: number) => {
                            morphInstance.setWeight(targetIndex, weight);
                            this.dirtyNormals = true;
                            this.renderNextFrame();
                        },
                        getWeight: pc.MorphInstance.prototype.getWeight.bind(morphInstance, targetIndex),
                        onWeightChanged: null    // controls can set this to a function for receiving weight updates
                    });
                });
            });

            this.controls.morphTargetsLoaded(morphs);
        }

        // store the loaded asset
        this.assets.push(asset);

        // construct a list of meshInstances so we can quick access them when configuring
        // wireframe rendering etc.
        this.meshInstances = this.meshInstances.concat(
            Viewer.distinct(
                Viewer.flatten(entity)
                    .map( function (node: pc.Entity) {
                        return node.model ? node.model.meshInstances || [] : [];
                    })
                    .flat()));

        // if no meshes are loaded then enable skeleton rendering so user can see something
        if (this.meshInstances.length === 0) {
            this.controls.setShowSkeleton(true);
        }

        // dirty everything
        this.dirtyWireframe = this.dirtyBounds = this.dirtySkeleton = this.dirtyNormals = true;

        // we can't refocus the camera here because the scene hierarchy only gets updated
        // during render. we must instead set a flag, wait for a render to take place and
        // then focus the camera.
        this.firstFrame = true;
        this.renderNextFrame();
        this.clearCta();
    }

    // generate and render debug elements on prerender
    private onPrerender() {
        if (this.showGraphs) {
            this.graph.update();
            this.graph.render();
        }

        if (!this.firstFrame) {                          // don't update on the first frame
            let meshInstance;

            // wireframe
            if (this.dirtyWireframe) {
                this.dirtyWireframe = false;
                for (let i = 0; i < this.meshInstances.length; ++i) {
                    meshInstance = this.meshInstances[i];
                    if (this.showWireframe) {
                        if (!meshInstance.mesh.primitive[pc.RENDERSTYLE_WIREFRAME]) {
                            // @ts-ignore TODO not defined in pc
                            meshInstance.mesh.generateWireframe();
                        }
                        meshInstance.renderStyle = pc.RENDERSTYLE_WIREFRAME;
                    } else {
                        meshInstance.renderStyle = pc.RENDERSTYLE_SOLID;
                    }
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
                        // @ts-ignore TODO not defined in pc
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
                        if (entity.model && entity.model.model) {
                            this.debugSkeleton.generateSkeleton(entity.model.model.graph);
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
