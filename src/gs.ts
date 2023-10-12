import {
    AppBase,
    Asset,
    AssetRegistry,
    BoundingBox,
    BUFFER_DYNAMIC,
    ContainerHandler,
    ContainerResource,
    createShaderFromCode,
    createBox,
    CULLFACE_NONE,
    Entity,
    GraphicsDevice,
    Material,
    Mesh,
    MeshInstance,
    Quat,
    RenderComponent,
    SEMANTIC_ATTR11,
    SEMANTIC_ATTR12,
    SEMANTIC_ATTR13,
    SEMANTIC_ATTR14,
    SEMANTIC_ATTR15,
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    Texture,
    TYPE_UINT8,
    Vec3,
    VertexFormat,
    VertexBuffer,
    TYPE_FLOAT32,
    BLEND_NORMAL
} from 'playcanvas';

import { readPly, PlyElement } from './ply-parser';
import { SortWorker } from './sort-worker';

const gsVS = /*glsl_*/ `
attribute vec3 vertex_position;
attribute vec3 splat_center;
attribute vec4 splat_color;
attribute vec3 splat_cova;
attribute vec3 splat_covb;
attribute vec4 splat_rotation;
attribute vec3 splat_scale;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform mat4 matrix_viewProjection;
uniform mat4 matrix_viewInverse;

varying vec2 texCoord;
varying vec4 color;
varying vec3 conic;

const vec2 focal = vec2(1164.6601287484507, 1159.5880733038064);
const vec2 viewport = vec2(3492.0, 2338.0);
const vec2 tan_fov = viewport * vec2(0.5) / focal;

vec3 computeCovariance(in vec3 position, in vec3 covA, in vec3 covB)
{
    vec4 t = matrix_view * vec4(position, 1.0);

    float limx = 1.3 * tan_fov.x;
    float limy = 1.3 * tan_fov.y;
    float txtz = t.x / t.z;
    float tytz = t.y / t.z;

    t.x = min(limx, max(-limx, txtz)) * t.z;
    t.y = min(limy, max(-limy, tytz)) * t.z;

    mat4 J = mat4(
        focal.x / t.z, 0., -(focal.x * t.x) / (t.z * t.z), 0.,
        0., focal.y / t.z, -(focal.y * t.y) / (t.z * t.z), 0.,
        0., 0., 0., 0.,
        0., 0., 0., 0.
    );

    mat4 W = transpose(matrix_view);

    mat4 T = W * J;

    mat4 Vrk = mat4(
        covA.x, covA.y, covA.z, 0.,
        covA.y, covB.x, covB.y, 0.,
        covA.z, covB.y, covB.z, 0.,
        0., 0., 0., 0.
    );

    mat4 cov = transpose(T) * transpose(Vrk) * T;

    return vec3(
        cov[0][0] + 0.3,
        cov[0][1],
        cov[1][1] + 0.3
    );
}

void method1(vec4 splat_cam, vec4 splat_proj) {
    vec3 cov2d = computeCovariance(splat_center, splat_cova, splat_covb);

    float det = cov2d.x * cov2d.z - cov2d.y * cov2d.y;
    float det_inv = 1.0 / det;
    float mid = 0.5 * (cov2d.x + cov2d.z);
    float lambda_1 = mid + sqrt(max(0.1, mid * mid - det));
    float lambda_2 = mid - sqrt(max(0.1, mid * mid - det));
    float radius_px = ceil(3. * sqrt(max(lambda_1, lambda_2)));
    vec2 radius_ndc = vec2(radius_px) / viewport;

    vec4 projPosition = splat_proj / splat_proj.w;

    gl_Position = vec4(projPosition.xy + 2.0 * radius_ndc * vertex_position.xy, projPosition.zw);
    texCoord = radius_px * vertex_position.xy;
    color = splat_color;
    conic = vec3(cov2d.z * det_inv, cov2d.y * det_inv, cov2d.x * det_inv);
}

void method2(vec4 splat_cam, vec4 splat_proj) {
    mat3 Vrk = mat3(
        splat_cova.x, splat_cova.y, splat_cova.z, 
        splat_cova.y, splat_covb.x, splat_covb.y,
        splat_cova.z, splat_covb.y, splat_covb.z
    );

    mat3 J = mat3(
        focal.x / splat_cam.z, 0., -(focal.x * splat_cam.x) / (splat_cam.z * splat_cam.z), 
        0., focal.y / splat_cam.z, -(focal.y * splat_cam.y) / (splat_cam.z * splat_cam.z), 
        0., 0., 0.
    );

    mat3 W = transpose(mat3(matrix_view));
    mat3 T = W * J;
    mat3 cov = transpose(T) * Vrk * T;

    float diagonal1 = cov[0][0] + 0.3;
    float offDiagonal = cov[0][1];
    float diagonal2 = cov[1][1] + 0.3;

        float mid = 0.5 * (diagonal1 + diagonal2);
        float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
        float lambda1 = mid + radius;
        float lambda2 = max(mid - radius, 0.1);
        vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
        vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
        vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

    gl_Position = vec4(
        splat_proj.xy / splat_proj.w
        + vertex_position.x * v1 / viewport * 8.0 
        + vertex_position.y * v2 / viewport * 8.0, 0.0, 1.0);

    texCoord = vertex_position.xy * 2.0;
    color = splat_color;
}

mat3 quatToMat3_(vec4 quat)
{
    float w = quat.x;
    float x = quat.y;
    float y = quat.z;
    float z = quat.w;

    return mat3(
        1.0 - 2.0 * (y*y + z*z),       2.0 * (x*y - w*z),       2.0 * (x*z + w*y),
              2.0 * (x*y + w*z), 1.0 - 2.0 * (x*x + z*z),       2.0 * (y*z - w*x),
              2.0 * (x*z - w*y),       2.0 * (y*z + w*x), 1.0 - 2.0 * (x*x + y*y)
    );
}

mat3 quatToMat3(vec4 quat)
{
    float x = quat.x;
    float y = quat.y;
    float z = quat.z;
    float w = quat.w;
    
    return mat3(
        1.0 - 2.0 * (z * z + w * w),
              2.0 * (y * z + x * w),
              2.0 * (y * w - x * z),

              2.0 * (y * z - x * w),
        1.0 - 2.0 * (y * y + w * w),
              2.0 * (z * w + x * y),

              2.0 * (y * w + x * z),
              2.0 * (z * w - x * y),
        1.0 - 2.0 * (y * y + z * z)
    );
}

void debugRender() {
    vec3 local = quatToMat3(splat_rotation) * (vertex_position * splat_scale * 2.0) + splat_center;
    gl_Position = matrix_viewProjection * matrix_model * vec4(local, 1.0);
    texCoord = vertex_position.xy;
    color = splat_color;
}

void main(void)
{
    vec4 splat_world = matrix_model * vec4(splat_center, 1.0);
    vec4 splat_cam = matrix_view * splat_world;
    vec4 splat_proj = matrix_projection * splat_cam;

    // cull behind camera
    if (splat_proj.z < -splat_proj.w) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // method 1
    // method1(splat_cam, splat_proj);

    // method 2
    method2(splat_cam, splat_proj);

    // debug render
    // debugRender();
}
`;

const gsFS = /*glsl_*/ `
varying vec2 texCoord;
varying vec4 color;
varying vec3 conic;

void main(void)
{
    // method 1
    // vec2 d = -texCoord;
    // float power = -0.5 * (conic.x * d.x * d.x + conic.z * d.y * d.y) + conic.y * d.x * d.y;
    // if (power > 0.0) discard;
    // float alpha = min(0.99, color.a * exp(power));
    // gl_FragColor = vec4(color.rgb, alpha);

    // method 2
    float A = -dot(texCoord, texCoord);
    if (A < -4.0) discard;
    float B = exp(A) * color.a;
    gl_FragColor = vec4(color.rgb, B);

    // debug
    // if (color.w < 0.2) discard;
    // gl_FragColor = color;
}
`;

class PlyContainerResource extends ContainerResource {
    device: GraphicsDevice;
    elements: PlyElement[];

    quadMaterial: Material;
    quadMesh: Mesh;

    renders: RenderComponent[] = [];
    meshes: Mesh[] = [];
    materials: Material[] = [];
    textures: Texture[] = [];

    constructor(device: GraphicsDevice, elements: PlyElement[]) {
        super();

        this.device = device;
        this.elements = elements;

        this.quadMaterial = new Material();
        this.quadMaterial.name = 'gsMaterial';
        this.quadMaterial.cull = CULLFACE_NONE;
        this.quadMaterial.blendType = BLEND_NORMAL;
        this.quadMaterial.depthWrite = false;

        this.quadMaterial.shader = createShaderFromCode(this.device, gsVS, gsFS, 'gsShader', {
            vertex_position: SEMANTIC_POSITION,
            splat_center: SEMANTIC_ATTR12,
            splat_color: SEMANTIC_COLOR,
            splat_cova: SEMANTIC_ATTR13,
            splat_covb: SEMANTIC_ATTR14,
            splat_rotation: SEMANTIC_ATTR15,
            splat_scale: SEMANTIC_ATTR11
        });

        this.quadMaterial.update();

        // create the quad mesh
        this.quadMesh = new Mesh(this.device);
        this.quadMesh.setPositions(new Float32Array([
            -1,-1, 0,
             1,-1, 0,
             1, 1, 0,
            -1,-1, 0,
             1, 1, 0,
            -1, 1, 0
        ]), 3);
        this.quadMesh.update();

        // debug rendering
        // this.quadMesh = createBox(this.device, {
        //     halfExtents: new Vec3(1.0, 1.0, 1.0)
        // });
    }

    destroy() {

    }

    instantiateModelEntity(options: any): Entity {
        return null;
    }

    instantiateRenderEntity(options: any): Entity {
        const vertexElement = this.elements.find((element) => element.name === 'vertex');
        if (!vertexElement) {
            return null;
        }

        const find = (name: string) => {
            return vertexElement.properties.find((property: any) => property.name === name && property.storage)?.storage;
        }

        const x = find('x');
        const y = find('y');
        const z = find('z');

        const f_dc_0 = find('f_dc_0');
        const f_dc_1 = find('f_dc_1');
        const f_dc_2 = find('f_dc_2');

        const opacity = find('opacity');

        const scale_0 = find('scale_0');
        const scale_1 = find('scale_1');
        const scale_2 = find('scale_2');

        const rot_0 = find('rot_0');
        const rot_1 = find('rot_1');
        const rot_2 = find('rot_2');
        const rot_3 = find('rot_3');

        if (!x || !y || !z) {
            return null;
        }

        // create particle order map
        const order = [];
        for (let i = 0; i < vertexElement.count; ++i) {
            order[i] = i;
        }
        order.sort((a, b) => {
            return z[a] - z[b];
        });

        // position.xyz, color, cova.xyz, covb.xyz, rotation.xyzw, scale.xyz
        const floatData = new Float32Array(vertexElement.count * 17);
        const uint8Data = new Uint8ClampedArray(floatData.buffer);

        const quat = new Quat();
        const r = [0, 0, 0, 0];
        const s = [0, 0, 0];

        for (let i = 0; i < vertexElement.count; ++i) {
            const j = order[i];

            // mirror the scene in the x and y axis (both positions and rotations)
            x[j] *= -1;
            y[j] *= -1;
            rot_1[j] *= -1;
            rot_2[j] *= -1;

            // positions
            floatData[i * 17 + 0] = x[j];
            floatData[i * 17 + 1] = y[j];
            floatData[i * 17 + 2] = z[j];

            // vertex colors
            if (f_dc_0 && f_dc_1 && f_dc_2) {
                const SH_C0 = 0.28209479177387814;
                uint8Data[i * 68 + 12] = (0.5 + SH_C0 * f_dc_0[j]) * 255;
                uint8Data[i * 68 + 13] = (0.5 + SH_C0 * f_dc_1[j]) * 255;
                uint8Data[i * 68 + 14] = (0.5 + SH_C0 * f_dc_2[j]) * 255;
            }

            // opacity
            if (opacity) {
                const sigmoid = (v: number) => {
                    if (v > 0) {
                        return 1 / (1 + Math.exp(-v));
                    } else {
                        const t = Math.exp(v);
                        return t / (1 + t);
                    } 
                };
                uint8Data[i * 68 + 15] = sigmoid(opacity[j]) * 255;
            } else {
                uint8Data[i * 68 + 15] = 255;
            }

            // calculate covariance a & b
            quat.set(rot_0[j], rot_1[j], rot_2[j], rot_3[j]).normalize();

            r[0] = quat.x;
            r[1] = quat.y;
            r[2] = quat.z;
            r[3] = quat.w;

            s[0] = Math.exp(scale_0[j]);
            s[1] = Math.exp(scale_1[j]);
            s[2] = Math.exp(scale_2[j]);

            const R = [
                1.0 - 2.0 * (r[2] * r[2] + r[3] * r[3]),
                      2.0 * (r[1] * r[2] + r[0] * r[3]),
                      2.0 * (r[1] * r[3] - r[0] * r[2]),

                      2.0 * (r[1] * r[2] - r[0] * r[3]),
                1.0 - 2.0 * (r[1] * r[1] + r[3] * r[3]),
                      2.0 * (r[2] * r[3] + r[0] * r[1]),

                      2.0 * (r[1] * r[3] + r[0] * r[2]),
                      2.0 * (r[2] * r[3] - r[0] * r[1]),
                1.0 - 2.0 * (r[1] * r[1] + r[2] * r[2]),
            ];

            // Compute the matrix product of S and R (M = S * R)
            const M = [
                s[0] * R[0],
                s[0] * R[1],
                s[0] * R[2],
                s[1] * R[3],
                s[1] * R[4],
                s[1] * R[5],
                s[2] * R[6],
                s[2] * R[7],
                s[2] * R[8],
            ];

            // covariance a
            floatData[i * 17 + 4] = M[0] * M[0] + M[3] * M[3] + M[6] * M[6];
            floatData[i * 17 + 5] = M[0] * M[1] + M[3] * M[4] + M[6] * M[7];
            floatData[i * 17 + 6] = M[0] * M[2] + M[3] * M[5] + M[6] * M[8];

            // covariance b
            floatData[i * 17 + 7] = M[1] * M[1] + M[4] * M[4] + M[7] * M[7];
            floatData[i * 17 + 8] = M[1] * M[2] + M[4] * M[5] + M[7] * M[8];
            floatData[i * 17 + 9] = M[2] * M[2] + M[5] * M[5] + M[8] * M[8];

            // rotation
            floatData[i * 17 + 10] = r[0];
            floatData[i * 17 + 11] = r[1];
            floatData[i * 17 + 12] = r[2];
            floatData[i * 17 + 13] = r[3];

            // scale
            floatData[i * 17 + 14] = s[0];
            floatData[i * 17 + 15] = s[1];
            floatData[i * 17 + 16] = s[2];
        }

        const calcAabb = () => {
            // calc aabb
            const minmax = (data: Float32Array) => {
                let min = data[0];
                let max = data[0];
                for (let i = 1; i < data.length; ++i) {
                    min = Math.min(min, data[i]);
                    max = Math.max(max, data[i]);
                }
                return [min, max];
            }
            const xMinMax = minmax(x);
            const yMinMax = minmax(y);
            const zMinMax = minmax(z);

            const aabb = new BoundingBox();
            aabb.setMinMax(new Vec3(xMinMax[0], yMinMax[0], zMinMax[0]), new Vec3(xMinMax[1], yMinMax[1], zMinMax[1]));

            return aabb;
        }

        // create instance data
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR12, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_COLOR, components: 4, type: TYPE_UINT8, normalize: true },
            { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR14, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR15, components: 4, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR11, components: 3, type: TYPE_FLOAT32 }
        ]);
        const vertexBuffer = new VertexBuffer(this.device, vertexFormat, vertexElement.count, BUFFER_DYNAMIC, floatData.buffer);

        const meshInstance = new MeshInstance(this.quadMesh, this.quadMaterial);
        meshInstance.setInstancing(vertexBuffer);

        const result = new Entity('ply');
        result.addComponent('render', {
            type: 'asset',
            meshInstances: [ meshInstance ],
            castShadows: false                  // shadows not supported
        });

        // set custom aabb
        result.render.customAabb = calcAabb();

        // create sort worker
        if (options?.app && options?.camera) {
            const sortWorker = new Worker(URL.createObjectURL(new Blob([`(${SortWorker.toString()})()`], {
                type: 'application/javascript'
            })));

            sortWorker.onmessage = (message: any) => {
                const data = message.data.data;

                // copy data
                const target = new Float32Array(vertexBuffer.lock());
                target.set(new Float32Array(data));
                vertexBuffer.unlock();

                // send the memory buffer back to worker
                sortWorker.postMessage({
                    data: data
                }, [data]);
            };

            // send the initial buffer to worker
            const buf = new ArrayBuffer(vertexBuffer.numBytes);
            new Float32Array(buf).set(new Float32Array(vertexBuffer.lock()));
            vertexBuffer.unlock();

            sortWorker.postMessage({
                data: buf,
                stride: 17
            }, [buf]);

            options.app.on('prerender', () => {
                const t = options.camera.getWorldTransform().data;
                sortWorker.postMessage({
                    cameraPosition: { x: t[12], y: t[13], z: t[14] },
                    cameraDirection: { x: t[8], y: t[9], z: t[10] }
                })
            });
        }

        return result;
    }
};  

// filter out element data we're not going to use
const elements = [
    'x', 'y', 'z',
    'red', 'green', 'blue',
    'opacity',
    'f_dc_0', 'f_dc_1', 'f_dc_2',
    'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3'
];

class PlyContainerParser {
    device: GraphicsDevice;
    assets: AssetRegistry;
    maxRetries: number;

    constructor(device: GraphicsDevice, assets: AssetRegistry, maxRetries: number) {
        this.device = device;
        this.assets = assets;
        this.maxRetries = maxRetries;
    }

    async load(url: any, callback: (err: string, resource: ContainerResource) => void, asset: Asset) {
        const response = await fetch(url.load);
        readPly(response.body.getReader(), new Set(elements))
            .then((response) => {
                callback(null, new PlyContainerResource(this.device, response));
            })
            .catch((err) => {
                callback(err, null);
            });
    }

    open(url: string, data: any, asset: Asset) {
        return data;
    }
}

const registerPlyParser = (app: AppBase) => {
    const containerHandler = app.loader.getHandler('container') as ContainerHandler;
    containerHandler.parsers.ply = new PlyContainerParser(app.graphicsDevice, app.assets, app.loader.maxRetries);
};

export { registerPlyParser };