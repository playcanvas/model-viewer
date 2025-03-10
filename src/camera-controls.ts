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

type CameraControlsFrame = {
    move: Vec3,
    rotate: Vec2,
    drag: Vec2,
    zoom: number,
    pan: boolean
};

type CameraControlsState = {
    axis: Vec3,
    shift: number,
    ctrl: number,
    mouse: number[],
    touches: number
};

class CameraControls {
    private _app: AppBase;

    private _camera: CameraComponent;

    private _desktopInput: KeyboardMouseInput;

    private _mobileInput: MultiTouchInput;

    private _flyController: FlyController;

    private _orbitController: OrbitController;

    private _controller: FlyController | OrbitController;

    private _mode: CameraControlsMode;

    private _frame: CameraControlsFrame = {
        move: new Vec3(),
        rotate: new Vec2(),
        drag: new Vec2(),
        zoom: 0,
        pan: false
    };

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
        this._flyController = new FlyController();
        this._orbitController = new OrbitController();

        // mode
        this.mode = CameraControlsMode.ORBIT;
    }

    set mode(mode) {
        if (this._mode === mode) {
            return;
        }

        if (this.mode) {
            // validate mode switch
            this._mode = mode;
        } else {
            // set initial mode
            this._mode = mode;

            // desktop input attach
            this._desktopInput.attach(this._app.graphicsDevice.canvas);

            // mobile input attach
            this._mobileInput.attach(this._app.graphicsDevice.canvas);
        }

        // controller reattach
        const controller = this._mode === CameraControlsMode.FLY ? this._flyController : this._orbitController;
        const currZoomDist = this._orbitController.zoom;
        if (controller !== this._controller) {
            if (this._controller) {
                this._controller.detach();
            }
            this._controller = controller;
            this._controller.attach(this._camera.entity.getWorldTransform());
        }

        // refocus if orbit mode
        if (this._controller instanceof OrbitController) {
            const start = this._camera.entity.getPosition();
            const point = tmpV1.copy(this._camera.entity.forward).mulScalar(currZoomDist).add(start);
            this._controller.focus(point, start, false);
        }
    }

    get mode() {
        return this._mode;
    }

    set rotateDamping(damping) {
        this._flyController.rotateDamping = damping;
        this._orbitController.rotateDamping = damping;
    }

    get rotateDamping() {
        return this._controller.rotateDamping;
    }

    set moveDamping(damping) {
        this._flyController.moveDamping = damping;
    }

    get moveDamping() {
        return this._flyController.moveDamping;
    }

    set zoomDamping(damping) {
        this._orbitController.zoomDamping = damping;
    }

    get zoomDamping() {
        return this._orbitController.zoomDamping;
    }

    set pitchRange(range) {
        this._flyController.pitchRange = range;
        this._orbitController.pitchRange = range;
    }

    get pitchRange() {
        return this._controller.pitchRange;
    }

    set yawRange(range) {
        this._flyController.yawRange = range;
        this._orbitController.yawRange = range;
    }

    get yawRange() {
        return this._controller.yawRange;
    }

    set zoomRange(range) {
        this._orbitController.zoomRange = range;
    }

    get zoomRange() {
        return this._orbitController.zoomRange;
    }

    private _resetFrame() {
        this._frame.move.set(0, 0, 0);
        this._frame.rotate.set(0, 0);
        this._frame.drag.set(0, 0);
        this._frame.zoom = 0;
        this._frame.pan = false;
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
        if (!(this._controller instanceof OrbitController)) {
            return 0;
        }
        const norm = this._controller.zoom / (ZOOM_SCALE_MULT * this.sceneSize);
        const scale = math.clamp(norm, this.zoomScaleMin, 1);
        return zoom * scale * this.zoomSpeed * this.sceneSize;
    }

    private _addDesktopInputs() {
        const { key, button, mouse, wheel } = this._desktopInput.frame();
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

        this._frame.move.add(this._scaleMove(tmpV1.copy(this._state.axis).normalize()));
        this._frame.rotate.add(tmpVa.fromArray(mouse).mulScalar(this.rotateSpeed));

        const _pan = !!this._state.shift || !!this._state.mouse[1];
        this._frame.drag.add(tmpVa.fromArray(mouse).mulScalar(_pan ? 1 : this.rotateSpeed));
        this._frame.zoom += this._scaleZoom(wheel[0]);
        this._frame.pan ||= _pan;
    }

    private _addMobileInputs() {
        if (this._mobileInput instanceof MultiTouchInput) {
            const { touch, pinch, count } = this._mobileInput.frame();
            this._state.touches += count[0];

            const _pan = this._state.touches > 1;
            this._frame.drag.add(tmpVa.fromArray(touch).mulScalar(_pan ? 1 : this.rotateSpeed));
            this._frame.zoom += this._scaleZoom(pinch[0]) * this.zoomPinchSens;
            this._frame.pan ||= _pan;
        }
    }

    private _updateController(dt: number) {
        if (this._controller instanceof OrbitController) {
            tmpM1.copy(this._controller.update(this._frame, this._camera, dt));
            this._camera.entity.setPosition(tmpM1.getTranslation());
            this._camera.entity.setEulerAngles(tmpM1.getEulerAngles());
        }

        if (this._controller instanceof FlyController) {
            tmpM1.copy(this._controller.update(this._frame, dt));
            this._camera.entity.setPosition(tmpM1.getTranslation());
            this._camera.entity.setEulerAngles(tmpM1.getEulerAngles());
        }
    }

    /**
     * @param point - The focus point.
     * @param start - The start point.
     */
    focus(point: Vec3, start?: Vec3) {
        this.mode = CameraControlsMode.ORBIT;

        if (this._controller instanceof OrbitController) {
            this._controller.focus(point, start);
        }
    }

    /**
     * @param dt - The time delta.
     */
    update(dt: number) {
        if (this._app.xr?.active) {
            return;
        }

        this._resetFrame();

        // accumulate inputs
        this._addDesktopInputs();
        this._addMobileInputs();

        // update controller
        this._updateController(dt);
    }

    destroy() {
        this._desktopInput.destroy();
        this._mobileInput.destroy();

        this._flyController.destroy();
        this._orbitController.destroy();
    }
}

export { CameraControls };
