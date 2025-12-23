import { AppBase, Entity, Picker as PickerPC, Vec3 } from 'playcanvas';

class Picker {
    app: AppBase;

    camera: Entity;

    picker: PickerPC | null;

    constructor(app: AppBase, camera: Entity) {
        this.app = app;
        this.camera = camera;
        this.picker = null;
    }

    async pick(x: number, y: number): Promise<Vec3 | null> {
        const { app, camera } = this;
        const { graphicsDevice } = app;
        const { canvas } = graphicsDevice;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // construct picker on demand with depth enabled
        if (!this.picker) {
            this.picker = new PickerPC(this.app, width, height, true);
        }

        // render scene
        const { picker } = this;
        picker.resize(width, height);
        picker.prepare(camera.camera, app.scene, [app.scene.layers.getLayerByName('World')]);

        // use the public API to get world position at screen coordinates
        return await picker.getWorldPointAsync(x, y);
    }
}

export { Picker };
