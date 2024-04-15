import { Entity, Vec2, Vec3, math } from 'playcanvas';
import { BaseCamera } from './base-camera';

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpVa = new Vec2();
const tmpV1 = new Vec3();

const PASSIVE: any = { passive: false };

class MultiCamera extends BaseCamera {
    lookSensitivity: number = 0.2;

    lookDamping: number = 0.97;

    moveDamping: number = 0.98;

    mousePanSpeed: number = 1;

    mobilePanSpeed: number = 0.025;

    pinchSpeed: number = 0.025;

    wheelSpeed: number = 0.005;

    zoomThreshold: number = 0.01;

    zoomExp: number = 0.5;

    moveSpeed: number = 2;

    sprintSpeed: number = 4;

    private _pointerEvents: Map<number, PointerEvent> = new Map();

    private _lastPinchDist: number = -1;

    private _lastPosition = new Vec2();

    private _panning: boolean = false;

    private _flying: boolean = false;

    private _key = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
        sprint: false
    };

    constructor() {
        super();
        this._onWheel = this._onWheel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    get point() {
        return this._origin;
    }

    get start() {
        return this._camera.getPosition();
    }

    protected _onPointerDown(event: PointerEvent) {
        if (!this._camera) {
            return;
        }
        this._pointerEvents.set(event.pointerId, event);
        if (this._pointerEvents.size === 2) {
            this._lastPinchDist = this._getPinchDist();
            this._getMidPoint(this._lastPosition);
            this._panning = true;
        }
        if (event.shiftKey) {
            this._lastPosition.set(event.clientX, event.clientY);
            this._panning = true;
        }
        if (event.button === 2) {
            this._zoom = this._focusDist;
            this._origin.copy(this._camera.getPosition());
            this._position.copy(this._origin);
            this._camera.setLocalPosition(0, 0, 0);
            this._flying = true;
        }
    }

    protected _onPointerMove(event: PointerMoveEvent) {
        if (this._pointerEvents.size === 0) {
            return;
        }

        this._pointerEvents.set(event.pointerId, event);

        if (this._pointerEvents.size === 1) {
            if (this._panning) {
                // pan
                this._pan(tmpVa.set(event.clientX, event.clientY), this.mousePanSpeed);
            } else {
                super._look(event);
            }
            return;
        }

        if (this._pointerEvents.size === 2) {
            // pan
            this._pan(this._getMidPoint(tmpVa), this.mobilePanSpeed);

            // pinch zoom
            const pinchDist = this._getPinchDist();
            if (this._lastPinchDist > 0) {
                const zoomMult = (this._lastPinchDist - pinchDist) * this.sceneSize * this.pinchSpeed;
                this._zoom = Math.max(this._zoom + zoomMult * (this._zoom * this.zoomExp + this.zoomThreshold), 0);
            }
            this._lastPinchDist = pinchDist;
        }

    }

    protected _onPointerUp(event: PointerEvent) {
        this._pointerEvents.delete(event.pointerId);
        if (this._pointerEvents.size < 2) {
            this._lastPinchDist = -1;
            this._panning = false;
        }
        if (this._panning) {
            this._panning = false;
        }
        if (event.button === 2) {
            tmpV1.copy(this.entity.forward).mulScalar(this._zoom);
            this._origin.add(tmpV1);
            this._position.add(tmpV1);
            this._flying = false;
        }
    }

    private _onWheel(event: WheelEvent) {
        event.preventDefault();
        const zoomMult = event.deltaY * this.sceneSize * this.wheelSpeed;
        this._zoom = Math.max(this._zoom + zoomMult * (this._zoom * this.zoomExp + this.zoomThreshold), 0);
    }

    private _onKeyDown(event: KeyboardEvent) {
        event.stopPropagation();
        switch (event.key.toLowerCase()) {
            case 'w':
                this._key.forward = true;
                break;
            case 's':
                this._key.backward = true;
                break;
            case 'a':
                this._key.left = true;
                break;
            case 'd':
                this._key.right = true;
                break;
            case 'q':
                this._key.up = true;
                break;
            case 'e':
                this._key.down = true;
                break;
            case 'shift':
                this._key.sprint = true;
                break;
        }
    }

    private _onKeyUp(event: KeyboardEvent) {
        event.stopPropagation();
        switch (event.key.toLowerCase()) {
            case 'w':
                this._key.forward = false;
                break;
            case 's':
                this._key.backward = false;
                break;
            case 'a':
                this._key.left = false;
                break;
            case 'd':
                this._key.right = false;
                break;
            case 'q':
                this._key.up = false;
                break;
            case 'e':
                this._key.down = false;
                break;
            case 'shift':
                this._key.sprint = false;
                break;
        }
    }

    private _move(dt: number) {
        tmpV1.set(0, 0, 0);
        if (this._key.forward) {
            tmpV1.add(this.entity.forward);
        }
        if (this._key.backward) {
            tmpV1.sub(this.entity.forward);
        }
        if (this._key.left) {
            tmpV1.sub(this.entity.right);
        }
        if (this._key.right) {
            tmpV1.add(this.entity.right);
        }
        if (this._key.up) {
            tmpV1.add(this.entity.up);
        }
        if (this._key.down) {
            tmpV1.sub(this.entity.up);
        }
        tmpV1.normalize();
        const speed = this._key.sprint ? this.sprintSpeed : this.moveSpeed;
        tmpV1.mulScalar(this.sceneSize * speed * dt);
        this._origin.add(tmpV1);
    }

    private _getMidPoint(out: Vec2) {
        const [a, b] = this._pointerEvents.values();
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return out.set(b.clientX + dx * 0.5, b.clientY + dy * 0.5);
    }

    private _getPinchDist() {
        const [a, b] = this._pointerEvents.values();
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private _pan(pos: Vec2, speed = 1) {
        const distance = Math.abs(this._zoom);

        const last = this._camera.camera.screenToWorld(this._lastPosition.x, this._lastPosition.y, distance);
        const current = this._camera.camera.screenToWorld(pos.x, pos.y, distance);

        tmpV1.sub2(last, current);
        tmpV1.mulScalar(speed * this.sceneSize);

        this._origin.add(tmpV1);

        this._lastPosition.copy(pos);
    }

    focus(point: Vec3, start?: Vec3, dir?: Vec2, snap?: boolean) {
        if (!this._camera) {
            return;
        }
        if (!start) {
            this._origin.copy(point);
            return;
        }

        tmpV1.sub2(start, point);
        if (dir) {
            this._dir.copy(dir);
        } else {
            const elev = Math.atan2(tmpV1.y, tmpV1.z) * math.RAD_TO_DEG;
            const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
            this._dir.set(-elev, -azim);
        }

        this._origin.copy(point);
        this._camera.setPosition(start);

        if (snap) {
            this._angles.set(this._dir.x, this._dir.y, 0);
            this._position.copy(this._origin);
        }

        this._zoom = tmpV1.length();
    }

    attach(camera: Entity) {
        super.attach(camera);

        window.addEventListener('wheel', this._onWheel, PASSIVE);
        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    detach() {
        super.detach();

        window.removeEventListener('wheel', this._onWheel, PASSIVE);
        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);

        this._pointerEvents.clear();
        this._lastPinchDist = -1;
        this._panning = false;
        this._key = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false,
            sprint: false
        };
    }

    update(dt: number) {
        if (!this._camera) {
            return;
        }

        if (!this._flying) {
            this._focusDist = math.lerp(this._focusDist, this._zoom, 1 - Math.pow(this.moveDamping, dt * 1000));
            this._camera.setLocalPosition(0, 0, this._focusDist);
        }

        this._move(dt);

        super.update(dt);
    }
}

export { MultiCamera };
