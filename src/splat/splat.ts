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
import { createSplatMaterial } from "./splat-material";

type TypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
    | number[];

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

const evalTextureSize = (count: number) : Vec2 => {
    const width = Math.ceil(Math.sqrt(count));
    const height = Math.ceil(count / width);
    return new Vec2(width, height);
};

const createTexture = (device: GraphicsDevice, name: string, format: number, size: Vec2) => {
    return new Texture(device, {
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
};

const getTextureFormat = (device: GraphicsDevice, preferHighPrecision: boolean) => {
    const halfFormat = (device.extTextureHalfFloat && device.textureHalfFloatUpdatable) ? PIXELFORMAT_RGBA16F : undefined;
    const half = halfFormat ? {
        format: halfFormat,
        numComponents: 4,
        isHalf: true
    } : undefined;

    const floatFormat = device.isWebGPU ? PIXELFORMAT_RGBA32F : (device.extTextureFloat ? PIXELFORMAT_RGB32F : undefined);
    const float = floatFormat ? {
        format: floatFormat,
        numComponents: floatFormat === PIXELFORMAT_RGBA32F ? 4 : 3,
        isHalf: false
    } : undefined;

    return preferHighPrecision ? (float ?? half) : (half ?? float);
};

class Splat {
    numSplats: number;
    material: Material;
    mesh: Mesh;
    meshInstance: MeshInstance;

    format: any;
    colorTexture: Texture;
    scaleTexture: Texture;
    rotationTexture: Texture;
    centerTexture: Texture;

    constructor(device: GraphicsDevice, numSplats: number, debugRender = false) {
        this.numSplats = numSplats;

        // material
        this.material = createSplatMaterial(device, debugRender);

        // mesh
        if (debugRender) {
            this.mesh = createBox(device, {
                halfExtents: new Vec3(1.0, 1.0, 1.0)
            });
        } else {
            this.mesh = new Mesh(device);
            this.mesh.setPositions(new Float32Array([
                -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
            ]), 2);
            this.mesh.update();
        }

        // mesh instance
        const vertexFormat = new VertexFormat(device, [
            { semantic: SEMANTIC_ATTR13, components: 1, type: device.isWebGPU ? TYPE_UINT32 : TYPE_FLOAT32 }
        ]);

        const vertexBuffer = new VertexBuffer(
            device,
            vertexFormat,
            numSplats,
            BUFFER_DYNAMIC,
            new ArrayBuffer(numSplats * 4)
        );

        this.meshInstance = new MeshInstance(this.mesh, this.material);
        this.meshInstance.setInstancing(vertexBuffer);

        // create data textures and fill
        const size = evalTextureSize(numSplats);

        this.format = getTextureFormat(device, false);
        this.colorTexture = createTexture(device, 'splatColor', PIXELFORMAT_RGBA8, size);
        this.scaleTexture = createTexture(device, 'splatScale', this.format.format, size);
        this.rotationTexture = createTexture(device, 'splatRotation', this.format.format, size);
        this.centerTexture = createTexture(device, 'splatCenter', this.format.format, size);

        this.material.setParameter('splatColor', this.colorTexture);
        this.material.setParameter('splatScale', this.scaleTexture);
        this.material.setParameter('splatRotation', this.rotationTexture);
        this.material.setParameter('splatCenter', this.centerTexture);
        this.material.setParameter('tex_params', new Float32Array([size.x, size.y, 1 / size.x, 1 / size.y]));
    }

    destroy() {
        this.colorTexture.destroy();
        this.scaleTexture.destroy();
        this.rotationTexture.destroy();
        this.centerTexture.destroy();
        this.material.destroy();
        this.mesh.destroy();
    }

    updateColorData(f_dc_0: TypedArray, f_dc_1: TypedArray, f_dc_2: TypedArray, opacity: TypedArray) {
        const SH_C0 = 0.28209479177387814;
        const texture = this.colorTexture;
        const data = texture.lock();

        const sigmoid = (v: number) => {
            if (v > 0) {
                return 1 / (1 + Math.exp(-v));
            }

            const t = Math.exp(v);
            return t / (1 + t);
        };

        for (let i = 0; i < this.numSplats; ++i) {

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
    }

    updateScaleData(scale_0: TypedArray, scale_1: TypedArray, scale_2: TypedArray) {
        const { numComponents, isHalf } = this.format;
        const texture = this.scaleTexture;
        const data = texture.lock();

        for (let i = 0; i < this.numSplats; i++) {

            const sx = Math.exp(scale_0[i]);
            const sy = Math.exp(scale_1[i]);
            const sz = Math.exp(scale_2[i]);

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
    }

    updateRotationData(rot_0: TypedArray, rot_1: TypedArray, rot_2: TypedArray, rot_3: TypedArray) {
        const { numComponents, isHalf } = this.format;
        const quat = new Quat();

        const texture = this.rotationTexture;
        const data = texture.lock();

        for (let i = 0; i < this.numSplats; i++) {

            quat.set(rot_0[i], rot_1[i], rot_2[i], rot_3[i]).normalize();

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
    }

    updateCenterData(x: TypedArray, y: TypedArray, z: TypedArray) {
        const { numComponents, isHalf } = this.format;

        const texture = this.centerTexture;
        const data = texture.lock();

        for (let i = 0; i < this.numSplats; i++) {

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
    }
}

export { Splat };
