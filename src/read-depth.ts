import {
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    shaderChunks,
    BlendState,
    RenderTarget,
    ScopeId,
    Shader,
    Texture,
    WebglGraphicsDevice,
    createShaderFromCode
} from 'playcanvas';

// @ts-ignore
const packDepthPS = shaderChunks.packDepthPS;

const vshader = `
attribute vec2 vertex_position;
varying vec2 texcoord;
void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    texcoord = vertex_position.xy * 0.5 + 0.5; // + texcoordOffset;
}
`;

const fshader = `
varying vec2 texcoord;
uniform sampler2D depthTex;
uniform vec4 texcoordRange;
${packDepthPS}
void main(void) {
    vec2 t = mix(texcoordRange.xy, texcoordRange.zw, texcoord);
    gl_FragColor = packFloat(texture2D(depthTex, t).x);
}
`;

const noBlend = new BlendState(false);

// helper class for reading out the depth values from depth render targets.
class ReadDepth {
    device: WebglGraphicsDevice;
    shader: Shader;
    depthTexUniform: ScopeId;
    texcoordRangeUniform: ScopeId;
    pixels = new Uint8Array(4);
    texture: Texture = null;
    renderTarget: RenderTarget = null;

    constructor(device: WebglGraphicsDevice) {
        this.device = device;

        this.shader = createShaderFromCode(device, vshader, fshader, 'read-depth', {
            vertex_position: SEMANTIC_POSITION
        });

        this.depthTexUniform = device.scope.resolve('depthTex');
        this.texcoordRangeUniform = device.scope.resolve('texcoordRange');

        const handler = () => {
            this.destroy();
        };

        device.once('destroy', handler);
        device.on('devicelost', handler);
    }

    destroy() {
        if (this.renderTarget) {
            this.renderTarget.destroy();
            this.renderTarget = null;
        }

        if (this.texture) {
            this.texture.destroy();
            this.texture = null;
        }
    }

    create() {
        this.texture = new Texture(this.device, {
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST
        });

        this.renderTarget = new RenderTarget({
            colorBuffer: this.texture,
            depth: false
        });
    }

    read(depthTexture: Texture, x: number, y: number) {
        if (!this.texture) {
            this.create();
        }

        console.log(`tex=${this.texture.width}x${this.texture.height} depth=${depthTexture.width}x${depthTexture.height}`);

        const device = this.device;
        const tx = x + 0.5 / depthTexture.width;
        const ty = y + 0.5 / depthTexture.height;

        this.depthTexUniform.setValue(depthTexture);
        this.texcoordRangeUniform.setValue([tx, ty, tx, ty]);
        device.setBlendState(noBlend);
        drawQuadWithShader(this.device, this.renderTarget, this.shader);

        const gl = device.gl;
        const oldRt = device.renderTarget;

        device.setRenderTarget(this.renderTarget);
        device.updateBegin();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);

        device.updateEnd();
        device.setRenderTarget(oldRt);
        device.updateBegin();

        // unpackFloat
        return this.pixels[0] / (255 * 256 * 256 * 256) +
               this.pixels[1] / (255 * 256 * 256) +
               this.pixels[2] / (255 * 256) +
               this.pixels[3] / (255);
    }
}

export {
    ReadDepth
};
