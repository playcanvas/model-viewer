import * as pc from 'playcanvas';

const gamma = 2.2;

const vshader: string = `
attribute vec2 vertex_position;
varying vec2 texcoord;
void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    texcoord = vertex_position.xy * 0.5 + 0.5;
}
`;

const fshader: string = `
varying vec2 texcoord;
uniform sampler2D texture_multiframeSource;
uniform float multiplier;
uniform float power;
void main(void) {
    vec4 t = texture2D(texture_multiframeSource, texcoord);
    gl_FragColor = vec4(pow(t.xyz * multiplier, vec3(power)), 1.0);
}
`;

const vertexShaderHeader = (device: pc.GraphicsDevice) => {
    // @ts-ignore
    return device.webgl2 ? `#version 300 es\n\n${pc.shaderChunks.gles3VS}\n` : '';
}

const fragmentShaderHeader = (device: pc.GraphicsDevice) => {
    // @ts-ignore
    return (device.webgl2 ? `#version 300 es\n\n${pc.shaderChunks.gles3PS}\n` : '') +
            `precision ${device.precision} float;\n\n`;
}

const supportsFloat16 = (device: pc.GraphicsDevice): boolean => {
    return device.extTextureHalfFloat && device.textureHalfFloatRenderable;
};

const supportsFloat32 = (device: pc.GraphicsDevice): boolean => {
    return device.extTextureFloat && device.textureFloatRenderable;
};

// lighting source should be stored HDR
const choosePixelFormat = (device: pc.GraphicsDevice): number => {
    return supportsFloat16(device) ? pc.PIXELFORMAT_RGBA16F :
        supportsFloat32(device) ? pc.PIXELFORMAT_RGBA32F :
            pc.PIXELFORMAT_R8_G8_B8_A8;
};

class Multiframe {
    device: pc.GraphicsDevice;
    camera: pc.CameraComponent;
    // @ts-ignore
    grabPass: pc.GrabPass = null;
    shader: pc.Shader = null;
    pixelFormat: number;
    multiframeTexUniform: pc.ScopeId = null;
    multiplierUniform: pc.ScopeId = null;
    powerUniform: pc.ScopeId = null;
    globalTextureBiasUniform: pc.ScopeId = null;
    firstTexture: pc.Texture = null;
    firstRenderTarget: pc.RenderTarget = null;
    accumTexture: pc.Texture = null;
    accumRenderTarget: pc.RenderTarget = null;
    frameId: number = 0;
    frameTotal: number = 32;

    constructor(device: pc.GraphicsDevice, camera: pc.CameraComponent) {
        this.device = device;
        this.camera = camera;

        const pmat = this.camera.projectionMatrix;
        let offset = new pc.Vec2();
        let store = new pc.Vec2();

        this.camera.onPreRender = () => {
            if (this.frameId !== 0) {
                offset.x = (Math.random() * 2.0 - 1.0) * (1 / device.width);
                offset.y = (Math.random() * 2.0 - 1.0) * (1 / device.height);

                store.set(pmat.data[12], pmat.data[13]);
                pmat.data[8] += offset.x;
                pmat.data[9] += offset.y;

                // look away
                this.camera._camera._viewMatDirty = true;
                this.camera._camera._viewProjMatDirty = true;
            }
            this.globalTextureBiasUniform.setValue(this.frameId === 0 ? 0.0 : -5.0);
        }

        this.camera.onPostRender = () => {
            if (this.frameId !== 0) {
                pmat.data[8] = store.x;
                pmat.data[9] = store.y;
            }
        }

        // @ts-ignore
        this.grabPass = new pc.GrabPass(device, true, false, 'texture_multiframeSource');

        this.shader = new pc.Shader(device, {
            attributes: {
                vertex_position: pc.SEMANTIC_POSITION
            },
            vshader: vertexShaderHeader(device) + vshader,
            fshader: fragmentShaderHeader(device) + fshader
        });

        this.pixelFormat = choosePixelFormat(device);
        this.multiframeTexUniform = device.scope.resolve('texture_multiframeSource');
        this.multiplierUniform = device.scope.resolve('multiplier');
        this.powerUniform = device.scope.resolve('power');
        this.globalTextureBiasUniform = device.scope.resolve('globalTextureBias');

        const handler = () => {
            this.destroy();
        };

        device.once('destroy', handler);
        device.on('devicelost', handler);
    }

    destroy() {
        if (this.firstTexture) {
            this.firstTexture.destroy();
            this.firstTexture = null;
        }

        if (this.firstRenderTarget) {
            this.firstRenderTarget.destroy();
            this.firstRenderTarget = null;
        }

        if (this.accumRenderTarget) {
            this.accumRenderTarget.destroy();
            this.accumRenderTarget = null;
        }

        if (this.accumTexture) {
            this.accumTexture.destroy();
            this.accumTexture = null;
        }
    }

    moved() {
        this.frameId = 0;
    }

    create() {
        this.firstTexture = new pc.Texture(this.device, {
            width: this.device.width,
            height: this.device.height,
            mipmaps: false
        });
        this.firstRenderTarget = new pc.RenderTarget({
            colorBuffer: this.firstTexture,
            depth: false
        });

        this.accumTexture = new pc.Texture(this.device, {
            width: this.device.width,
            height:  this.device.height,
            format: this.pixelFormat,
            mipmaps: false
        });

        this.accumRenderTarget = new pc.RenderTarget({
            colorBuffer: this.accumTexture,
            depth: false
        });
    }

    prepareTexture() {
        const device = this.device;

        if (!this.accumTexture) {
            this.create();
        }

        if (this.frameId < this.frameTotal) {
            // grab the backbuffer
            this.grabPass.prepareTexture();

            if (this.frameId === 0) {
                // store the grabpass in both accumulation and current
                this.multiframeTexUniform.setValue(this.grabPass.texture);
                this.multiplierUniform.setValue(1.0);
                this.powerUniform.setValue(gamma);
                pc.drawQuadWithShader(device, this.accumRenderTarget, this.shader, null, null, true);

                this.powerUniform.setValue(1.0);
                pc.drawQuadWithShader(device, this.firstRenderTarget, this.shader, null, null, true);
            } else {
                // blend grabpass with accumulation buffer
                const blendSrc = device.blendSrc;
                const blendDst = device.blendDst;
                const blendSrcAlpha = device.blendSrcAlpha;
                const blendDstAlpha = device.blendDstAlpha;

                device.setBlending(true);
                device.setBlendFunctionSeparate(pc.BLENDMODE_ONE, pc.BLENDMODE_ONE, pc.BLENDMODE_ONE, pc.BLENDMODE_ZERO);

                this.multiframeTexUniform.setValue(this.grabPass.texture);
                this.multiplierUniform.setValue(1.0);
                this.powerUniform.setValue(gamma);
                pc.drawQuadWithShader(device, this.accumRenderTarget, this.shader, null, null, true);

                // restore states
                device.setBlendFunctionSeparate(blendSrc, blendDst, blendSrcAlpha, blendDstAlpha);

                // resolve final frame
                if (this.frameId === (this.frameTotal - 1)) {
                    this.multiframeTexUniform.setValue(this.accumTexture);
                    this.multiplierUniform.setValue(1.0 / this.frameTotal);
                    this.powerUniform.setValue(1.0 / gamma);
                    pc.drawQuadWithShader(device, this.firstRenderTarget, this.shader);
                }
            }
        }

        // replace backbuffer with multiframe buffer
        this.multiframeTexUniform.setValue(this.firstTexture);
        this.multiplierUniform.setValue(1.0);
        this.powerUniform.setValue(1.0);
        pc.drawQuadWithShader(device, null, this.shader);

        if (this.frameId < this.frameTotal) {
            this.frameId++;
        }

        return this.frameId < this.frameTotal;
    }
}

export {
    Multiframe
}
