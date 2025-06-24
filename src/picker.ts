import { AppBase, Entity, Picker as PickerPC, Vec3, Vec4 } from 'playcanvas';

const float32 = new Float32Array(1);
const uint8 = new Uint8Array(float32.buffer);
const two = new Vec4(2, 2, 2, 1);
const one = new Vec4(1, 1, 1, 0);

class Picker {
    app: AppBase;

    camera: Entity;

    picker: PickerPC | null;

    constructor(app: AppBase, camera: Entity) {
        this.app = app;
        this.camera = camera;
        this.picker = null;
    }

    async pick(x: number, y: number) {
        const { app, camera } = this;
        const { graphicsDevice } = app;
        const { canvas } = graphicsDevice;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        y = graphicsDevice.isWebGL2 ? height - y - 1 : y;

        // construct picker on demand
        if (!this.picker) {
            this.picker = new PickerPC(this.app, width, height);
        }

        // render scene, read depth
        const { picker } = this;
        picker.resize(width, height);
        picker.prepare(camera.camera, app.scene, [app.scene.layers.getLayerByName('World')]);
        const pixels = await picker.renderTarget.colorBuffer.read(x, y, 1, 1, {
            renderTarget: picker.renderTarget,
            immediate: true
        });

        for (let i = 0; i < 4; ++i) {
            uint8[i] = pixels[i];
        }
        const depth = float32[0];

        // 255, 255, 255, 255 === NaN
        if (!isFinite(depth)) {
            return null;
        }

        // clip space
        const pos = new Vec4(x / width, y / height, depth, 1).mul(two).sub(one);

        if (!graphicsDevice.isWebGL2) {
            pos.y *= -1;
        }

        // homogeneous view space
        camera.camera.projectionMatrix.clone().invert().transformVec4(pos, pos);

        // perform perspective divide
        pos.mulScalar(1.0 / pos.w);

        // view to world space
        const pos3 = new Vec3(pos.x, pos.y, pos.z);
        camera.getWorldTransform().transformPoint(pos3, pos3);

        return pos3;
    }
}

export { Picker };
