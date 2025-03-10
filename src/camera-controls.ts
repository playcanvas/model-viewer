import {
    platform,
    Mat4,
    Vec2,
    Vec3,
    math,
    type AppBase,
    type CameraComponent
} from 'playcanvas';

import {
    KeyboardMouseInput,
    MultiTouchInput,
    FlyController,
    OrbitController
// @ts-ignore
} from '../extras/index.js';

const tmpM1 = new Mat4();
const tmpVa = new Vec2();
const tmpV1 = new Vec3();

const ZOOM_SCALE_MULT = 10;

enum CameraControlsMode {
    FLY = 'fly',
    ORBIT = 'orbit'
}

type CameraControlsOptions = {
    app: AppBase,
    camera: CameraComponent,
};

type CameraControlsState = {
    axis: Vec3,
    shift: number,
    ctrl: number,
    mouse: number[],
    touches: number
}

class CameraControls {
    private _app: AppBase;

    private _camera: CameraComponent;

    private _desktopInput: KeyboardMouseInput;

    private _mobileInput: MultiTouchInput;

    private _input: KeyboardMouseInput | MultiTouchInput;

    private _flyModel: FlyController;

    private _orbitModel: OrbitController;

    private _model: FlyController | OrbitController;

    private _mode: CameraControlsMode;

    private _state: CameraControlsState = {
        axis: new Vec3(),
        shift: 0,
        ctrl: 0,
        mouse: [0, 0, 0],
        touches: 0
    };

    sceneSize: number = 100;

    rotateSpeed: number = 0.2;

    rotateJoystickSens: number = 2;

    moveSpeed: number = 2;

    moveFastSpeed: number = 4;

    moveSlowSpeed: number = 1;

    zoomSpeed: number = 0.005;

    zoomPinchSens: number = 5;

    zoomScaleMin: number;

    /**
     * @param options - The options.
     * @param options.app - The application.
     * @param options.camera - The camera.
     * @param options.mode - The mode.
     * @param options.sceneSize - The scene size.
     */
    constructor({ app, camera }: CameraControlsOptions) {
        this._app = app;
        this._camera = camera;

        // zoom scale min
        this.zoomScaleMin = this._camera.nearClip;

        // input
        this._desktopInput = new KeyboardMouseInput();
        this._mobileInput = new MultiTouchInput();

        // models
        this._flyModel = new FlyController();
        this._orbitModel = new OrbitController();

        // mode
        this.mode = CameraControlsMode.ORBIT;
    }

    set mode(mode) {
        if (this._mode === mode) {
            return;
        }

        // determine input and model
        let input, model;
        if (platform.mobile) {
            this._mode = CameraControlsMode.ORBIT;
            input = this._mobileInput;
            model = this._orbitModel;
        } else {
            this._mode = mode;
            input = this._desktopInput;
            if (this._mode === CameraControlsMode.FLY) {
                model = this._flyModel;
            } else {
                model = this._orbitModel;
            }
        }

        // NOTE: save zoom as attach will reset it
        const currZoomDist = this._orbitModel.zoom;

        // input reattach
        if (input !== this._input) {
            if (this._input) {
                this._input.detach();
            }
            this._input = input;
            this._input.attach(this._app.graphicsDevice.canvas);

            // reset state
            this._state.axis.set(0, 0, 0);
            this._state.shift = 0;
            this._state.ctrl = 0;
            this._state.mouse.fill(0);
            this._state.touches = 0;
        }

        // model reattach
        if (model !== this._model) {
            if (this._model) {
                this._model.detach();
            }
            this._model = model;
            this._model.attach(this._camera.entity.getWorldTransform());
        }

        // refocus if orbit mode
        if (this._model instanceof OrbitController) {
            const start = this._camera.entity.getPosition();
            const point = tmpV1.copy(this._camera.entity.forward).mulScalar(currZoomDist).add(start);
            this._model.focus(point, start, false);
        }
    }

    get mode() {
        return this._mode;
    }

    set rotateDamping(damping) {
        this._flyModel.rotateDamping = damping;
        this._orbitModel.rotateDamping = damping;
    }

    get rotateDamping() {
        return this._model.rotateDamping;
    }

    set moveDamping(damping) {
        this._flyModel.moveDamping = damping;
    }

    get moveDamping() {
        return this._flyModel.moveDamping;
    }

    set zoomDamping(damping) {
        this._orbitModel.zoomDamping = damping;
    }

    get zoomDamping() {
        return this._orbitModel.zoomDamping;
    }

    set pitchRange(range) {
        this._flyModel.pitchRange = range;
        this._orbitModel.pitchRange = range;
    }

    get pitchRange() {
        return this._model.pitchRange;
    }

    set yawRange(range) {
        this._flyModel.yawRange = range;
        this._orbitModel.yawRange = range;
    }

    get yawRange() {
        return this._model.yawRange;
    }

    set zoomRange(range) {
        this._orbitModel.zoomRange = range;
    }

    get zoomRange() {
        return this._orbitModel.zoomRange;
    }

    /**
     * @param transform - The transform.
     */
    private _updateTransform(transform: Mat4) {
        this._camera.entity.setPosition(transform.getTranslation());
        this._camera.entity.setEulerAngles(transform.getEulerAngles());
    }

    /**
     * @param move - The move delta.
     * @returns The scaled delta.
     */
    private _scaleMove(move: Vec3) {
        const speed = this._state.shift ?
            this.moveFastSpeed : this._state.ctrl ?
                this.moveSlowSpeed : this.moveSpeed;
        return move.mulScalar(speed * this.sceneSize);
    }

    /**
     * @param zoom - The delta.
     * @returns The scaled delta.
     */
    private _scaleZoom(zoom: number) {
        if (!(this._model instanceof OrbitController)) {
            return 0;
        }
        const norm = this._model.zoom / (ZOOM_SCALE_MULT * this.sceneSize);
        const scale = math.clamp(norm, this.zoomScaleMin, 1);
        return zoom * scale * this.zoomSpeed * this.sceneSize;
    }

    /**
     * @param point - The focus point.
     * @param start - The start point.
     */
    focus(point: Vec3, start?: Vec3) {
        this.mode = CameraControlsMode.ORBIT;

        if (this._model instanceof OrbitController) {
            this._model.focus(point, start);
        }
    }

    /**
     * @param dt - The time delta.
     */
    update(dt: number) {
        if (this._app.xr?.active) {
            return;
        }

        // desktop input
        if (this._input instanceof KeyboardMouseInput) {
            const { key, button, mouse, wheel } = this._input.frame();
            const [forward, back, left, right, up, down, shift, ctrl] = key;

            // left mouse button, middle mouse button, mouse wheel
            const switchToOrbit = button[0] === 1 || button[1] === 1 || wheel[0] !== 0;

            // right mouse button or any key
            const switchToFly = button[2] === 1 ||
                forward === 1 || back === 1 || left === 1 || right === 1 || up === 1 || down === 1;

            if (switchToOrbit) {
                this.mode = CameraControlsMode.ORBIT;
            } else if (switchToFly) {
                this.mode = CameraControlsMode.FLY;
            }

            // update state
            this._state.axis.add(tmpV1.set(right - left, up - down, forward - back));
            this._state.shift += shift;
            this._state.ctrl += ctrl;
            for (let i = 0; i < 3; i++) {
                this._state.mouse[i] += button[i];
            }

            if (this._model instanceof OrbitController) {
                // pan shift or middle mouse button
                const pan = !!this._state.shift || !!this._state.mouse[1];
                tmpM1.copy(this._model.update({
                    drag: tmpVa.fromArray(mouse).mulScalar(pan ? 1 : this.rotateSpeed),
                    zoom: this._scaleZoom(wheel[0]),
                    pan
                }, this._camera, dt));

                this._updateTransform(tmpM1);
                return;
            }

            if (this._model instanceof FlyController) {
                tmpM1.copy(this._model.update({
                    rotate: tmpVa.fromArray(mouse).mulScalar(this.rotateSpeed),
                    move: this._scaleMove(tmpV1.copy(this._state.axis).normalize())
                }, dt));

                this._updateTransform(tmpM1);
                return;
            }
        }

        // orbit mobile
        if (this._input instanceof MultiTouchInput && this._model instanceof OrbitController) {
            const { touch, pinch, count } = this._input.frame();
            this._state.touches += count[0];

            const pan = this._state.touches > 1;
            tmpM1.copy(this._model.update({
                drag: tmpVa.fromArray(touch).mulScalar(pan ? 1 : this.rotateSpeed),
                zoom: this._scaleZoom(pinch[0]) * this.zoomPinchSens,
                pan
            }, this._camera, dt));

            this._updateTransform(tmpM1);
        }
    }

    destroy() {
        this._desktopInput.destroy();
        this._mobileInput.destroy();

        this._flyModel.destroy();
        this._orbitModel.destroy();
    }
}

export { CameraControls };
