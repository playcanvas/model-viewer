import {
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BlendState,
    RenderTarget,
    ScopeId,
    Shader,
    Texture,
    GraphicsDevice,
    createShaderFromCode
} from 'playcanvas';

const vshader = `
attribute vec2 vertex_position;
varying vec2 texcoord;
void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    texcoord = vertex_position * 0.5 + 0.5;
}
`;

const fshader = `
uniform highp sampler2D depthTex;
uniform vec4 texcoordRange;
varying vec2 texcoord;

vec4 packFloat(float depth) {
    const vec4 bit_shift = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
    const vec4 bit_mask  = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);

    // combination of mod and multiplication and division works better
    vec4 res = mod(depth * bit_shift * vec4(255), vec4(256) ) / vec4(255);
    res -= res.xxyz * bit_mask;
    return res;
}

void main(void) {
    vec2 t = mix(texcoordRange.xy, texcoordRange.zw, texcoord);
    gl_FragColor = packFloat(texelFetch(depthTex, ivec2(t * vec2(textureSize(depthTex, 0))), 0).x);
}
`;

const noBlend = new BlendState(false);

// helper class for reading out the depth values from depth render targets.
class ReadDepth {
    device: GraphicsDevice;

    shader: Shader;

    depthTexUniform: ScopeId;

    texcoordRangeUniform: ScopeId;

    pixels = new Uint8Array(4);

    texture: Texture = null;

    renderTarget: RenderTarget = null;

    constructor(device: GraphicsDevice) {
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

    async read(depthTexture: Texture, x: number, y: number) {
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

        const pixels = await this.texture.read(0, 0, 1, 1);

        // unpackFloat
        return pixels[0] / (255 * 256 * 256 * 256) +
               pixels[1] / (255 * 256 * 256) +
               pixels[2] / (255 * 256) +
               pixels[3] / (255);
    }
}

export {
    ReadDepth
};
