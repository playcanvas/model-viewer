
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
    place: (position: Vec3, rotation: Quat) => void;
    updateLighting: (intensity: number, color: Color, rotation: Quat) => void;
    ended: () => void;
};

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
        this.performXrHitTest(null, (position: Vec3) => {
            this.handlers.place(position, Quat.IDENTITY);
        });

        // request light estimation
        if (this.app.xr.lightEstimation) {
            this.app.xr.lightEstimation.start();
        }

        // handle user input
        this.app.xr.input.on('select', (inputSource: any) => {
            const direction = inputSource.getDirection().clone().normalize();

            this.performXrHitTest(new Ray(inputSource.getOrigin(), direction), (position: Vec3) => {
                this.handlers.place(position, Quat.IDENTITY);
            });
        }); 
    }

    // callback when xr session ends
    private onEnded() {
        console.log("Immersive AR session has ended");

        this.handlers.ended();
    }

    // perform xr hittest
    private performXrHitTest(ray: Ray | null, callback: (position: Vec3) => void) {
        if (ray) {
            // transform ray to view local space
            const view = this.app.xr.views?.[0];
            view.viewOffMat.transformPoint(ray.origin, this.ray.origin);
            view.viewOffMat.transformVector(ray.direction, this.ray.direction);
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
                    hitTestSource.on('result', (position: Vec3, rotation: Quat) => {
                        hitTestSource.remove();
                        callback(position);
                    });
                }
            }
        });
    }

    // start the XR session
    start() {
        if (this.app.xr.isAvailable(XRTYPE_AR)) {
            this.camera.setLocalPosition(0, 0, 0);
            this.camera.setLocalEulerAngles(0, 0, 0);

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
                    // convert color to gamma space
                    this.color.r = Math.pow(le.color.r, 1.0 / 2.2);
                    this.color.g = Math.pow(le.color.g, 1.0 / 2.2);
                    this.color.b = Math.pow(le.color.b, 1.0 / 2.2);
                }
                if (le.rotation) {
                    this.rotation.copy(le.rotation);
                }
                this.handlers.updateLighting(this.intensity, this.color, this.rotation);
            }    
        }
    }

    getCameraMatrix() {
        return this.active ? this.app.xr.views[0].viewInvOffMat : this.camera.getWorldTransform();
    }
}

export {
    XrMode
};
