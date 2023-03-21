import {
    BLENDEQUATION_ADD,
    BLENDMODE_CONSTANT,
    BLENDMODE_ONE_MINUS_CONSTANT,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    shaderChunks,
    BlendState,
    CameraComponent,
    RenderTarget,
    ScopeId,
    Shader,
    Texture,
    Vec3,
    WebglGraphicsDevice
} from 'playcanvas';

const gamma = 2.2;

const vshader = `
attribute vec2 vertex_position;
varying vec2 texcoord;
void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    texcoord = vertex_position.xy * 0.5 + 0.5;
}
`;

const fshader = `
varying vec2 texcoord;
uniform sampler2D multiframeTex;
uniform float power;
void main(void) {
    vec4 t = texture2D(multiframeTex, texcoord);
    gl_FragColor = pow(t, vec4(power));
}
`;

const vertexShaderHeader = (device: WebglGraphicsDevice) => {
    // @ts-ignore
    return device.webgl2 ? `#version 300 es\n\n${shaderChunks.gles3VS}\n` : '';
};

const fragmentShaderHeader = (device: WebglGraphicsDevice) => {
    // @ts-ignore
    return (device.webgl2 ? `#version 300 es\n\n${shaderChunks.gles3PS}\n` : '') +
            `precision ${device.precision} float;\n\n`;
};

const supportsFloat16 = (device: WebglGraphicsDevice): boolean => {
    return device.extTextureHalfFloat && device.textureHalfFloatRenderable;
};

const supportsFloat32 = (device: WebglGraphicsDevice): boolean => {
    return device.extTextureFloat && device.textureFloatRenderable;
};

// lighting source should be stored HDR
const choosePixelFormat = (device: WebglGraphicsDevice): number => {
    return supportsFloat16(device) ? PIXELFORMAT_RGBA16F :
        supportsFloat32(device) ? PIXELFORMAT_RGBA32F :
            PIXELFORMAT_RGBA8;
};

// calculate 1d gauss
const gauss = (x: number, sigma: number): number => {
    return (1.0 / (Math.sqrt(2.0 * Math.PI) * sigma)) * Math.exp(-(x * x) / (2.0 * sigma * sigma));
};

const tempBlend = new BlendState();
const accumBlend = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_CONSTANT, BLENDMODE_ONE_MINUS_CONSTANT);
const noBlend = new BlendState(false);

// generate multiframe, supersampled AA
class Multiframe {
    device: WebglGraphicsDevice;
    camera: CameraComponent;
    textureBias: number;
    shader: Shader = null;
    pixelFormat: number;
    multiframeTexUniform: ScopeId = null;
    powerUniform: ScopeId = null;
    textureBiasUniform: ScopeId = null;
    accumTexture: Texture = null;
    accumRenderTarget: RenderTarget = null;
    sampleId = 0;
    samples: Vec3[] = [];
    enabled = true;
    totalWeight = 0;

    constructor(device: WebglGraphicsDevice, camera: CameraComponent, numSamples: number) {
        this.device = device;
        this.camera = camera;
        this.textureBias = -Math.log2(numSamples);
        this.samples = this.generateSamples(numSamples, false, 2, 0);

        // just before rendering the scene we apply a subpixel jitter
        // to the camera's projection matrix.
        this.camera.onPreRender = () => {
            const camera = this.camera.camera;
            const pmat = camera.projectionMatrix;

            if (this.enabled && this.accumTexture) {
                const sample = this.samples[this.sampleId];
                pmat.data[8] = sample.x / this.accumTexture.width;
                pmat.data[9] = sample.y / this.accumTexture.height;
                this.textureBiasUniform.setValue(this.sampleId === 0 ? 0.0 : this.textureBias);
            } else {
                pmat.data[8] = 0;
                pmat.data[9] = 0;
                this.textureBiasUniform.setValue(0.0);
            }

            // look away
            camera._viewProjMatDirty = true;
        };

        this.shader = new Shader(device, {
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vshader: vertexShaderHeader(device) + vshader,
            fshader: fragmentShaderHeader(device) + fshader
        });

        this.pixelFormat = choosePixelFormat(device);
        this.multiframeTexUniform = device.scope.resolve('multiframeTex');
        this.powerUniform = device.scope.resolve('power');
        this.textureBiasUniform = device.scope.resolve('textureBias');

        const handler = () => {
            this.destroy();
        };

        device.once('destroy', handler);
        device.on('devicelost', handler);
    }

    // configure sampling
    // numSamples: square root of number of samples: 5 === 25 total samples
    // jitter: enable sample jittering
    // size: size of the filter, in pixels
    // sigma: guassian sigma filter value or 0 to use box filtering instead
    setSamples(numSamples: number, jitter = false, size = 1, sigma = 0) {
        this.textureBias = -Math.log2(numSamples);
        this.samples = this.generateSamples(numSamples, jitter, size, sigma);
        this.sampleId = 0;
    }

    generateSamples(numSamples: number, jitter = false, size = 1, sigma = 0): Vec3[] {
        const samples: Vec3[] = [];
        const kernelSize = Math.ceil(3 * sigma) + 1;
        const halfSize = size * 0.5;
        let sx, sy, weight;

        // generate jittered grid samples (poisson would be better)
        for (let x = 0; x < numSamples; ++x) {
            for (let y = 0; y < numSamples; ++y) {
                // generate sx, sy in range -1..1
                if (jitter) {
                    sx = (x + Math.random()) / numSamples * 2.0 - 1.0;
                    sy = (y + Math.random()) / numSamples * 2.0 - 1.0;
                } else {
                    sx = x / (numSamples - 1) * 2.0 - 1.0;
                    sy = y / (numSamples - 1) * 2.0 - 1.0;
                }
                // calculate sample weight
                weight = (sigma <= 0.0) ? 1.0 : gauss(sx * kernelSize, sigma) * gauss(sy * kernelSize, sigma);
                samples.push(new Vec3(sx * halfSize, sy * halfSize, weight));
            }
        }

        // normalize weights
        let totalWeight = 0;
        samples.forEach((v) => {
            totalWeight += v.z;
        });
        samples.forEach((v) => {
            v.z /= totalWeight;
        });

        // closest sample first
        samples.sort((a, b) => {
            const aL = a.length();
            const bL = b.length();
            return aL < bL ? -1 : (bL < aL ? 1 : 0);
        });

        return samples;
    }

    destroy() {
        if (this.accumRenderTarget) {
            this.accumRenderTarget.destroy();
            this.accumRenderTarget = null;
        }

        if (this.accumTexture) {
            this.accumTexture.destroy();
            this.accumTexture = null;
        }
    }

    create() {
        const source = this.camera.renderTarget.colorBuffer;

        this.accumTexture = new Texture(this.device, {
            width: source.width,
            height: source.height,
            format: this.pixelFormat,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST
        });

        this.accumRenderTarget = new RenderTarget({
            colorBuffer: this.accumTexture,
            depth: false
        });
    }

    // flag the camera as moved
    moved() {
        this.sampleId = 0;
        this.totalWeight = 0;
    }

    // update the multiframe accumulation buffer.
    // blend the camera's render target colour buffer with the multiframe accumulation buffer.
    // writes results to the backbuffer.
    update() {
        const device = this.device;
        const sampleCnt = this.samples.length;
        const sourceTex = this.camera.renderTarget.colorBuffer;

        // store device blend state
        tempBlend.copy(device.blendState);
        device.setBlendState(noBlend);

        // in disabled state we resolve directly from source to backbuffer
        if (!this.enabled) {
            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(1.0);
            drawQuadWithShader(device, null, this.shader);
            this.activateBackbuffer();
            return false;
        }

        if (this.accumTexture && (this.accumTexture.width !== sourceTex.width ||
                                  this.accumTexture.height !== sourceTex.height)) {
            this.destroy();
        }

        if (!this.accumTexture) {
            this.create();
        }

        if (this.sampleId < sampleCnt) {
            const sampleWeight = this.samples[this.sampleId].z;
            const blend = sampleWeight / (this.totalWeight + sampleWeight);
            device.setBlendState(accumBlend);
            device.setBlendColor(blend, blend, blend, blend);
            
            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(gamma);
            drawQuadWithShader(device, this.accumRenderTarget, this.shader, null, null);

            this.totalWeight += sampleWeight;

            device.setBlendState(noBlend);
        }

        if (this.sampleId === 0) {
            // first frame - copy the camera render target directly to the back buffer
            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(1.0);
        } else {
            this.multiframeTexUniform.setValue(this.accumTexture);
            this.powerUniform.setValue(1.0 / gamma);
        }

        drawQuadWithShader(device, null, this.shader);

        // restore blend state
        device.setBlendState(tempBlend);

        if (this.sampleId < sampleCnt) {
            this.sampleId++;
        }

        this.activateBackbuffer();

        return this.sampleId < sampleCnt;
    }

    // activate the backbuffer for upcoming rendering
    activateBackbuffer() {
        const device = this.device;
        device.setRenderTarget(null);
        device.updateBegin();
        device.setViewport(0, 0, device.width, device.height);
        device.setScissor(0, 0, device.width, device.height);
    }

    copy(target: RenderTarget) {
        const device = this.device;
        this.multiframeTexUniform.setValue(this.accumTexture);
        this.powerUniform.setValue(1.0 / gamma);
        drawQuadWithShader(device, target, this.shader);
    }
}

export {
    Multiframe
};
