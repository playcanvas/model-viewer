import { App } from './app';
import { Observer } from '@playcanvas/observer';

import {
    XRSPACE_LOCAL,
    XRSPACE_VIEWER,
    XRTRACKABLE_POINT,
    XRTRACKABLE_PLANE,
    XRTRACKABLE_MESH,
    XRTYPE_AR,

    Color,
    Entity,
    Quat,
    Ray,
    Vec3,
    XrHitTestSource
} from 'playcanvas';

interface XrHandlers {
    starting: () => void;
    started: () => void;
    place: (position: Vec3) => void;
    rotate: (angle: number) => void;
    updateLighting: (intensity: number, color: Color, rotation: Quat, sphericalHarmonics?: Float32Array) => void;
    onUpdate: (deltaTime: number) => void;
    onPrerender: () => void;
    ended: () => void;
}

class XRInput {
    dom: HTMLDivElement;

    suppressNextTouch = false;

    touches: Map<number, {
        previous: { x: number, y: number },
        current: { x: number, y: number }
    }> = new Map();

    onRotate: (angle: number) => void;

    onPointerDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        this.touches.set(e.pointerId, {
            previous: { x: e.clientX, y: e.clientY },
            current: { x: e.clientX, y: e.clientY }
        });
    };

    onPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const touch = this.touches.get(e.pointerId);
        if (touch) {
            touch.previous.x = touch.current.x;
            touch.previous.y = touch.current.y;
            touch.current.x = e.clientX;
            touch.current.y = e.clientY;
        }

        if (this.touches.size === 2) {
            const ids = Array.from(this.touches.keys());
            const a = this.touches.get(ids[0]);
            const b = this.touches.get(ids[1]);

            const previousAngle = Math.atan2(b.previous.y - a.previous.y, b.previous.x - a.previous.x);
            const currentAngle = Math.atan2(b.current.y - a.current.y, b.current.x - a.current.x);
            const angle = currentAngle - previousAngle;

            if (angle !== 0) {
                this.onRotate?.(angle * -180 / Math.PI);
            }
        }
    };

    onPointerUp = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        this.suppressNextTouch ||= this.touches.size === 2;
        this.touches.delete(e.pointerId);
    };

    constructor() {
        this.dom = document.createElement('div');
        this.dom.style.position = 'fixed';
        this.dom.style.top = '0';
        this.dom.style.left = '0';
        this.dom.style.width = '100%';
        this.dom.style.height = '100%';
        this.dom.style.opacity = '0';
        this.dom.style.touchAction = 'none';
        this.dom.style.display = 'none';
        document.body.appendChild(this.dom);
    }

    started() {
        this.dom.style.display = 'block';
        this.dom.addEventListener('pointerdown', this.onPointerDown);
        this.dom.addEventListener('pointermove', this.onPointerMove);
        this.dom.addEventListener('pointerup', this.onPointerUp);
    }

    ended() {
        this.dom.style.display = 'none';
        this.dom.removeEventListener('pointerdown', this.onPointerDown);
        this.dom.removeEventListener('pointermove', this.onPointerMove);
        this.dom.removeEventListener('pointerup', this.onPointerUp);
    }
}

class XrMode {
    app: App;
    camera: Entity;
    observer: Observer;
    handlers: XrHandlers;

    ray = new Ray();

    supported = false;
    active = false;

    // light estimation
    intensity = 1;
    color = new Color(1, 1, 1);
    rotation = new Quat();

    // dom input
    input = new XRInput();

    constructor(app: App, camera: Entity, observer: Observer, handlers: XrHandlers) {
        this.app = app;
        this.camera = camera;
        this.observer = observer;
        this.handlers = handlers;

        // set xr supported
        observer.set('xrSupported', false);
        observer.set('xrActive', false);

        // xr is supported
        if (this.app.xr.supported) {
            // set input overlay element
            app.xr.domOverlay.root = this.input.dom;
            this.input.onRotate = (angle: number) => {
                this.handlers.rotate(angle);
            };

            app.xr.on("available:" + XRTYPE_AR, (available: boolean) => {
                this.supported = available;
                observer.set('xrSupported', !!available);
            });

            app.xr.on("start", () => {
                this.active = true;
                observer.set('xrActive', true);
                this.onStarted();
            });

            app.xr.on("end", () => {
                this.active = false;
                observer.set('xrActive', false);
                this.onEnded();
            });
        }
    }

    // callback when xr session has started
    private onStarted() {
        console.log("Immersive AR session has started");

        // application started handler
        this.handlers.started();

        // perform initial hittest
        this.performXrHitTest(null);

        // request light estimation
        if (this.app.xr.lightEstimation) {
            this.app.xr.lightEstimation.start();
        }

        // handle user input
        this.app.xr.input.on('select', (inputSource: any) => {
            const direction = inputSource.getDirection().clone().normalize();

            this.performXrHitTest(new Ray(inputSource.getOrigin(), direction));
        });

        // handle dom input
        this.input.started();
    }

    // callback when xr session ends
    private onEnded() {
        console.log("Immersive AR session has ended");

        this.input.ended();

        this.handlers.ended();
    }

    // perform xr hittest
    private performXrHitTest(ray: Ray | null) {
        if (ray) {
            // transform ray to view local space
            const view = this.app.xr.views?.[0];
            if (view) {
                view.viewOffMat.transformPoint(ray.origin, this.ray.origin);
                view.viewOffMat.transformVector(ray.direction, this.ray.direction);
            }
        }

        // perform hittest
        this.app.xr.hitTest.start({
            spaceType: XRSPACE_VIEWER,
            entityTypes: [XRTRACKABLE_POINT, XRTRACKABLE_PLANE, XRTRACKABLE_MESH],
            offsetRay: ray ? this.ray : null,
            callback: (err: Error | null, hitTestSource: XrHitTestSource) => {
                if (err) {
                    console.log(err);
                } else {
                    hitTestSource.on('result', (position: Vec3) => {
                        hitTestSource.remove();
                        if (this.input.suppressNextTouch) {
                            // after rotating the view we also get a place event (which
                            // we don't want).
                            this.input.suppressNextTouch = false;
                        } else {
                            this.handlers.place(position);
                        }
                    });
                }
            }
        });
    }

    // start the XR session
    start() {
        if (this.app.xr.isAvailable(XRTYPE_AR)) {
            this.handlers.starting();
            this.app.xr.start(this.camera.camera, XRTYPE_AR, XRSPACE_LOCAL, {
                callback: (err: Error | null) => {
                    if (err) {
                        console.log(err);
                    }
                }
            });
        }
    }

    onUpdate(deltaTime: number) {
        if (this.active) {
            this.handlers.onUpdate(deltaTime);
        }
    }

    onPrerender() {
        if (this.active) {
            // update clip planes
            const camera = this.camera.camera.camera;
            this.app.xr._setClipPlanes(camera._nearClip, camera._farClip);

            // light estimation
            const le = this.app.xr.lightEstimation;
            if (le.available) {
                this.intensity = le.intensity ?? 1;
                if (le.color) {
                    // convert linear color to gamma space (since the engine will convert gamma to linear)
                    this.color.r = Math.pow(le.color.r, 1.0 / 2.2);
                    this.color.g = Math.pow(le.color.g, 1.0 / 2.2);
                    this.color.b = Math.pow(le.color.b, 1.0 / 2.2);
                }
                if (le.rotation) {
                    this.rotation.copy(le.rotation);
                }
                this.handlers.updateLighting(this.intensity, this.color, this.rotation, le.sphericalHarmonics);
            }

            this.handlers.onPrerender();
        }
    }

    getCameraMatrix() {
        return this.active ? this.app.xr.views[0].viewInvOffMat : this.camera.getWorldTransform();
    }
}

export {
    XrMode
};
