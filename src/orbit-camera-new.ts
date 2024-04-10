import { Entity, Vec3, Vec2, math } from "playcanvas";

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpVa = new Vec2();
const tmpV1 = new Vec3();

class OrbitCamera {
    entity: Entity;

    camera: Entity;

    private _focus: Vec3 = new Vec3(0, 1, 0);

    private _look: Vec2 = new Vec2();

    private _zoom: number = 0;

    private _sceneSize: number = 100;

    private _pointerEvents: Map<number, PointerEvent> = new Map();

    private _lastPinchDist: number = -1;

    private _lastPosition = new Vec2();

    private _panning: boolean = false;

    private _flying: boolean = false;

    constructor(camera: Entity) {
        this.camera = camera;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);

        window.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('contextmenu', this._onContextMenu);

        this.entity = new Entity();
        this.entity.addChild(camera);
    }

    private _onPointerDown(event: PointerEvent) {
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
            this._flying = true;
        }
    }

    private _onPointerMove(event: PointerMoveEvent) {
        if (this._pointerEvents.size === 0) {
            return;
        }

        this._pointerEvents.set(event.pointerId, event);

        if (this._pointerEvents.size === 1) {
            if (this._panning) {
                // pan
                this._pan(tmpVa.set(event.clientX, event.clientY));
            } else {
                // orbit
                const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
                const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
                this._orbit(tmpVa.set(movementX, movementY));
            }

            return;
        }

        if (this._pointerEvents.size === 2) {
            // pan
            this._pan(this._getMidPoint(tmpVa), 0.01);

            // pinch zoom
            const pinchDist = this._getPinchDist();
            if (this._lastPinchDist > 0) {
                this._zoom = Math.max(this._zoom - (pinchDist - this._lastPinchDist) * this._sceneSize * 0.025, 0);
            }
            this._lastPinchDist = pinchDist;
        }

    }

    private _onPointerUp(event: PointerEvent) {
        this._pointerEvents.delete(event.pointerId);
        if (this._pointerEvents.size < 2) {
            this._lastPinchDist = -1;
            this._panning = false;
        }
        if (event.shiftKey) {
            this._panning = false;
        }
        if (event.button === 2) {
            this._flying = false;
        }
    }

    private _onWheel(event: WheelEvent) {
        event.preventDefault();
        this._zoom = Math.max(this._zoom - event.deltaY * this._sceneSize * 0.005, 0);
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

    private _orbit(movement: Vec2) {
        this._look.x = math.clamp(this._look.x - movement.y * 0.2, -90, 90);
        this._look.y -= movement.x * 0.2;
    }

    private _pan(pos: Vec2, speed = 0.025) {
        const distance = Math.abs(this._zoom);

        const last = this.camera.camera.screenToWorld(this._lastPosition.x, this._lastPosition.y, distance);
        const current = this.camera.camera.screenToWorld(pos.x, pos.y, distance);

        tmpV1.sub2(last, current);
        tmpV1.mulScalar(speed * this._sceneSize);

        this.entity.translate(tmpV1);

        this._lastPosition.copy(pos);
    }

    focus(point: Vec3, start?: Vec3, sceneSize?: number) {
        this._focus.copy(point);

        if (!start || !sceneSize) {
            return;
        }

        tmpV1.sub2(start, point);

        const elev = Math.atan2(tmpV1.y, tmpV1.z) * math.RAD_TO_DEG;
        const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
        this._look.set(-elev, -azim);

        this.camera.setPosition(start);

        this._zoom = tmpV1.length();
    }

    update(dt) {
        this.camera.setLocalPosition(0, 0, this._zoom);
        this.entity.setEulerAngles(this._look.x, this._look.y, 0);
        this.entity.setPosition(this._focus);
    }

    destroy() {
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('contextmenu', this._onContextMenu);
    }
}

export { OrbitCamera };
