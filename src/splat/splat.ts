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
    SEMANTIC_ATTR13,
    TYPE_FLOAT32,
    VertexFormat,
    TYPE_UINT32,
    BUFFER_DYNAMIC,
    VertexBuffer,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_RGB32F,
    PIXELFORMAT_RGBA32F
} from "playcanvas";
import { SplatData } from "./splat-data";
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

        const f_dc_0 = splatData.prop('f_dc_0');
        const f_dc_1 = splatData.prop('f_dc_1');
        const f_dc_2 = splatData.prop('f_dc_2');
        const opacity = splatData.prop('opacity');

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

        const scale0 = splatData.prop('scale_0');
        const scale1 = splatData.prop('scale_1');
        const scale2 = splatData.prop('scale_2');

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

    createRotationTexture(splatData: SplatData, size: Vec2, format: object) {

        // texture format based vars
        const { numComponents, isHalf } = format;
        const quat = new Quat();

        const rot0 = splatData.prop('rot_0');
        const rot1 = splatData.prop('rot_1');
        const rot2 = splatData.prop('rot_2');
        const rot3 = splatData.prop('rot_3');

        const texture = this.createTexture('splatRotation', format.format, size);
        const data = texture.lock();

        for (let i = 0; i < splatData.numSplats; i++) {

            quat.set(rot0[i], rot1[i], rot2[i], rot3[i]).normalize();

            if (quat.w < 0) {
                quat.conjugate();
            }

            if (isHalf) {
                data[i * numComponents + 0] = float2Half(quat.x);
                data[i * numComponents + 1] = float2Half(quat.y);
                data[i * numComponents + 2] = float2Half(quat.z);
            } else {
                data[i * numComponents + 0] = quat.x;
                data[i * numComponents + 1] = quat.y;
                data[i * numComponents + 2] = quat.z;
            }
        }

        texture.unlock();
        return texture;
    }

    createCenterTexture(splatData: SplatData, size: Vec2, format: object) {

        // texture format based vars
        const { numComponents, isHalf } = format;

        const x = splatData.prop('x');
        const y = splatData.prop('y');
        const z = splatData.prop('z');

        const texture = this.createTexture('splatCenter', format.format, size);
        const data = texture.lock();

        for (let i = 0; i < splatData.numSplats; i++) {

            if (isHalf) {
                data[i * numComponents + 0] = float2Half(x[i]);
                data[i * numComponents + 1] = float2Half(y[i]);
                data[i * numComponents + 2] = float2Half(z[i]);
            } else {
                data[i * numComponents + 0] = x[i];
                data[i * numComponents + 1] = y[i];
                data[i * numComponents + 2] = z[i];
            }
        }

        texture.unlock();
        return texture;
    }

    create(splatData: SplatData, options: any) {
        const x = splatData.prop('x');
        const y = splatData.prop('y');
        const z = splatData.prop('z');

        if (!x || !y || !z) {
            return;
        }

        const textureSize = this.evalTextureSize(splatData.numSplats);
        const colorTexture = this.createColorTexture(splatData, textureSize);
        const scaleTexture = this.createScaleTexture(splatData, textureSize, this.getTextureFormat(false));
        const rotationTexture = this.createRotationTexture(splatData, textureSize, this.getTextureFormat(false));
        const centerTexture = this.createCenterTexture(splatData, textureSize, this.getTextureFormat(false));

        this.material.setParameter('splatColor', colorTexture);
        this.material.setParameter('splatScale', scaleTexture);
        this.material.setParameter('splatRotation', rotationTexture);
        this.material.setParameter('splatCenter', centerTexture);
        this.material.setParameter('tex_params', new Float32Array([textureSize.x, textureSize.y, 1 / textureSize.x, 1 / textureSize.y]));

        // create instance data
        const isWebGPU = this.device.isWebGPU;
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR13, components: 1, type: isWebGPU ? TYPE_UINT32 : TYPE_FLOAT32 }
        ]);

        const vertexBuffer = new VertexBuffer(
            this.device,
            vertexFormat,
            splatData.numSplats,
            BUFFER_DYNAMIC,
            new ArrayBuffer(splatData.numSplats * 4)
        );

        this.meshInstance = new MeshInstance(this.quadMesh, this.material);
        this.meshInstance.setInstancing(vertexBuffer);
    }
}

export { Splat };