import {
    BoundingBox,
    ContainerResource,
    Entity,
    GraphicsDevice,
    Mat4,
    Material,
    Mesh,
    RenderComponent,
    Texture,
    Vec3
} from 'playcanvas';

import { SplatData } from './splat-data';
import { Splat } from './splat';
import { SortManager } from './sort-manager';

const mat = new Mat4();
const pos = new Vec3();
const dir = new Vec3();

const debugRenderBounds = false;

class SplatResource extends ContainerResource {
    device: GraphicsDevice;
    splatData: SplatData;
    sortManager: SortManager;

    focalPoint = new Vec3();
    entity: Entity;

    renders: RenderComponent[] = [];
    meshes: Mesh[] = [];
    materials: Material[] = [];
    textures: Texture[] = [];

    handle: any;

    constructor(device: GraphicsDevice, splatData: SplatData) {
        super();

        this.device = device;
        this.splatData = splatData;
    }

    destroy() {
        this.handle.off();
    }

    instantiateModelEntity(/* options: any */): Entity {
        return null;
    }

    instantiateRenderEntity(options: any): Entity {
        const splat = new Splat(this.device);
        splat.create(this.splatData);

        const result = new Entity('ply');
        result.addComponent('render', {
            type: 'asset',
            meshInstances: [splat.meshInstance],
            castShadows: false                  // shadows not supported
        });

        this.entity = result;

        // set custom aabb
        const customAabb = new BoundingBox();
        this.splatData.calcAabb(customAabb);
        result.render.customAabb = customAabb;

        this.splatData.calcFocalPoint(this.focalPoint);

        // centers - constant buffer that is sent to the worker
        const x = this.splatData.getProp('x');
        const y = this.splatData.getProp('y');
        const z = this.splatData.getProp('z');

        const centers = new Float32Array(this.splatData.numSplats * 3);
        for (let i = 0; i < this.splatData.numSplats; ++i) {
            centers[i * 3 + 0] = x[i];
            centers[i * 3 + 1] = y[i];
            centers[i * 3 + 2] = z[i];
        }

        // initialize sort
        this.sortManager = new SortManager();
        this.sortManager.sort(
            splat.meshInstance.instancingData.vertexBuffer,
            centers,
            this.device.isWebGPU,
            options?.onChanged
        );

        const viewport = [0, 0];

        this.handle = options.app.on('prerender', () => {
            const cameraMat = options.camera.getWorldTransform();
            cameraMat.getTranslation(pos);
            cameraMat.getZ(dir);

            const modelMat = this.entity.getWorldTransform();
            const invModelMat = mat.invert(modelMat);
            invModelMat.transformPoint(pos, pos);
            invModelMat.transformVector(dir, dir);

            this.sortManager.setCamera(pos, dir);

            viewport[0] = this.device.width;
            viewport[1] = this.device.height;
            splat.meshInstance.material.setParameter('viewport', viewport);

            // debug render splat bounds
            if (debugRenderBounds) {
                this.splatData.renderWireframeBounds(options.app, modelMat);
            }
        });

        return result;
    }

    getFocalPoint(): Vec3 {
        return this.entity.getWorldTransform().transformPoint(this.focalPoint);
    }
}

export { SplatResource };
