import { Entity, Vec3, Vec2, math } from "playcanvas";

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpVa = new Vec2();
const tmpV1 = new Vec3();

class FlyCamera {
    entity: Entity;

    camera: Entity;

    private _origin: Vec3 = new Vec3(0, 1, 0);

    private _look: Vec2 = new Vec2();

    private _sceneSize: number = 100;

    private _pointerDown: boolean = false;

    private _key = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false
    };

    constructor(camera: Entity) {
        this.camera = camera;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);

        window.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);

        this.entity = new Entity();
        this.entity.addChild(camera);
    }

    private _onPointerDown() {
        this._pointerDown = true;
    }

    private _onPointerMove(event: PointerMoveEvent) {
        if (!this._pointerDown) {
            return;
        }

        // fly
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        this._fly(tmpVa.set(movementX, movementY));

    }

    private _onPointerUp() {
        this._pointerDown = false;
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
        }
    }

    private _fly(movement: Vec2) {
        this._look.x = math.clamp(this._look.x - movement.y * 0.2, -90, 90);
        this._look.y -= movement.x * 0.2;
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
        tmpV1.mulScalar(this._sceneSize * dt * 5);
        this._origin.add(tmpV1);
    }

    focus(point: Vec3, start?: Vec3, sceneSize?: number) {
        if (!start || !sceneSize) {
            this._origin.copy(point);
            return;
        }

        tmpV1.sub2(start, point);

        const elev = Math.atan2(tmpV1.y, tmpV1.z) * math.RAD_TO_DEG;
        const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
        this._look.set(-elev, -azim);

        this._origin.copy(start);
    }

    update(dt: number) {
        this._move(dt);

        this.entity.setEulerAngles(this._look.x, this._look.y, 0);
        this.entity.setPosition(this._origin);
    }

    destroy() {
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);
    }
}

export { FlyCamera };
