import * as pc from 'playcanvas';

// @ts-ignore
const packDepthPS = pc.shaderChunks.packDepthPS;

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

const vertexShaderHeader = (device: pc.WebglGraphicsDevice) => {
    // @ts-ignore
    return device.webgl2 ? `#version 300 es\n\n${pc.shaderChunks.gles3VS}\n` : '';
};

const fragmentShaderHeader = (device: pc.WebglGraphicsDevice) => {
    // @ts-ignore
    return (device.webgl2 ? `#version 300 es\n\n${pc.shaderChunks.gles3PS}\n` : '') +
            `precision ${device.precision} float;\n\n`;
};

// helper class for reading out the depth values from depth render targets.
class ReadDepth {
    device: pc.WebglGraphicsDevice;
    shader: pc.Shader;
    depthTexUniform: pc.ScopeId;
    texcoordRangeUniform: pc.ScopeId;
    pixels = new Uint8Array(4);
    texture: pc.Texture = null;
    renderTarget: pc.RenderTarget = null;

    constructor(device: pc.WebglGraphicsDevice) {
        this.device = device;

        this.shader = new pc.Shader(device, {
            attributes: {
                vertex_position: pc.SEMANTIC_POSITION
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
        this.texture = new pc.Texture(this.device, {
            width: 1,
            height: 1,
            format: pc.PIXELFORMAT_R8_G8_B8_A8,
            mipmaps: false,
            minFilter: pc.FILTER_NEAREST,
            magFilter: pc.FILTER_NEAREST
        });

        this.renderTarget = new pc.RenderTarget({
            colorBuffer: this.texture,
            depth: false
        });
    }

    read(depthTexture: pc.Texture, x: number, y: number) {
        if (!this.texture) {
            this.create();
        }

        const device = this.device;
        const tx = x + 0.5 / depthTexture.width;
        const ty = y + 0.5 / depthTexture.height;

        this.depthTexUniform.setValue(depthTexture);
        this.texcoordRangeUniform.setValue([x, y, x, y]);
        pc.drawQuadWithShader(this.device, this.renderTarget, this.shader);

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
