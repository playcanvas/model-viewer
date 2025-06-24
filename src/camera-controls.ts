import {
    math,
    AppBase,
    DualGestureSource,
    FlyController,
    FocusController,
    GamepadSource,
    InputFrame,
    KeyboardMouseSource,
    MultiTouchSource,
    OrbitController,
    Pose,
    PROJECTION_PERSPECTIVE,
    Vec2,
    Vec3,
    type CameraComponent,
    type InputController,
} from 'playcanvas';

type CameraControlsState = {
    axis: Vec3;
    shift: number;
    ctrl: number;
    mouse: number[];
    touches: number;
};

type CameraControlsOptions = {
    app: AppBase,
    camera: CameraComponent,
};

const tmpV1 = new Vec3();
const tmpV2 = new Vec3();

const pose = new Pose();

const frame = new InputFrame({
    move: [0, 0, 0],
    rotate: [0, 0, 0]
});

const ZOOM_SCALE_MULT = 10;

export const damp = (damping: number, dt: number) => 1 - Math.pow(damping, dt * 1000);

const applyDeadZone = (stick: number[], low: number, high: number) => {
    const mag = Math.sqrt(stick[0] * stick[0] + stick[1] * stick[1]);
    if (mag < low) {
        stick.fill(0);
        return;
    }
    const scale = (mag - low) / (high - low);
    stick[0] *= scale / mag;
    stick[1] *= scale / mag;
};

const screenToWorld = (camera: CameraComponent, dx: number, dy: number, dz: number, out: Vec3 = new Vec3()) => {
    const { system, fov, aspectRatio, horizontalFov, projection, orthoHeight } = camera;
    const { width, height } = system.app.graphicsDevice.clientRect;

    // normalize deltas to device coord space
    out.set(
        -(dx / width) * 2,
        (dy / height) * 2,
        0
    );

    // calculate half size of the view frustum at the current distance
    const halfSize = tmpV2.set(0, 0, 0);
    if (projection === PROJECTION_PERSPECTIVE) {
        const halfSlice = dz * Math.tan(0.5 * fov * math.DEG_TO_RAD);
        if (horizontalFov) {
            halfSize.set(
                halfSlice,
                halfSlice / aspectRatio,
                0
            );
        } else {
            halfSize.set(
                halfSlice * aspectRatio,
                halfSlice,
                0
            );
        }
    } else {
        halfSize.set(
            orthoHeight * aspectRatio,
            orthoHeight,
            0
        );
    }

    // scale by device coord space
    out.mul(halfSize);

    return out;
};

class CameraControls {
    private _app: AppBase;

    private _camera: CameraComponent;

    private _zoomRange: Vec2 = new Vec2();

    private _desktopInput: KeyboardMouseSource = new KeyboardMouseSource();

    private _orbitMobileInput: MultiTouchSource = new MultiTouchSource();

    private _flyMobileInput: DualGestureSource = new DualGestureSource();

    private _gamepadInput: GamepadSource = new GamepadSource();

    private _flyController: FlyController = new FlyController();

    private _orbitController: OrbitController = new OrbitController();

    private _focusController: FocusController = new FocusController();

    private _controller: InputController;

    private _pose: Pose = new Pose();

    private _mode: 'orbit' | 'fly' | 'focus';

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

    zoomScaleMin: number = 0.001;

    gamepadDeadZone: Vec2 = new Vec2(0.3, 0.6);

    constructor({ app, camera }: CameraControlsOptions) {
        this._app = app;
        this._camera = camera;

        // set orbit controller defaults
        this._orbitController.zoomRange = new Vec2(0, Infinity);
        this._orbitController.pitchRange = new Vec2(-90, 90);

        // set fly controller defaults
        this._flyController.pitchRange = new Vec2(-90, 90);

        // attach input
        this._desktopInput.attach(this._app.graphicsDevice.canvas);
        this._orbitMobileInput.attach(this._app.graphicsDevice.canvas);
        this._flyMobileInput.attach(this._app.graphicsDevice.canvas);
        this._gamepadInput.attach(this._app.graphicsDevice.canvas);

        // pose
        const position = this._camera.entity.getPosition();
        const focus = this._camera.entity.getRotation()
        .transformVector(Vec3.FORWARD, tmpV1)
        .mulScalar(this._pose.distance)
        .add(position);
        this._pose.look(position, focus);

        // mode
        this._setMode('orbit');
    }

    set zoomRange(range: Vec2) {
        this._zoomRange.x = range.x;
        this._zoomRange.y = range.y <= range.x ? Infinity : range.y;
        this._orbitController.zoomRange = this._zoomRange;
    }

    get zoomRange() {
        return this._zoomRange;
    }

    get zoom() {
        return this._pose.distance;
    }

    private _setMode(mode: 'orbit' | 'fly' | 'focus') {
        // check if mode is the same
        if (this._mode === mode) {
            return;
        }
        this._mode = mode;

        // detach old controller
        if (this._controller) {
            this._controller.detach();
        }

        // attach new controller
        switch (this._mode) {
            case 'orbit': {
                this._controller = this._orbitController;
                break;
            }
            case 'fly': {
                this._controller = this._flyController;
                break;
            }
            case 'focus': {
                this._controller = this._focusController;
                break;
            }
        }
        this._controller.attach(this._pose, false);
    }

    reset(focus: Vec3, position: Vec3) {
        this._setMode('focus');
        this._controller.attach(pose.look(position, focus));
    }

    update(dt: number) {
        const { keyCode } = KeyboardMouseSource;

        const { key, button, mouse, wheel } = this._desktopInput.read();
        const { touch, pinch, count } = this._orbitMobileInput.read();
        const { leftInput, rightInput } = this._flyMobileInput.read();
        const { leftStick, rightStick } = this._gamepadInput.read();

        // apply dead zone to gamepad sticks
        applyDeadZone(leftStick, this.gamepadDeadZone.x, this.gamepadDeadZone.y);
        applyDeadZone(rightStick, this.gamepadDeadZone.x, this.gamepadDeadZone.y);

        // update state
        this._state.axis.add(tmpV1.set(
            (key[keyCode.D] - key[keyCode.A]) + (key[keyCode.RIGHT] - key[keyCode.LEFT]),
            (key[keyCode.E] - key[keyCode.Q]),
            (key[keyCode.W] - key[keyCode.S]) + (key[keyCode.UP] - key[keyCode.DOWN])
        ));
        for (let i = 0; i < this._state.mouse.length; i++) {
            this._state.mouse[i] += button[i];
        }
        this._state.shift += key[keyCode.SHIFT];
        this._state.ctrl += key[keyCode.CTRL];
        this._state.touches += count[0];

        if (button[0] === 1 || button[1] === 1 || wheel[0] !== 0) {
            // left mouse button, middle mouse button, mouse wheel
            this._setMode('orbit');
        } else if (button[2] === 1 || this._state.axis.length() > 0) {
            // right mouse button or any movement
            this._setMode('fly');
        }

        const orbit = +(this._mode === 'orbit');
        const fly = +(this._mode === 'fly');
        const pan = +((orbit && this._state.shift) || this._state.mouse[1] || this._state.touches > 1);
        const mobileJoystick = +(this._flyMobileInput.layout.endsWith('joystick'));

        // multipliers
        const moveMult = (this._state.shift ? this.moveFastSpeed : this._state.ctrl ?
            this.moveSlowSpeed : this.moveSpeed) * this.sceneSize * dt;
        const zoomMult = math.clamp(
            this._pose.distance / (ZOOM_SCALE_MULT * this.sceneSize),
            this.zoomScaleMin,
            1
        ) * this.zoomSpeed * this.sceneSize * 60 * dt;
        const zoomTouchMult = zoomMult * this.zoomPinchSens;
        const rotateMult = this.rotateSpeed * 60 * dt;
        const rotateJoystickMult = this.rotateSpeed * this.rotateJoystickSens * 60 * dt;

        const { deltas } = frame;

        // desktop move
        const v = tmpV1.set(0, 0, 0);
        const keyMove = this._state.axis.clone().normalize();
        v.add(keyMove.mulScalar(fly * (1 - pan) * moveMult));
        const panMove = screenToWorld(this._camera, mouse[0], mouse[1], this._pose.distance);
        v.add(panMove.mulScalar(orbit * pan));
        const wheelMove = new Vec3(0, 0, wheel[0]);
        v.add(wheelMove.mulScalar(orbit * zoomMult));
        deltas.move.append([v.x, v.y, v.z]);

        // desktop rotate
        v.set(0, 0, 0);
        const mouseRotate = new Vec3(mouse[0], mouse[1], 0);
        v.add(mouseRotate.mulScalar((1 - pan) * rotateMult));
        deltas.rotate.append([v.x, v.y, v.z]);

        // mobile move
        v.set(0, 0, 0);
        const flyMove = new Vec3(leftInput[0], 0, -leftInput[1]);
        v.add(flyMove.mulScalar(fly * (1 - pan) * moveMult));
        const orbitMove = screenToWorld(this._camera, touch[0], touch[1], this._pose.distance);
        v.add(orbitMove.mulScalar(orbit * pan));
        const pinchMove = new Vec3(0, 0, pinch[0]);
        v.add(pinchMove.mulScalar(orbit * zoomTouchMult));
        deltas.move.append([v.x, v.y, v.z]);

        // mobile rotate
        v.set(0, 0, 0);
        const orbitRotate = new Vec3(touch[0], touch[1], 0);
        v.add(orbitRotate.mulScalar(orbit * (1 - pan) * rotateMult));
        const flyRotate = new Vec3(rightInput[0], rightInput[1], 0);
        v.add(flyRotate.mulScalar(fly * (1 - pan) * (mobileJoystick ? rotateJoystickMult : rotateMult)));
        deltas.rotate.append([v.x, v.y, v.z]);

        // gamepad move
        v.set(0, 0, 0);
        const stickMove = new Vec3(leftStick[0], 0, -leftStick[1]);
        v.add(stickMove.mulScalar(fly * (1 - pan) * moveMult));
        deltas.move.append([v.x, v.y, v.z]);

        // gamepad rotate
        v.set(0, 0, 0);
        const stickRotate = new Vec3(rightStick[0], rightStick[1], 0);
        v.add(stickRotate.mulScalar(fly * (1 - pan) * rotateJoystickMult));
        deltas.rotate.append([v.x, v.y, v.z]);

        // check if XR is active, just read frame to clear it
        if (this._app.xr?.active) {
            frame.read();
            return;
        }

        // check focus end
        if (this._mode === 'focus') {
            const focusInterrupt = deltas.move.length() + deltas.rotate.length() > 0;
            const focusComplete = this._focusController.complete();
            if (focusInterrupt || focusComplete) {
                this._setMode('orbit');
            }
        }

        // update controller by consuming frame
        this._pose.copy(this._controller.update(frame, dt));
        this._camera.entity.setPosition(this._pose.position);
        this._camera.entity.setEulerAngles(this._pose.angles);
    }

    destroy() {
        this._desktopInput.destroy();
        this._orbitMobileInput.destroy();
        this._flyMobileInput.destroy();
        this._gamepadInput.destroy();

        this._flyController.destroy();
        this._orbitController.destroy();
    }
}

export { CameraControls };