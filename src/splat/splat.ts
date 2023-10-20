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
    TYPE_FLOAT32,
    VertexFormat,
    TYPE_UINT32,
    BUFFER_DYNAMIC,
    VertexBuffer,
    BoundingBox,
    Mat4,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_RGB32F,
    PIXELFORMAT_RGBA32F
} from "playcanvas";
import { SplatData } from "./splat-data";
import { SortWorker } from "./sort-worker";
import { createSplatMaterial } from "./splat-material";

// set true to render splats as oriented boxes
const debugRender = false;
const debugRenderBounds = false;

const floatView = new Float32Array(1);
const int32View = new Int32Array(floatView.buffer);

const float2Half = (value: number) => {
    // based on https://esdiscuss.org/topic/float16array
    // This method is faster than the OpenEXR implementation (very often
    // used, eg. in Ogre), with the additional benefit of rounding, inspired
    // by James Tursa?s half-precision code.
    floatView[0] = value;
    const x = int32View[0];

    let bits = (x >> 16) & 0x8000; // Get the sign
    let m = (x >> 12) & 0x07ff; // Keep one extra bit for rounding
    const e = (x >> 23) & 0xff; // Using int is faster here

    // If zero, or denormal, or exponent underflows too much for a denormal half, return signed zero.
    if (e < 103) {
        return bits;
    }

    // If NaN, return NaN. If Inf or exponent overflow, return Inf.
    if (e > 142) {
        bits |= 0x7c00;

        // If exponent was 0xff and one mantissa bit was set, it means NaN,
        // not Inf, so make sure we set one mantissa bit too.
        bits |= ((e === 255) ? 0 : 1) && (x & 0x007fffff);
        return bits;
    }

    // If exponent underflows but not too much, return a denormal
    if (e < 113) {
        m |= 0x0800;

        // Extra rounding may overflow and set mantissa to 0 and exponent to 1, which is OK.
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
        return bits;
    }

    bits |= ((e - 112) << 10) | (m >> 1);

    // Extra rounding. An overflow will set mantissa to 0 and increment the exponent, which is OK.
    bits += m & 1;
    return bits;
};

class Splat {
    device: GraphicsDevice;
    material: Material;
    meshInstance: MeshInstance;
    quadMesh: Mesh;
    aabb = new BoundingBox();
    focalPoint = new Vec3();
    halfFormat: object;
    floatFormat: object;

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.testTextureFormats();

        this.material = createSplatMaterial(device, debugRender);
        this.createMesh();
    }

    testTextureFormats() {
        const { device } = this;
        const halfFormat = (device.extTextureHalfFloat && device.textureHalfFloatUpdatable) ? PIXELFORMAT_RGBA16F : undefined;
        let floatFormat = device.extTextureFloat ? PIXELFORMAT_RGB32F : undefined;
        if (device.isWebGPU) {
            floatFormat = PIXELFORMAT_RGBA32F;
        }

        this.halfFormat = halfFormat ? {
            format: halfFormat,
            numComponents: 4,
            isHalf: true
        } : undefined;

        this.floatFormat = floatFormat ? {
            format: floatFormat,
            numComponents: floatFormat === PIXELFORMAT_RGBA32F ? 4 : 3,
            isHalf: false
        } : undefined;
    }

    getTextureFormat(preferHighPrecision: boolean) {
        return preferHighPrecision ? (this.floatFormat ?? this.halfFormat) : (this.halfFormat ?? this.floatFormat);
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

    createColorTexture(splatData: SplatData, size: Vec2) {

        const SH_C0 = 0.28209479177387814;

        const f_dc_0 = splatData.getProp('f_dc_0');
        const f_dc_1 = splatData.getProp('f_dc_1');
        const f_dc_2 = splatData.getProp('f_dc_2');
        const opacity = splatData.getProp('opacity');

        const texture = this.createTexture('splatColor', PIXELFORMAT_RGBA8, size);
        const data = texture.lock();

        const sigmoid = (v: number) => {
            if (v > 0) {
                return 1 / (1 + Math.exp(-v));
            }

            const t = Math.exp(v);
            return t / (1 + t);
        };

        for (let i = 0; i < splatData.numSplats; ++i) {

            // colors
            if (f_dc_0 && f_dc_1 && f_dc_2) {
                data[i * 4 + 0] = math.clamp((0.5 + SH_C0 * f_dc_0[i]) * 255, 0, 255);
                data[i * 4 + 1] = math.clamp((0.5 + SH_C0 * f_dc_1[i]) * 255, 0, 255);
                data[i * 4 + 2] = math.clamp((0.5 + SH_C0 * f_dc_2[i]) * 255, 0, 255);
            }

            // opacity
            data[i * 4 + 3] = opacity ? math.clamp(sigmoid(opacity[i]) * 255, 0, 255) : 255;
        }

        texture.unlock();
        return texture;
    }

    createScaleTexture(splatData: SplatData, size: Vec2, format: object) {

        // texture format based vars
        const { numComponents, isHalf } = format;

        const scale0 = splatData.getProp('scale_0');
        const scale1 = splatData.getProp('scale_1');
        const scale2 = splatData.getProp('scale_2');

        const texture = this.createTexture('splatScale', format.format, size);
        const data = texture.lock();

        for (let i = 0; i < splatData.numSplats; i++) {

            const sx = Math.exp(scale0[i]);
            const sy = Math.exp(scale1[i]);
            const sz = Math.exp(scale2[i]);

            if (isHalf) {
                data[i * numComponents + 0] = float2Half(sx);
                data[i * numComponents + 1] = float2Half(sy);
                data[i * numComponents + 2] = float2Half(sz);
            } else {
                data[i * numComponents + 0] = sx;
                data[i * numComponents + 1] = sy;
                data[i * numComponents + 2] = sz;
            }
        }

        texture.unlock();
        return texture;
    }

    create(splatData: SplatData, options: any) {
        const x = splatData.getProp('x');
        const y = splatData.getProp('y');
        const z = splatData.getProp('z');

        const rot_0 = splatData.getProp('rot_0');
        const rot_1 = splatData.getProp('rot_1');
        const rot_2 = splatData.getProp('rot_2');
        const rot_3 = splatData.getProp('rot_3');

        if (!x || !y || !z) {
            return;
        }

        const stride = 7;

        const textureSize = this.evalTextureSize(splatData.numSplats);
        const colorTexture = this.createColorTexture(splatData, textureSize);
        const scaleTexture = this.createScaleTexture(splatData, textureSize, this.getTextureFormat(false));

        // position.xyz, rotation.xyz
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

            // index
            if (isWebGPU) {
                uint32Data[i * stride + 6] = i;
            } else {
                floatData[i * stride + 6] = i + 0.2;
            }
        }

        this.material.setParameter('splatColor', colorTexture);
        this.material.setParameter('splatScale', scaleTexture);
        this.material.setParameter('tex_params', new Float32Array([textureSize.x, textureSize.y, 1 / textureSize.x, 1 / textureSize.y]));

        // create instance data
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR11, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR12, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR13, components: 1, type: isWebGPU ? TYPE_UINT32 : TYPE_FLOAT32 }
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
        splatData.calcFocalPoint(this.focalPoint);
    }
}

export { Splat };
