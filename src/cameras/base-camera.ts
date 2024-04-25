import { Entity, Vec3, Vec2, math } from 'playcanvas';

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const LOOK_MAX_ANGLE = 90;

abstract class BaseCamera {
    entity: Entity;

    target: HTMLElement = document.documentElement;

    sceneSize: number = 100;

    lookSensitivity: number = 0.2;

    lookDamping: number = 0.97;

    moveDamping: number = 0.98;

    protected _camera: Entity = null;

    protected _origin: Vec3 = new Vec3(0, 1, 0);

    protected _position: Vec3 = new Vec3();

    protected _dir: Vec2 = new Vec2();

    protected _angles: Vec3 = new Vec3();

    constructor(target: HTMLElement, options: Record<string, any> = {}) {
        this.entity = new Entity(options.name ?? 'base-camera');
        this.target = target;
        this.sceneSize = options.sceneSize ?? this.sceneSize;
        this.lookSensitivity = options.lookSensitivity ?? this.lookSensitivity;
        this.lookDamping = options.lookDamping ?? this.lookDamping;
        this.moveDamping = options.moveDamping ?? this.moveDamping;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
    }

    private _smoothLook(dt: number) {
        const lerpRate = 1 - Math.pow(this.lookDamping, dt * 1000);
        this._angles.x = math.lerp(this._angles.x, this._dir.x, lerpRate);
        this._angles.y = math.lerp(this._angles.y, this._dir.y, lerpRate);
        this.entity.setEulerAngles(this._angles);
    }

    private _smoothMove(dt: number) {
        this._position.lerp(this._position, this._origin, 1 - Math.pow(this.moveDamping, dt * 1000));
        this.entity.setPosition(this._position);
    }

    private _onContextMenu(event: MouseEvent) {
        event.preventDefault();
    }

    protected abstract _onPointerDown(event: PointerEvent): void

    protected abstract _onPointerMove(event: PointerMoveEvent): void

    protected abstract _onPointerUp(event: PointerEvent): void

    protected _look(event: PointerMoveEvent) {
        if (event.target !== this.target) {
            return;
        }
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        this._dir.x = math.clamp(this._dir.x - movementY * this.lookSensitivity, -LOOK_MAX_ANGLE, LOOK_MAX_ANGLE);
        this._dir.y -= movementX * this.lookSensitivity;
    }

    attach(camera: Entity) {
        this._camera = camera;

        window.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('contextmenu', this._onContextMenu);

        this.entity.addChild(camera);
    }

    detach() {
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('contextmenu', this._onContextMenu);

        this.entity.removeChild(this._camera);
        this._camera = null;

        this._dir.x = this._angles.x;
        this._dir.y = this._angles.y;

        this._origin.copy(this._position);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(dt: number) {
        if (!this._camera) {
            return;
        }

        this._smoothLook(dt);
        this._smoothMove(dt);
    }
}

export { BaseCamera };
