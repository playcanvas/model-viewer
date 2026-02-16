import {
    type AppBase,
    type Entity,
    type MeshInstance,
    ADDRESS_CLAMP_TO_EDGE,
    BLENDEQUATION_ADD,
    BLENDMODE_ZERO,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA16F,
    Color,
    Ray,
    RenderPassPicker,
    RenderTarget,
    ShaderChunks,
    Texture,
    Vec3,
    BlendState,
    PROJECTION_ORTHOGRAPHIC
} from 'playcanvas';

const vec = new Vec3();
const vecb = new Vec3();
const ray = new Ray();
const clearColor = new Color(0, 0, 0, 1);

// Shared buffer for half-to-float conversion
const float32 = new Float32Array(1);
const uint32 = new Uint32Array(float32.buffer);

// Convert 16-bit half-float to 32-bit float using bit manipulation
const half2Float = (h: number): number => {
    const sign = (h & 0x8000) << 16;           // Move sign to bit 31
    const exponent = (h & 0x7C00) >> 10;       // Extract 5-bit exponent
    const mantissa = h & 0x03FF;               // Extract 10-bit mantissa

    if (exponent === 0) {
        if (mantissa === 0) {
            // Zero
            uint32[0] = sign;
        } else {
            // Denormalized: convert to normalized float32
            let e = -1;
            let m = mantissa;
            do {
                e++;
                m <<= 1;
            } while ((m & 0x0400) === 0);
            uint32[0] = sign | ((127 - 15 - e) << 23) | ((m & 0x03FF) << 13);
        }
    } else if (exponent === 31) {
        // Infinity or NaN
        uint32[0] = sign | 0x7F800000 | (mantissa << 13);
    } else {
        // Normalized: adjust exponent bias from 15 to 127
        uint32[0] = sign | ((exponent + 127 - 15) << 23) | (mantissa << 13);
    }

    return float32[0];
};

// get the normalized world-space ray starting at the camera position
// facing the supplied screen position
// works for both perspective and orthographic cameras
const getRay = (camera: Entity, screenX: number, screenY: number, ray: Ray) => {
    const cameraPos = camera.getPosition();

    // create the pick ray in world space
    if (camera.camera.projection === PROJECTION_ORTHOGRAPHIC) {
        camera.camera.screenToWorld(screenX, screenY, -1.0, vec);
        camera.camera.screenToWorld(screenX, screenY, 1.0, vecb);
        vecb.sub(vec).normalize();
        ray.set(vec, vecb);
    } else {
        camera.camera.screenToWorld(screenX, screenY, 1.0, vec);
        vec.sub(cameraPos).normalize();
        ray.set(cameraPos, vec);
    }
};

// override global pick to pack depth instead of meshInstance id
// uses SH_BANDS to detect gsplat shaders (which have gaussianColor varying)
const pickDepthGlsl = /* glsl */ `
uniform vec4 camera_params;     // 1/far, far, near, isOrtho
vec4 getPickOutput() {
    float linearDepth = 1.0 / gl_FragCoord.w;
    float normalizedDepth = (linearDepth - camera_params.z) / (camera_params.y - camera_params.z);
#ifdef SH_BANDS
    // Gaussian splat: use gaussianColor.a for alpha blending
    return vec4(gaussianColor.a * normalizedDepth, 0.0, 0.0, gaussianColor.a);
#else
    // Polygon mesh: solid geometry with alpha = 1.0
    return vec4(normalizedDepth, 0.0, 0.0, 1.0);
#endif
}
`;

const pickDepthWgsl = /* wgsl */ `
    uniform camera_params: vec4f;       // 1/far, far, near, isOrtho
    fn getPickOutput() -> vec4f {
        let linearDepth = 1.0 / pcPosition.w;
        let normalizedDepth = (linearDepth - uniform.camera_params.z) / (uniform.camera_params.y - uniform.camera_params.z);
#ifdef SH_BANDS
        // Gaussian splat: use gaussianColor.a for alpha blending
        return vec4f(gaussianColor.a * normalizedDepth, 0.0, 0.0, gaussianColor.a);
#else
        // Polygon mesh: solid geometry with alpha = 1.0
        return vec4f(normalizedDepth, 0.0, 0.0, 1.0);
#endif
    }
`;

class Picker {
    pick: (x: number, y: number) => Promise<Vec3 | null>;

    release: () => void;

    constructor(app: AppBase, camera: Entity) {
        const { graphicsDevice } = app;

        // override pick chunk for both GLSL and WGSL
        ShaderChunks.get(graphicsDevice, 'glsl').set('pickPS', pickDepthGlsl);
        ShaderChunks.get(graphicsDevice, 'wgsl').set('pickPS', pickDepthWgsl);

        let colorBuffer: Texture;
        let renderTarget: RenderTarget;
        let renderPass: RenderPassPicker;

        const emptyMap = new Map<number, MeshInstance>();

        const init = (width: number, height: number) => {
            colorBuffer = new Texture(graphicsDevice, {
                format: PIXELFORMAT_RGBA16F,
                width: width,
                height: height,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                name: 'picker'
            });

            renderTarget = new RenderTarget({
                colorBuffer,
                depth: true  // needed for solid mesh depth testing
            });

            renderPass = new RenderPassPicker(graphicsDevice, app.renderer);
            // RGB: additive depth accumulation (ONE, ONE_MINUS_SRC_ALPHA)
            // Alpha: multiplicative transmittance (ZERO, ONE_MINUS_SRC_ALPHA) -> T = T * (1 - alpha)
            renderPass.blendState = new BlendState(
                true,
                BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA,           // RGB blend
                BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE_MINUS_SRC_ALPHA           // Alpha blend (transmittance)
            );
        };

        this.pick = async (x: number, y: number) => {
            const width = Math.floor(graphicsDevice.width);
            const height = Math.floor(graphicsDevice.height);

            // convert from [0,1] to pixel coordinates
            const screenX = Math.floor(x * graphicsDevice.width);
            const screenY = Math.floor(y * graphicsDevice.height);

            // flip Y for texture read on WebGL (texture origin is bottom-left)
            const texX = screenX;
            const texY = graphicsDevice.isWebGL2 ? height - screenY - 1 : screenY;

            // construct picker on demand
            if (!renderPass) {
                init(width, height);
            } else {
                renderTarget.resize(width, height);
            }

            // render scene
            renderPass.init(renderTarget);
            renderPass.setClearColor(clearColor);
            renderPass.update(camera.camera, app.scene, [app.scene.layers.getLayerByName('World')], emptyMap, false);
            renderPass.render();

            // read pixel using texture coordinates
            const pixels = await colorBuffer.read(texX, texY, 1, 1, { renderTarget });

            // convert half-float values to floats
            // R channel: accumulated depth * alpha
            // A channel: transmittance (1 - alpha), values near 0 have better half-float precision
            const r = half2Float(pixels[0]);
            const transmittance = half2Float(pixels[3]);
            const alpha = 1 - transmittance;

            // check alpha first (transmittance close to 1 means nothing visible)
            if (alpha < 1e-6) {
                return null;
            }

            // get camera near/far for denormalization
            const near = camera.camera.nearClip;
            const far = camera.camera.farClip;

            // divide by alpha to get normalized depth, then denormalize to linear depth
            const normalizedDepth = r / alpha;
            const depth = normalizedDepth * (far - near) + near;

            // get the ray from camera through the screen point
            // use clientRect dimensions to match what screenToWorld uses internally
            getRay(camera,
                x * graphicsDevice.clientRect.width,
                y * graphicsDevice.clientRect.height,
                ray
            );

            // convert linear depth (view-space z distance) to ray distance
            const forward = camera.forward;
            const t = depth / ray.direction.dot(forward);

            // world position = ray origin + ray direction * t
            return ray.origin.clone().add(ray.direction.clone().mulScalar(t));
        };

        this.release = () => {
            renderPass?.destroy();
            renderTarget?.destroy();
            colorBuffer?.destroy();
        };
    }
}

export { Picker };
