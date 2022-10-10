import {
    FILTER_NEAREST,
    PIXELFORMAT_R8_G8_B8_A8,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    shaderChunks,
    RenderTarget,
    ScopeId,
    Shader,
    Texture,
    WebglGraphicsDevice
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

const vertexShaderHeader = (device: WebglGraphicsDevice) => {
    // @ts-ignore
    return device.webgl2 ? `#version 300 es\n\n${shaderChunks.gles3VS}\n` : '';
};

const fragmentShaderHeader = (device: WebglGraphicsDevice) => {
    // @ts-ignore
    return (device.webgl2 ? `#version 300 es\n\n${shaderChunks.gles3PS}\n` : '') +
            `precision ${device.precision} float;\n\n`;
};

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

        this.shader = new Shader(device, {
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vshader: vertexShaderHeader(device) + vshader,
            fshader: fragmentShaderHeader(device) + fshader
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
            format: PIXELFORMAT_R8_G8_B8_A8,
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

        const device = this.device;
        const tx = x + 0.5 / depthTexture.width;
        const ty = y + 0.5 / depthTexture.height;

        this.depthTexUniform.setValue(depthTexture);
        this.texcoordRangeUniform.setValue([tx, ty, tx, ty]);
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
