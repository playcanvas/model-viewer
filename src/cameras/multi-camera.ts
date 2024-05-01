import { Entity, Vec2, Vec3, Ray, Plane, math } from 'playcanvas';
import { BaseCamera } from './base-camera';

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpVa = new Vec2();
const tmpV1 = new Vec3();
const tmpV2 = new Vec3();
const tmpR1 = new Ray();
const tmpP1 = new Plane();

const PASSIVE: any = { passive: false };

class MultiCamera extends BaseCamera {
    lookSensitivity: number = 0.2;

    lookDamping: number = 0.97;

    moveDamping: number = 0.98;

    pinchSpeed: number = 5;

    wheelSpeed: number = 0.005;

    zoomMin: number = 0.001;

    zoomMax: number = 10;

    zoomScaleMin: number = 0.01;

    moveSpeed: number = 2;

    sprintSpeed: number = 4;

    crouchSpeed: number = 1;

    private _zoomDist: number = 0;

    private _cameraDist: number = 0;

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
        sprint: false,
        crouch: false
    };

    constructor(target: HTMLElement, options: Record<string, any> = {}) {
        super(target, options);

        this.pinchSpeed = options.pinchSpeed ?? this.pinchSpeed;
        this.wheelSpeed = options.wheelSpeed ?? this.wheelSpeed;
        this.zoomMin = options.zoomMin ?? this.zoomMin;
        this.zoomMax = options.zoomMax ?? this.zoomMax;
        this.moveSpeed = options.moveSpeed ?? this.moveSpeed;
        this.sprintSpeed = options.sprintSpeed ?? this.sprintSpeed;
        this.crouchSpeed = options.crouchSpeed ?? this.crouchSpeed;

        this._onWheel = this._onWheel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
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
        if (event.shiftKey || event.button === 1) {
            this._lastPosition.set(event.clientX, event.clientY);
            this._panning = true;
        }
        if (event.button === 2) {
            this._zoomDist = this._cameraDist;
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
                // mouse pan
                this._pan(tmpVa.set(event.clientX, event.clientY));
            } else {
                super._look(event);
            }
            return;
        }

        if (this._pointerEvents.size === 2) {
            // touch pan
            this._pan(this._getMidPoint(tmpVa));

            // pinch zoom
            const pinchDist = this._getPinchDist();
            if (this._lastPinchDist > 0) {
                this._zoom((this._lastPinchDist - pinchDist) * this.pinchSpeed);
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
        if (this._flying) {
            tmpV1.copy(this.entity.forward).mulScalar(this._zoomDist);
            this._origin.add(tmpV1);
            this._position.add(tmpV1);
            this._flying = false;
        }
    }

    private _onWheel(event: WheelEvent) {
        event.preventDefault();
        this._zoom(event.deltaY);
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
            case 'control':
                this._key.crouch = true;
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
            case 'control':
                this._key.crouch = false;
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
        const speed = this._key.crouch ? this.crouchSpeed : this._key.sprint ? this.sprintSpeed : this.moveSpeed;
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

    private _screenToWorldPan(pos: Vec2, point: Vec3) {
        const mouseW = this._camera.camera.screenToWorld(pos.x, pos.y, 1);
        const cameraPos = this._camera.getPosition();

        const focusDirScaled = tmpV1.copy(this.entity.forward).mulScalar(this._zoomDist);
        const focalPos = tmpV2.add2(cameraPos, focusDirScaled);
        const planeNormal = focusDirScaled.mulScalar(-1).normalize();

        const plane = tmpP1.setFromPointNormal(focalPos, planeNormal);
        const ray = tmpR1.set(cameraPos, mouseW.sub(cameraPos).normalize());

        plane.intersectsRay(ray, point);
    }


    private _pan(pos: Vec2) {
        const start = new Vec3();
        const end = new Vec3();

        this._screenToWorldPan(this._lastPosition, start);
        this._screenToWorldPan(pos, end);

        tmpV1.sub2(start, end);
        this._origin.add(tmpV1);

        this._lastPosition.copy(pos);
    }

    private _zoom(delta: number) {
        const min = this._camera.camera.nearClip + this.zoomMin * this.sceneSize;
        const max = this.zoomMax * this.sceneSize;
        const scale = math.clamp(this._zoomDist / (max - min), this.zoomScaleMin, 1);
        this._zoomDist += (delta * this.wheelSpeed * this.sceneSize * scale);
        this._zoomDist = math.clamp(this._zoomDist, min, max);
    }

    focus(point: Vec3, start?: Vec3) {
        if (!this._camera) {
            return;
        }
        if (!start) {
            this._origin.copy(point);
            return;
        }

        tmpV1.sub2(start, point);
        const elev = Math.atan2(tmpV1.y, tmpV1.z) * math.RAD_TO_DEG;
        const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
        this._dir.set(-elev, -azim);

        this._origin.copy(point);
        this._camera.setPosition(start);
        this._camera.setLocalEulerAngles(0, 0, 0);

        this._zoomDist = tmpV1.length();
    }

    resetZoom(zoomDist: number = 0) {
        this._zoomDist = zoomDist;
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
            sprint: false,
            crouch: false
        };
    }

    update(dt: number) {
        if (!this._camera) {
            return;
        }

        if (!this._flying) {
            this._cameraDist = math.lerp(this._cameraDist, this._zoomDist, 1 - Math.pow(this.moveDamping, dt * 1000));
            this._camera.setLocalPosition(0, 0, this._cameraDist);
        }

        this._move(dt);

        super.update(dt);
    }
}

export { MultiCamera };
