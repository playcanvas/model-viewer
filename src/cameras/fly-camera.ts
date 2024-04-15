import { Entity, Vec2, Vec3, math } from 'playcanvas';
import { BaseCamera } from './base-camera';

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpV1 = new Vec3();

class FlyCamera extends BaseCamera {
    lookSensitivity: number = 0.2;

    moveSpeed: number = 2;

    sprintSpeed: number = 5;

    private _pointerDown: boolean = false;

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
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    get point() {
        tmpV1.copy(this.entity.forward).mulScalar(this._zoom);
        tmpV1.add(this._origin);
        return tmpV1;
    }

    get start() {
        return this._origin;
    }

    protected _onPointerDown() {
        this._pointerDown = true;
    }

    protected _onPointerMove(event: PointerMoveEvent) {
        if (!this._pointerDown) {
            return;
        }

        this._look(event);

    }

    protected _onPointerUp() {
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

    focus(point: Vec3, start?: Vec3, dir?: Vec2, snap?: boolean) {
        if (!this._camera) {
            return;
        }
        if (!start) {
            tmpV1.copy(this.entity.forward).mulScalar(-this._zoom);
            this._origin.copy(point).add(tmpV1);
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

        this._origin.copy(start);
        this._camera.setLocalPosition(0, 0, 0);

        if (snap) {
            this._angles.set(this._dir.x, this._dir.y, 0);
            this._position.copy(this._origin);
        }

        this._zoom = tmpV1.length();
    }

    attach(camera: Entity) {
        super.attach(camera);

        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);
    }

    detach() {
        super.detach();

        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);

        this._pointerDown = false;
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
        super.update(dt);

        this._move(dt);

        this._position.lerp(this._position, this._origin, 1 - Math.pow(0.98, dt * 1000));
        this.entity.setPosition(this._position);
    }
}

export { FlyCamera };
