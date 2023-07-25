import {
    EVENT_MOUSEDOWN,
    EVENT_MOUSEUP,
    EVENT_MOUSEMOVE,
    EVENT_MOUSEWHEEL,
    MOUSEBUTTON_LEFT,
    MOUSEBUTTON_MIDDLE,
    MOUSEBUTTON_RIGHT,
    EVENT_TOUCHSTART,
    EVENT_TOUCHEND,
    EVENT_TOUCHCANCEL,
    EVENT_TOUCHMOVE,
    KEY_W, KEY_S, KEY_A, KEY_D, KEY_Q, KEY_E, KEY_SHIFT,
    math,
    Entity,
    MouseEvent,
    Touch,
    TouchEvent,
    KeyboardEvent,
    Vec2,
    Vec3
} from 'playcanvas';

import { App } from './app';

class SmoothedValue {
    value: any;
    start: any;
    target: any;
    transitionTime: number;
    timer: number;

    constructor(value: any, transitionTime = 0.25) {
        this.value = value.clone();
        this.start = value.clone();
        this.target = value.clone();
        this.transitionTime = transitionTime;
        this.timer = 0;
    }

    goto(target: any) {
        this.timer = 0;
        this.start.copy(this.value);
        this.target.copy(target);
    }

    snapto(value: any) {
        this.timer = this.transitionTime;
        this.target.copy(value);
    }

    update(deltaTime: number) {
        if (this.timer < this.transitionTime) {
            this.timer = Math.min(this.timer + deltaTime, this.transitionTime);
            const n = this.timer / this.transitionTime;
            // const t = Math.sin(n * Math.PI / 2.0);        // sinosidal
            // const t = n * (2 - n);                        // quadratic
            // const t = 1 - --n * n * n * n;                // quartic
            const t = Math.pow(n - 1, 5) + 1;               // quintic
            this.value.lerp(this.start, this.target, t);
        } else {
            this.value.copy(this.target);
        }
    }
}

const vec = new Vec3();
const fromWorldPoint = new Vec3();
const toWorldPoint = new Vec3();
const worldDiff = new Vec3();

class OrbitCamera {
    cameraNode: Entity;
    focalPoint: SmoothedValue;
    azimElevDistance: SmoothedValue;

    constructor(cameraNode: Entity, transitionTime: number) {
        this.cameraNode = cameraNode;
        this.focalPoint = new SmoothedValue(new Vec3(0, 0, 0), transitionTime);
        this.azimElevDistance = new SmoothedValue(new Vec3(0, 0, 1), transitionTime);
    }

    vecToAzimElevDistance(vec: Vec3, azimElevDistance: Vec3) {
        const distance = vec.length();
        const azim = Math.atan2(-vec.x / distance, -vec.z / distance) * math.RAD_TO_DEG;
        const elev = Math.asin(vec.y / distance) * math.RAD_TO_DEG;
        azimElevDistance.set(azim, elev, distance);
    }

    // calculate the current forward vector
    calcForwardVec(result: Vec3) {
        const ex = this.azimElevDistance.value.y * math.DEG_TO_RAD;
        const ey = this.azimElevDistance.value.x * math.DEG_TO_RAD;
        const s1 = Math.sin(-ex);
        const c1 = Math.cos(-ex);
        const s2 = Math.sin(-ey);
        const c2 = Math.cos(-ey);
        result.set(-c1 * s2, s1, c1 * c2);
    }

    update(deltaTime: number) {
        // update underlying values
        this.focalPoint.update(deltaTime);
        this.azimElevDistance.update(deltaTime);

        const aed = this.azimElevDistance.value;
        this.calcForwardVec(vec);
        vec.mulScalar(aed.z);
        vec.add(this.focalPoint.value);

        this.cameraNode.setLocalPosition(vec);
        this.cameraNode.setLocalEulerAngles(aed.y, aed.x, 0);
    }
}

// OrbitCameraInputMouse

class OrbitCameraInputMouse {
    app: App;
    orbitCamera: OrbitCamera;
    orbitSensitivity = 0.3;
    distanceSensitivity = 0.4;
    lookButtonDown = false;
    panButtonDown = false;
    lastPoint = new Vec2();

    onMouseOutFunc = () => {
        this.onMouseOut();
    };

    constructor(app: App, orbitCamera: OrbitCamera) {
        this.app = app;
        this.orbitCamera = orbitCamera;

        this.app.mouse.on(EVENT_MOUSEDOWN, this.onMouseDown, this);
        this.app.mouse.on(EVENT_MOUSEUP, this.onMouseUp, this);
        this.app.mouse.on(EVENT_MOUSEMOVE, this.onMouseMove, this);
        this.app.mouse.on(EVENT_MOUSEWHEEL, this.onMouseWheel, this);

        // Listen to when the mouse travels out of the window
        window.addEventListener('mouseout', this.onMouseOutFunc, false);

        // Disabling the context menu stops the browser displaying a menu when
        // you right-click the page
        this.app.mouse.disableContextMenu();
    }

    destroy() {
        this.app.mouse.off(EVENT_MOUSEDOWN, this.onMouseDown, this);
        this.app.mouse.off(EVENT_MOUSEUP, this.onMouseUp, this);
        this.app.mouse.off(EVENT_MOUSEMOVE, this.onMouseMove, this);
        this.app.mouse.off(EVENT_MOUSEWHEEL, this.onMouseWheel, this);

        window.removeEventListener('mouseout', this.onMouseOutFunc, false);
    }

    pan(screenPoint: MouseEvent) {
        // For panning to work at any zoom level, we use screen point to world projection
        // to work out how far we need to pan the pivotEntity in world space
        const camera = this.orbitCamera.cameraNode.camera;
        const distance = this.orbitCamera.azimElevDistance.value.z;

        camera.screenToWorld(screenPoint.x, screenPoint.y, distance, fromWorldPoint);
        camera.screenToWorld(this.lastPoint.x, this.lastPoint.y, distance, toWorldPoint);

        worldDiff.sub2(toWorldPoint, fromWorldPoint);
        worldDiff.add(this.orbitCamera.focalPoint.target);

        this.orbitCamera.focalPoint.goto(worldDiff);
    }


    onMouseDown(event: MouseEvent) {
        switch (event.button) {
            case MOUSEBUTTON_LEFT:
                this.lookButtonDown = true;
                break;
            case MOUSEBUTTON_MIDDLE:
            case MOUSEBUTTON_RIGHT:
                this.panButtonDown = true;
                break;
        }
    }

    onMouseUp(event: MouseEvent) {
        switch (event.button) {
            case MOUSEBUTTON_LEFT:
                this.lookButtonDown = false;
                break;
            case MOUSEBUTTON_MIDDLE:
            case MOUSEBUTTON_RIGHT:
                this.panButtonDown = false;
                break;
        }
    }

    onMouseMove(event: MouseEvent) {
        if (this.lookButtonDown) {
            vec.copy(this.orbitCamera.azimElevDistance.target);
            vec.y -= event.dy * this.orbitSensitivity;
            vec.x -= event.dx * this.orbitSensitivity;
            this.orbitCamera.azimElevDistance.goto(vec);
        } else if (this.panButtonDown) {
            this.pan(event);
        }

        this.lastPoint.set(event.x, event.y);
    }

    onMouseWheel(event: MouseEvent) {
        vec.copy(this.orbitCamera.azimElevDistance.target);
        vec.z -= event.wheelDelta * -2 * this.distanceSensitivity * (vec.z * 0.1);
        this.orbitCamera.azimElevDistance.goto(vec);
        event.event.preventDefault();
    }

    onMouseOut() {
        this.lookButtonDown = false;
        this.panButtonDown = false;
    }
}

// OrbitCameraInputTouch

class OrbitCameraInputTouch {
    app: App;
    orbitCamera: OrbitCamera;
    orbitSensitivity = 0.3;
    distanceSensitivity = 0.4;
    lastTouchPoint = new Vec2();
    lastPinchMidPoint = new Vec2();
    lastPinchDistance = 0;
    pinchMidPoint = new Vec2();

    constructor(app: App, orbitCamera: OrbitCamera) {
        this.app = app;
        this.orbitCamera = orbitCamera;

        if (this.app.touch) {
            // Use the same callback for the touchStart, touchEnd and touchCancel events as they
            // all do the same thing which is to deal the possible multiple touches to the screen
            this.app.touch.on(EVENT_TOUCHSTART, this.onTouchStartEndCancel, this);
            this.app.touch.on(EVENT_TOUCHEND, this.onTouchStartEndCancel, this);
            this.app.touch.on(EVENT_TOUCHCANCEL, this.onTouchStartEndCancel, this);

            this.app.touch.on(EVENT_TOUCHMOVE, this.onTouchMove, this);
        }
    }

    destroy() {
        this.app.touch.off(EVENT_TOUCHSTART, this.onTouchStartEndCancel, this);
        this.app.touch.off(EVENT_TOUCHEND, this.onTouchStartEndCancel, this);
        this.app.touch.off(EVENT_TOUCHCANCEL, this.onTouchStartEndCancel, this);
        this.app.touch.off(EVENT_TOUCHMOVE, this.onTouchMove, this);
    }

    getPinchDistance(pointA: Touch, pointB: Touch) {
        // Return the distance between the two points
        const dx = pointA.x - pointB.x;
        const dy = pointA.y - pointB.y;
        return Math.sqrt((dx * dx) + (dy * dy));
    }

    calcMidPoint(pointA: Touch, pointB: Touch, result: Vec2) {
        result.set(pointB.x - pointA.x, pointB.y - pointA.y);
        result.mulScalar(0.5);
        result.x += pointA.x;
        result.y += pointA.y;
    }

    onTouchStartEndCancel(event: TouchEvent) {
        // We only care about the first touch for camera rotation. As the user touches the screen,
        // we stored the current touch position
        const touches = event.touches;
        if (touches.length === 1) {
            this.lastTouchPoint.set(touches[0].x, touches[0].y);
        } else if (touches.length === 2) {
            // If there are 2 touches on the screen, then set the pinch distance
            this.lastPinchDistance = this.getPinchDistance(touches[0], touches[1]);
            this.calcMidPoint(touches[0], touches[1], this.lastPinchMidPoint);
        }
    }

    pan(midPoint: Vec2) {
        // For panning to work at any zoom level, we use screen point to world projection
        // to work out how far we need to pan the pivotEntity in world space
        const camera = this.orbitCamera.cameraNode.camera;
        const distance = this.orbitCamera.azimElevDistance.target.z;

        camera.screenToWorld(midPoint.x, midPoint.y, distance, fromWorldPoint);
        camera.screenToWorld(this.lastPinchMidPoint.x, this.lastPinchMidPoint.y, distance, toWorldPoint);

        worldDiff.sub2(toWorldPoint, fromWorldPoint);
        worldDiff.add(this.orbitCamera.focalPoint.target);

        this.orbitCamera.focalPoint.goto(worldDiff);
    }

    onTouchMove(event: TouchEvent) {
        const pinchMidPoint = this.pinchMidPoint;

        const aed = this.orbitCamera.azimElevDistance.target.clone();

        // We only care about the first touch for camera rotation. Work out the difference moved since the last event
        // and use that to update the camera target position
        const touches = event.touches;
        if (touches.length === 1) {
            const touch = touches[0];
            aed.y -= (touch.y - this.lastTouchPoint.y) * this.orbitSensitivity;
            aed.x -= (touch.x - this.lastTouchPoint.x) * this.orbitSensitivity;
            this.orbitCamera.azimElevDistance.goto(aed);
            this.lastTouchPoint.set(touch.x, touch.y);
        } else if (touches.length === 2) {
            // Calculate the difference in pinch distance since the last event
            const currentPinchDistance = this.getPinchDistance(touches[0], touches[1]);
            const diffInPinchDistance = currentPinchDistance - this.lastPinchDistance;
            this.lastPinchDistance = currentPinchDistance;

            aed.z -= (diffInPinchDistance * this.distanceSensitivity * 0.1) * (aed.z * 0.1);
            this.orbitCamera.azimElevDistance.goto(aed);

            // Calculate pan difference
            this.calcMidPoint(touches[0], touches[1], pinchMidPoint);
            this.pan(pinchMidPoint);
            this.lastPinchMidPoint.copy(pinchMidPoint);
        }
    }
}

// fly controls
class OrbitCameraInputKeyboard {
    // forward, back, left, right, up, down
    app: App;
    orbitCamera: OrbitCamera;
    controls = [ false, false, false, false, false, false ];
    shift = false;

    constructor(app: App, orbitCamera: OrbitCamera) {
        this.app = app;
        this.orbitCamera = orbitCamera;

        app.keyboard.on('keydown', (event: KeyboardEvent) => {
            switch (event.key) {
                case KEY_W: this.controls[0] = true; break;
                case KEY_S: this.controls[1] = true; break;
                case KEY_A: this.controls[2] = true; break;
                case KEY_D: this.controls[3] = true; break;
                case KEY_Q: this.controls[4] = true; break;
                case KEY_E: this.controls[5] = true; break;
            }
        });

        app.keyboard.on('keyup', (event: KeyboardEvent) => {
            switch (event.key) {
                case KEY_W: this.controls[0] = false; break;
                case KEY_S: this.controls[1] = false; break;
                case KEY_A: this.controls[2] = false; break;
                case KEY_D: this.controls[3] = false; break;
                case KEY_Q: this.controls[4] = false; break;
                case KEY_E: this.controls[5] = false; break;
            }
        });
    }

    update(deltaTime: number, sceneSize: number) {
        const move = (dir: Vec3, amount: number) => {
            vec.copy(dir).mulScalar(deltaTime * sceneSize * amount);
            vec.add(this.orbitCamera.focalPoint.value);
            this.orbitCamera.focalPoint.goto(vec);
        };

        const speed = this.app.keyboard.isPressed(KEY_SHIFT) ? 10 : 2;

        if (this.controls[0]) {
            move(this.orbitCamera.cameraNode.forward, speed);
        }
        if (this.controls[1]) {
            move(this.orbitCamera.cameraNode.forward, -speed);
        }
        if (this.controls[2]) {
            move(this.orbitCamera.cameraNode.right, -speed);
        }
        if (this.controls[3]) {
            move(this.orbitCamera.cameraNode.right, speed);
        }
        if (this.controls[4]) {
            move(this.orbitCamera.cameraNode.up, speed);
        }
        if (this.controls[5]) {
            move(this.orbitCamera.cameraNode.up, -speed);
        }
    }
}

export {
    OrbitCamera,
    OrbitCameraInputMouse,
    OrbitCameraInputTouch,
    OrbitCameraInputKeyboard
};
