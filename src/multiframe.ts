import * as pc from 'playcanvas';

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
    gl_FragColor = vec4(pow(t.xyz, vec3(power)), 1.0);
}
`;

const vertexShaderHeader = (device: pc.WebglGraphicsDevice) => {
    // @ts-ignore
    return device.webgl2 ? `#version 300 es\n\n${pc.shaderChunks.gles3VS}\n` : '';
};

const fragmentShaderHeader = (device: pc.WebglGraphicsDevice) => {
    // @ts-ignore
    return (device.webgl2 ? `#version 300 es\n\n${pc.shaderChunks.gles3PS}\n` : '') +
            `precision ${device.precision} float;\n\n`;
};

const supportsFloat16 = (device: pc.WebglGraphicsDevice): boolean => {
    return device.extTextureHalfFloat && device.textureHalfFloatRenderable;
};

const supportsFloat32 = (device: pc.WebglGraphicsDevice): boolean => {
    return device.extTextureFloat && device.textureFloatRenderable;
};

// lighting source should be stored HDR
const choosePixelFormat = (device: pc.WebglGraphicsDevice): number => {
    return supportsFloat16(device) ? pc.PIXELFORMAT_RGBA16F :
        supportsFloat32(device) ? pc.PIXELFORMAT_RGBA32F :
            pc.PIXELFORMAT_R8_G8_B8_A8;
};

// calculate 1d gauss
const gauss = (x: number, sigma: number): number => {
    return (1.0 / (Math.sqrt(2.0 * Math.PI) * sigma)) * Math.exp(-(x * x) / (2.0 * sigma * sigma));
};

// generate multiframe, supersampled AA
class Multiframe {
    device: pc.WebglGraphicsDevice;
    camera: pc.CameraComponent;
    textureBias: number;
    shader: pc.Shader = null;
    pixelFormat: number;
    multiframeTexUniform: pc.ScopeId = null;
    powerUniform: pc.ScopeId = null;
    textureBiasUniform: pc.ScopeId = null;
    accumTexture: pc.Texture = null;
    accumRenderTarget: pc.RenderTarget = null;
    sampleId = 0;
    samples: pc.Vec3[] = [];
    enabled = true;
    totalWeight = 0;

    constructor(device: pc.WebglGraphicsDevice, camera: pc.CameraComponent, numSamples: number) {
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

        this.shader = new pc.Shader(device, {
            attributes: {
                vertex_position: pc.SEMANTIC_POSITION
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

    generateSamples(numSamples: number, jitter = false, size = 1, sigma = 0): pc.Vec3[] {
        const samples: pc.Vec3[] = [];
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
                samples.push(new pc.Vec3(sx * halfSize, sy * halfSize, weight));
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

        this.accumTexture = new pc.Texture(this.device, {
            width: source.width,
            height: source.height,
            format: this.pixelFormat,
            mipmaps: false,
            minFilter: pc.FILTER_NEAREST,
            magFilter: pc.FILTER_NEAREST
        });

        this.accumRenderTarget = new pc.RenderTarget({
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

        // in disabled state we resolve directly from source to backbuffer
        if (!this.enabled) {
            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(1.0);
            pc.drawQuadWithShader(device, null, this.shader);
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
            // blend grabpass with accumulation buffer
            const blendSrc = device.blendSrc;
            const blendDst = device.blendDst;
            const blendSrcAlpha = device.blendSrcAlpha;
            const blendDstAlpha = device.blendDstAlpha;

            const sampleWeight = this.samples[this.sampleId].z;

            if (this.sampleId === 0) {
                device.setBlendFunction(pc.BLENDMODE_ONE, pc.BLENDMODE_ZERO);
            } else {
                device.setBlendFunction(pc.BLENDMODE_CONSTANT_ALPHA, pc.BLENDMODE_ONE_MINUS_CONSTANT_ALPHA);
                device.setBlendColor(0, 0, 0, sampleWeight / (this.totalWeight + sampleWeight));
            }

            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(gamma);
            device.setBlending(true);
            pc.drawQuadWithShader(device, this.accumRenderTarget, this.shader, null, null, true);

            // restore states
            device.setBlendFunctionSeparate(blendSrc, blendDst, blendSrcAlpha, blendDstAlpha);

            this.totalWeight += sampleWeight;
        }

        if (this.sampleId === 0) {
            // first frame - copy the camera render target directly to the back buffer
            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(1.0);
            pc.drawQuadWithShader(device, null, this.shader);
        } else {
            this.multiframeTexUniform.setValue(this.accumTexture);
            this.powerUniform.setValue(1.0 / gamma);
            pc.drawQuadWithShader(device, null, this.shader);
        }

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

    copy(target: pc.RenderTarget) {
        const device = this.device;
        this.multiframeTexUniform.setValue(this.accumTexture);
        this.powerUniform.setValue(1.0 / gamma);
        pc.drawQuadWithShader(device, target, this.shader);
    }
}

export {
    Multiframe
};
