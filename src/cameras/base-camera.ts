import { Entity, Vec3, Vec2, math } from "playcanvas";

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const LOOK_MAX_ANGLE = 90;

abstract class BaseCamera {
    entity: Entity;

    camera: Entity;

    lookSensitivity: number = 0.2;

    protected _origin: Vec3 = new Vec3(0, 1, 0);

    protected _dir: Vec2 = new Vec2();

    protected _sceneSize: number = 100;

    protected _zoom: number = 0;

    constructor(camera: Entity) {
        this.camera = camera;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);

        window.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);

        this.entity = new Entity();
        this.entity.addChild(camera);
    }

    protected abstract _onPointerDown(event: PointerEvent): void

    protected abstract _onPointerMove(event: PointerMoveEvent): void

    protected abstract _onPointerUp(event: PointerEvent): void

    protected _look(event: PointerMoveEvent) {
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        this._dir.x = math.clamp(this._dir.x - movementY * this.lookSensitivity, -LOOK_MAX_ANGLE, LOOK_MAX_ANGLE);
        this._dir.y -= movementX * this.lookSensitivity;
    }

    abstract focus(point: Vec3, start?: Vec3, sceneSize?: number): void

    update(dt: number) {
        this.entity.setEulerAngles(this._dir.x, this._dir.y, 0);
    }

    destroy() {
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointerup', this._onPointerUp);
    }
}

export { BaseCamera };
