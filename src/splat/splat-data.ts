import {
    AppBase,
    BoundingBox,
    Color,
    Mat4,
    Vec3
} from "playcanvas";
import { PlyElement } from "./ply-reader";

const vec3 = new Vec3();
const mat4 = new Mat4();
const aabb = new BoundingBox();
const aabb2 = new BoundingBox();

const debugPoints = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()];
const debugLines = [
    debugPoints[0], debugPoints[1], debugPoints[1], debugPoints[3], debugPoints[3], debugPoints[2], debugPoints[2], debugPoints[0],
    debugPoints[4], debugPoints[5], debugPoints[5], debugPoints[7], debugPoints[7], debugPoints[6], debugPoints[6], debugPoints[4],
    debugPoints[0], debugPoints[4], debugPoints[1], debugPoints[5], debugPoints[2], debugPoints[6], debugPoints[3], debugPoints[7]
];
const debugColor = new Color(1, 1, 0, 0.4);

const calcSplatMat = (result: Mat4, data: any) => {
    const px = data.x;
    const py = data.y;
    const pz = data.z;
    const x = data.rx;
    const y = data.ry;
    const z = data.rz;
    const w = data.rw;

    // build rotation matrix
    result.data.set([
        1.0 - 2.0 * (z * z + w * w),
        2.0 * (y * z + x * w),
        2.0 * (y * w - x * z),
        0,

        2.0 * (y * z - x * w),
        1.0 - 2.0 * (y * y + w * w),
        2.0 * (z * w + x * y),
        0,

        2.0 * (y * w + x * z),
        2.0 * (z * w - x * y),
        1.0 - 2.0 * (y * y + z * z),
        0,

        px, py, pz, 1
    ]);
};

const calcSplatAabb = (result: BoundingBox, data: any) => {
    calcSplatMat(mat4, data);
    aabb.center.set(0, 0, 0);
    aabb.halfExtents.set(data.sx * 2, data.sy * 2, data.sz * 2);
    result.setFromTransformedAabb(aabb, mat4);
};

class SplatData {
    elements: PlyElement[];
    vertexElement: PlyElement;

    constructor(elements: PlyElement[]) {
        this.elements = elements;
        this.vertexElement = elements.find(element => element.name === 'vertex');

        this.vertexElement.count = 1000;

        // mirror the scene in the x and y axis (both positions and rotations)
        const x = this.getProp('x');
        const y = this.getProp('y');
        const rot_1 = this.getProp('rot_1');
        const rot_2 = this.getProp('rot_2');

        if (x && y && rot_1 && rot_2) {
            for (let i = 0; i < this.numSplats; ++i) {
                x[i] *= -1;
                y[i] *= -1;
                rot_1[i] *= -1;
                rot_2[i] *= -1;
            }
        }
    }

    get numSplats() {
        return this.vertexElement.count;
    }

    getProp(name: string) {
        return this.vertexElement.properties.find((property: any) => property.name === name && property.storage)?.storage;
    }

    // calculate scene aabb taking into account splat size
    calcAabb(result: BoundingBox) {

        const x = this.getProp('x');
        const y = this.getProp('y');
        const z = this.getProp('z');

        const sx = this.getProp('scale_0');
        const sy = this.getProp('scale_1');
        const sz = this.getProp('scale_2');

        const rx = this.getProp('rot_0');
        const ry = this.getProp('rot_1');
        const rz = this.getProp('rot_2');
        const rw = this.getProp('rot_3');

        const splat = {
            x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 0, sx: 0, sy: 0, sz: 0
        };

        // initialize aabb
        result.center.set(x[0], y[0], z[0]);
        result.halfExtents.set(0, 0, 0);

        for (let i = 0; i < this.numSplats; ++i) {
            splat.x = x[i];
            splat.y = y[i];
            splat.z = z[i];
            splat.rx = rx[i];
            splat.ry = ry[i];
            splat.rz = rz[i];
            splat.rw = rw[i];
            splat.sx = sx[i];
            splat.sy = sy[i];
            splat.sz = sz[i];

            calcSplatAabb(aabb2, splat);
            result.add(aabb2);
        }
    }

    renderWireframeBounds(app: AppBase, worldMat: Mat4) {
        const x = this.getProp('x');
        const y = this.getProp('y');
        const z = this.getProp('z');

        const sx = this.getProp('scale_0');
        const sy = this.getProp('scale_1');
        const sz = this.getProp('scale_2');

        const rx = this.getProp('rot_0');
        const ry = this.getProp('rot_1');
        const rz = this.getProp('rot_2');
        const rw = this.getProp('rot_3');

        const splat = {
            x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rw: 0, sx: 0, sy: 0, sz: 0
        };

        for (let i = 0; i < this.numSplats; ++i) {
            splat.x = x[i];
            splat.y = y[i];
            splat.z = z[i];
            splat.rx = rx[i];
            splat.ry = ry[i];
            splat.rz = rz[i];
            splat.rw = rw[i];
            splat.sx = sx[i];
            splat.sy = sy[i];
            splat.sz = sz[i];

            calcSplatMat(mat4, splat);
            mat4.mul2(worldMat, mat4);

            for (let i = 0; i < 8; ++i) {
                vec3.set(
                    sx * 2 * ((i & 1) ? 1 : -1),
                    sy * 2 * ((i & 2) ? 1 : -1),
                    sz * 2 * ((i & 4) ? 1 : -1)
                );
                mat4.transformPoint(vec3, debugPoints[i]);
            }

            app.drawLines(debugLines, debugColor);
        }
    }
}

export { SplatData };
