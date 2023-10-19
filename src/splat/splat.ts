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
    SEMANTIC_ATTR11,
    SEMANTIC_ATTR12,
    SEMANTIC_ATTR13,
    SEMANTIC_ATTR14,
    TYPE_FLOAT32,
    VertexFormat,
    TYPE_UINT32,
    BUFFER_DYNAMIC,
    VertexBuffer,
    BoundingBox,
    Mat4
} from "playcanvas";
import { SplatData } from "./splat-data";
import { SortWorker } from "./sort-worker";
import { createSplatMaterial } from "./splat-material";

// set true to render splats as oriented boxes
const debugRender = false;
const debugRenderBounds = true;

class Splat {
    device: GraphicsDevice;
    material: Material;
    meshInstance: MeshInstance;
    quadMesh: Mesh;
    aabb = new BoundingBox();
    focalPoint = new Vec3();

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.material = createSplatMaterial(device, debugRender);
        this.createMesh();
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

    create(splatData: SplatData, options: any) {
        const x = splatData.getProp('x');
        const y = splatData.getProp('y');
        const z = splatData.getProp('z');

        const f_dc_0 = splatData.getProp('f_dc_0');
        const f_dc_1 = splatData.getProp('f_dc_1');
        const f_dc_2 = splatData.getProp('f_dc_2');

        const opacity = splatData.getProp('opacity');

        const scale_0 = splatData.getProp('scale_0');
        const scale_1 = splatData.getProp('scale_1');
        const scale_2 = splatData.getProp('scale_2');

        const rot_0 = splatData.getProp('rot_0');
        const rot_1 = splatData.getProp('rot_1');
        const rot_2 = splatData.getProp('rot_2');
        const rot_3 = splatData.getProp('rot_3');

        if (!x || !y || !z) {
            return;
        }

        const stride = 10;

        const textureSize = this.evalTextureSize(splatData.numSplats);
        const colorTexture = this.createTexture('splatColor', PIXELFORMAT_RGBA8, textureSize);
        const colorData = colorTexture.lock();

        // position.xyz, color, rotation.xyz, scale.xyz
        const floatData = new Float32Array(splatData.numSplats * stride);
        const uint32Data = new Uint32Array(floatData.buffer);

        const quat = new Quat();
        const isWebGPU = this.device.isWebGPU;

        for (let i = 0; i < splatData.numSplats; ++i) {
            const j = i;

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
        this.material.setParameter('splatColor', colorTexture);
        this.material.setParameter('tex_params', new Float32Array([textureSize.x, textureSize.y, 1 / textureSize.x, 1 / textureSize.y]));

        // create instance data
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR11, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR12, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR14, components: 1, type: isWebGPU ? TYPE_UINT32 : TYPE_FLOAT32 }
        ]);
        const vertexBuffer = new VertexBuffer(this.device, vertexFormat, splatData.numSplats, BUFFER_DYNAMIC, floatData.buffer);

        this.meshInstance = new MeshInstance(this.quadMesh, this.material);
        this.meshInstance.setInstancing(vertexBuffer);

        // calculate custom aabb
        splatData.calcAabb(this.aabb);

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
                this.material.setParameter('viewport', viewport);

                // debug render splat bounds
                if (debugRenderBounds) {
                    // FIXME: need world matrix
                    splatData.renderWireframeBounds(options.app, Mat4.IDENTITY);
                }
            });
        }

        // calculate focal point
        const calcFocalPoint = (result: Vec3) => {
            let sum = 0;
            for (let i = 0; i < splatData.numSplats; ++i) {
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
