import { Entity, Vec3, Vec2, math } from 'playcanvas';
import { BaseCamera } from './base-camera';

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpVa = new Vec2();
const tmpV1 = new Vec3();

class OrbitCamera extends BaseCamera {
    lookSensitivity: number = 0.2;

    panSpeed: number = 0.01;

    pinchSpeed: number = 0.025;

    wheelSpeed: number = 0.005;

    private _pointerEvents: Map<number, PointerEvent> = new Map();

    private _lastPinchDist: number = -1;

    private _lastPosition = new Vec2();

    private _panning: boolean = false;

    constructor(camera: Entity) {
        super(camera);

        this._onWheel = this._onWheel.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);

        window.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('contextmenu', this._onContextMenu);
    }

    protected _onPointerDown(event: PointerEvent) {
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
    }

    protected _onPointerMove(event: PointerMoveEvent) {
        if (this._pointerEvents.size === 0) {
            return;
        }

        this._pointerEvents.set(event.pointerId, event);

        if (this._pointerEvents.size === 1) {
            if (this._panning) {
                // pan
                this._pan(tmpVa.set(event.clientX, event.clientY));
            } else {
                super._look(event);
            }
            return;
        }

        if (this._pointerEvents.size === 2) {
            // pan
            this._pan(this._getMidPoint(tmpVa));

            // pinch zoom
            const pinchDist = this._getPinchDist();
            if (this._lastPinchDist > 0) {
                this._zoom = Math.max(this._zoom - (pinchDist - this._lastPinchDist) * this._sceneSize * this.pinchSpeed, 0);
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
        if (event.shiftKey) {
            this._panning = false;
        }
    }

    private _onWheel(event: WheelEvent) {
        event.preventDefault();
        this._zoom = Math.max(this._zoom - event.deltaY * this._sceneSize * this.wheelSpeed, 0);
    }

    private _onContextMenu(event: MouseEvent) {
        event.preventDefault();
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

    private _pan(pos: Vec2) {
        const distance = Math.abs(this._zoom);

        const last = this.camera.camera.screenToWorld(this._lastPosition.x, this._lastPosition.y, distance);
        const current = this.camera.camera.screenToWorld(pos.x, pos.y, distance);

        tmpV1.sub2(last, current);
        tmpV1.mulScalar(this.panSpeed * this._sceneSize);

        this._origin.add(tmpV1);

        this._lastPosition.copy(pos);
    }

    focus(point: Vec3, start?: Vec3, sceneSize?: number) {
        this._origin.copy(point);

        if (!start || !sceneSize) {
            return;
        }

        tmpV1.sub2(start, point);

        const elev = Math.atan2(tmpV1.y, tmpV1.z) * math.RAD_TO_DEG;
        const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
        this._dir.set(-elev, -azim);

        this.camera.setPosition(start);

        this._zoom = tmpV1.length();
    }

    update(dt: number) {
        super.update(dt);

        this.camera.setLocalPosition(0, 0, this._zoom);
        this.entity.setPosition(this._origin);
    }

    destroy() {
        super.destroy();
        window.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('contextmenu', this._onContextMenu);
    }
}

export { OrbitCamera };