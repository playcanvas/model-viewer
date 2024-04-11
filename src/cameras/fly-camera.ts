import { Entity, Vec3, math, Mat4 } from 'playcanvas';
import { BaseCamera } from './base-camera';

type PointerMoveEvent = PointerEvent & {
    mozMovementX: number;
    mozMovementY: number;
    webkitMovementX: number;
    webkitMovementY: number;
}

const tmpV1 = new Vec3();
const tmpM1 = new Mat4();

class FlyCamera extends BaseCamera {
    lookSensitivity: number = 0.2;

    moveSpeed: number = 10;

    velocityDamping: number = 1e-4;

    private _velocity: Vec3 = new Vec3(0, 0, 0);

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
        super(camera);

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);

        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);
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
        tmpV1.mulScalar(this._sceneSize * this.moveSpeed * dt);
        this._velocity.add(tmpV1);

        tmpV1.copy(this._velocity).mulScalar(dt);
        this._origin.add(tmpV1);
        this._velocity.lerp(this._velocity, Vec3.ZERO, 1 - Math.pow(this.velocityDamping, dt));
    }

    focus(point: Vec3, start?: Vec3, sceneSize?: number) {
        if (!start || !sceneSize) {
            tmpM1.copy(this.entity.getWorldTransform());
            tmpV1.copy(Vec3.BACK).mulScalar(this._zoom);
            tmpM1.transformVector(tmpV1, tmpV1);
            this._origin.copy(point).add(tmpV1);
            return;
        }

        tmpV1.sub2(start, point);

        const elev = Math.atan2(tmpV1.y, tmpV1.z) * math.RAD_TO_DEG;
        const azim = Math.atan2(tmpV1.x, tmpV1.z) * math.RAD_TO_DEG;
        this._dir.set(-elev, -azim);

        this._origin.copy(start);

        this._zoom = tmpV1.length();
    }

    update(dt: number) {
        super.update(dt);

        this._move(dt);

        this.entity.setPosition(this._origin);
    }

    destroy() {
        super.destroy();
        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);
    }
}

export { FlyCamera };
