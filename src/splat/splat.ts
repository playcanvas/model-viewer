// internally stores mesh, and material with shader attached and all that
// SplatResource can call this, wrap it in entity / render component and return that

import {
    Material,
    MeshInstance,
    GraphicsDevice,
    Texture,
    FILTER_NEAREST,
    ADDRESS_CLAMP_TO_EDGE,
    Vec2,
    Quat,
    math,
    PIXELFORMAT_RGBA8,
    Mesh,
    Vec3,
    createBox,
    CULLFACE_BACK,
    CULLFACE_NONE,
    BLEND_NORMAL,
    SEMANTIC_POSITION,
    SEMANTIC_ATTR11,
    SEMANTIC_ATTR12,
    SEMANTIC_ATTR13,
    SEMANTIC_ATTR14,
    createShaderFromCode,
    TYPE_FLOAT32,
    VertexFormat,
    TYPE_UINT32,
    BUFFER_DYNAMIC,
    VertexBuffer,
    BoundingBox,
    Mat4,
    AppBase,
    Color
} from "playcanvas";
import { SortWorker } from "./sort-worker";
import { splatDebugFS, splatDebugVS, splatFS, splatVS } from "./splat-shaders";


// set true to render splats as oriented boxes
const debugRender = false;
const debugRenderBounds = false;

const vec3 = new Vec3();
const mat4 = new Mat4();
const aabb = new BoundingBox();

const debugPoints = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()];
const debugLines = [
    debugPoints[0], debugPoints[1], debugPoints[1], debugPoints[3], debugPoints[3], debugPoints[2], debugPoints[2], debugPoints[0],
    debugPoints[4], debugPoints[5], debugPoints[5], debugPoints[7], debugPoints[7], debugPoints[6], debugPoints[6], debugPoints[4],
    debugPoints[0], debugPoints[4], debugPoints[1], debugPoints[5], debugPoints[2], debugPoints[6], debugPoints[3], debugPoints[7]
];
const debugColor = new Color(1, 1, 0, 0.4);

const getSplatMat = (result: Mat4, data: Float32Array) => {
    const px = data[0];
    const py = data[1];
    const pz = data[2];
    const x = data[3];
    const y = data[4];
    const z = data[5];
    const w = Math.sqrt(1 - (x * x + y * y + z * z));

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

const getSplatAabb = (result: BoundingBox, data: Float32Array) => {
    getSplatMat(mat4, data);
    aabb.center.set(0, 0, 0);
    aabb.halfExtents.set(data[6] * 2, data[7] * 2, data[8] * 2);
    result.setFromTransformedAabb(aabb, mat4);
};

const renderDebugSplat = (app: AppBase, worldMat: Mat4, data: Float32Array) => {
    getSplatMat(mat4, data);
    mat4.mul2(worldMat, mat4);

    const sx = data[6];
    const sy = data[7];
    const sz = data[8];

    for (let i = 0; i < 8; ++i) {
        vec3.set(
            sx * 2 * ((i & 1) ? 1 : -1),
            sy * 2 * ((i & 2) ? 1 : -1),
            sz * 2 * ((i & 4) ? 1 : -1)
        );
        mat4.transformPoint(vec3, debugPoints[i]);
    }

    app.drawLines(debugLines, debugColor);
};

class Splat {
    device: GraphicsDevice;
    material: Material;
    meshInstance: MeshInstance;
    quadMaterial: Material;
    quadMesh: Mesh;
    aabb: BoundingBox;
    focalPoint = new Vec3();

    constructor(device: GraphicsDevice) {
        this.device = device;

        this.createMesh();
        this.createMaterial();
    }

    createMesh() {
        if (debugRender) {
            this.quadMesh = createBox(this.device, {
                halfExtents: new Vec3(1.0, 1.0, 1.0)
            });
        } else {
            this.quadMesh = new Mesh(this.device);
            this.quadMesh.setPositions(new Float32Array([
                -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
            ]), 2);
            this.quadMesh.update();
        }
    }

    createMaterial() {
        this.quadMaterial = new Material();
        this.quadMaterial.name = 'splatMaterial';
        this.quadMaterial.cull = debugRender ? CULLFACE_BACK : CULLFACE_NONE;
        this.quadMaterial.blendType = BLEND_NORMAL;
        this.quadMaterial.depthWrite = false;

        const vs = debugRender ? splatDebugVS : splatVS;
        const fs = debugRender ? splatDebugFS : splatFS;

        this.quadMaterial.shader = createShaderFromCode(this.device, vs, fs, 'splatShader', {
            vertex_position: SEMANTIC_POSITION,
            splat_center: SEMANTIC_ATTR11,
            splat_rotation: SEMANTIC_ATTR12,
            splat_scale: SEMANTIC_ATTR13,
            vertex_id: SEMANTIC_ATTR14
        });

        this.quadMaterial.update();
    }

    evalTextureSize(count: number) : Vec2 {
        const width = Math.ceil(Math.sqrt(count));
        const height = Math.ceil(count / width);
        return new Vec2(width, height);
    }

    createTexture(name: string, format: number, size: Vec2) {
        return new Texture(this.device, {
            width: size.x,
            height: size.y,
            format: format,
            cubemap: false,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            name: name
        });
    }

    create(elements: PlyElement[], options: any) {

        const vertexElement = elements.find(element => element.name === 'vertex');
        if (!vertexElement) {
            return;
        }

        const find = (name: string) => {
            return vertexElement.properties.find((property: any) => property.name === name && property.storage)?.storage;
        };

        const x = find('x');
        const y = find('y');
        const z = find('z');

        const f_dc_0 = find('f_dc_0');
        const f_dc_1 = find('f_dc_1');
        const f_dc_2 = find('f_dc_2');

        const opacity = find('opacity');

        const scale_0 = find('scale_0');
        const scale_1 = find('scale_1');
        const scale_2 = find('scale_2');

        const rot_0 = find('rot_0');
        const rot_1 = find('rot_1');
        const rot_2 = find('rot_2');
        const rot_3 = find('rot_3');

        if (!x || !y || !z) {
            return;
        }

        const stride = 10;

        const textureSize = this.evalTextureSize(vertexElement.count);
        const colorTexture = this.createTexture('splatColor', PIXELFORMAT_RGBA8, textureSize);
        const colorData = colorTexture.lock();

        // position.xyz, color, rotation.xyz, scale.xyz
        const floatData = new Float32Array(vertexElement.count * stride);
        const uint32Data = new Uint32Array(floatData.buffer);

        const quat = new Quat();
        const isWebGPU = this.device.isWebGPU;

        for (let i = 0; i < vertexElement.count; ++i) {
            const j = i;

            // mirror the scene in the x and y axis (both positions and rotations)
            x[j] *= -1;
            y[j] *= -1;
            rot_1[j] *= -1;
            rot_2[j] *= -1;

            // positions
            floatData[i * stride + 0] = x[j];
            floatData[i * stride + 1] = y[j];
            floatData[i * stride + 2] = z[j];

            // vertex colors
            if (f_dc_0 && f_dc_1 && f_dc_2) {
                const SH_C0 = 0.28209479177387814;
                const r = math.clamp((0.5 + SH_C0 * f_dc_0[j]) * 255, 0, 255);
                const g = math.clamp((0.5 + SH_C0 * f_dc_1[j]) * 255, 0, 255);
                const b = math.clamp((0.5 + SH_C0 * f_dc_2[j]) * 255, 0, 255);

                colorData[i * 4 + 0] = r;
                colorData[i * 4 + 1] = g;
                colorData[i * 4 + 2] = b;
            }

            // opacity
            if (opacity) {
                const sigmoid = (v: number) => {
                    if (v > 0) {
                        return 1 / (1 + Math.exp(-v));
                    }

                    const t = Math.exp(v);
                    return t / (1 + t);
                };
                const a = sigmoid(opacity[j]) * 255;
                colorData[i * 4 + 3] = a;
            } else {
                colorData[i * 4 + 3] = 255;
            }

            quat.set(rot_0[j], rot_1[j], rot_2[j], rot_3[j]).normalize();

            // rotation
            if (quat.w < 0) {
                floatData[i * stride + 3] = -quat.x;
                floatData[i * stride + 4] = -quat.y;
                floatData[i * stride + 5] = -quat.z;
            } else {
                floatData[i * stride + 3] = quat.x;
                floatData[i * stride + 4] = quat.y;
                floatData[i * stride + 5] = quat.z;
            }

            // scale
            floatData[i * stride + 6] = Math.exp(scale_0[j]);
            floatData[i * stride + 7] = Math.exp(scale_1[j]);
            floatData[i * stride + 8] = Math.exp(scale_2[j]);

            // index
            if (isWebGPU) {
                uint32Data[i * stride + 9] = i;
            } else {
                floatData[i * stride + 9] = i + 0.2;
            }
        }

        colorTexture.unlock();
        this.quadMaterial.setParameter('splatColor', colorTexture);
        this.quadMaterial.setParameter('tex_params', new Float32Array([textureSize.x, textureSize.y, 1 / textureSize.x, 1 / textureSize.y]));

        // create instance data
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR11, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR12, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR14, components: 1, type: isWebGPU ? TYPE_UINT32 : TYPE_FLOAT32 }
        ]);
        const vertexBuffer = new VertexBuffer(this.device, vertexFormat, vertexElement.count, BUFFER_DYNAMIC, floatData.buffer);

        this.meshInstance = new MeshInstance(this.quadMesh, this.quadMaterial);
        this.meshInstance.setInstancing(vertexBuffer);

        // calculate scene aabb taking into account splat size
        const calcAabb = (aabb: BoundingBox) => {
            // initialize aabb
            aabb.center.set(floatData[0], floatData[1], floatData[2]);
            aabb.halfExtents.set(0, 0, 0);

            const splat = new Float32Array(stride);
            const tmpAabb = new BoundingBox();
            for (let i = 0; i < vertexElement.count; ++i) {
                for (let j = 0; j < stride; ++j) {
                    splat[j] = floatData[i * stride + j];
                }
                getSplatAabb(tmpAabb, splat);
                aabb.add(tmpAabb);
            }
        };

        // set custom aabb
        this.aabb = new BoundingBox();
        calcAabb(this.aabb);


        // create sort worker
        if (options?.app && options?.camera) {
            const sortWorker = new Worker(URL.createObjectURL(new Blob([`(${SortWorker.toString()})()`], {
                type: 'application/javascript'
            })));

            sortWorker.onmessage = (message: any) => {
                const data = message.data.data;

                // copy source data
                floatData.set(new Float32Array(data));

                // send the memory buffer back to worker
                sortWorker.postMessage({
                    data: data
                }, [data]);

                // upload new data to GPU
                vertexBuffer.unlock();

                // let caller know the view changed
                options?.onChanged();
            };

            // send the initial buffer to worker
            const buf = vertexBuffer.storage.slice(0);
            sortWorker.postMessage({
                data: buf,
                stride: stride
            }, [buf]);

            const viewport = [this.device.width, this.device.height];

            options.app.on('prerender', () => {
                const t = options.camera.getWorldTransform().data;
                sortWorker.postMessage({
                    cameraPosition: { x: t[12], y: t[13], z: t[14] },
                    cameraDirection: { x: t[8], y: t[9], z: t[10] }
                });

                viewport[0] = this.device.width;
                viewport[1] = this.device.height;
                this.quadMaterial.setParameter('viewport', viewport);

                // // debug render splat bounds
                // if (debugRenderBounds) {
                //     const modelMat = result.getWorldTransform();
                //     const splat = new Float32Array(stride);
                //     for (let i = 0; i < vertexElement.count; ++i) {
                //         for (let j = 0; j < stride; ++j) {
                //             splat[j] = floatData[i * stride + j];
                //         }
                //         renderDebugSplat(options.app, modelMat, splat);
                //     }
                // }
            });
        }

        // calculate focal point
        const calcFocalPoint = (result: Vec3) => {
            let sum = 0;
            for (let i = 0; i < vertexElement.count; ++i) {
                const weight = 1.0 / (1.0 + Math.exp(Math.max(scale_0[i], scale_1[i], scale_2[i])));
                result.x += x[i] * weight;
                result.y += y[i] * weight;
                result.z += z[i] * weight;
                sum += weight;
            }
            result.mulScalar(1 / sum);
        };
        calcFocalPoint(this.focalPoint);

    }
}

export { Splat };
