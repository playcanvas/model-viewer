import {
    AppBase,
    AssetRegistry,
    BoundingBox,
    BUFFER_DYNAMIC,
    ContainerHandler,
    ContainerResource,
    createShaderFromCode,
    createBox,
    CULLFACE_NONE,
    CULLFACE_BACK,
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

// set true to render splats as oriented boxes
const debugRender = false;

const gsVS = /* glsl_ */ `
attribute vec2 vertex_position;
attribute vec3 splat_center;
attribute vec4 splat_color;
attribute vec3 splat_cova;
attribute vec3 splat_covb;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;

uniform vec2 viewport;
uniform vec2 focal;

varying vec2 texCoord;
varying vec4 color;

void main(void)
{
    vec4 splat_cam = matrix_view * matrix_model * vec4(splat_center, 1.0);
    vec4 splat_proj = matrix_projection * splat_cam;

    // cull behind camera
    if (splat_proj.z < -splat_proj.w) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

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

    gl_Position = splat_proj +
        vec4((vertex_position.x * v1 + vertex_position.y * v2) / viewport * 8.0,
             0.0, 0.0) * splat_proj.w;

    texCoord = vertex_position * 2.0;
    color = splat_color;
}
`;

const gsFS = /* glsl_ */ `
varying vec2 texCoord;
varying vec4 color;

void main(void)
{
    float A = -dot(texCoord, texCoord);
    if (A < -4.0) discard;
    float B = exp(A) * color.a;
    gl_FragColor = vec4(color.rgb, B);
}
`;

const gsDebugVS = /* glsl_ */ `
attribute vec3 vertex_position;
attribute vec3 splat_center;
attribute vec4 splat_color;
attribute vec4 splat_rotation;
attribute vec3 splat_scale;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

varying vec4 color;

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

void main(void)
{
    vec3 local = quatToMat3(splat_rotation) * (vertex_position * splat_scale * 2.0) + splat_center;
    gl_Position = matrix_viewProjection * matrix_model * vec4(local, 1.0);
    color = splat_color;
}
`;

const gsDebugFS = /* glsl_ */ `
varying vec4 color;

void main(void)
{
    gl_FragColor = color;
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
        this.quadMaterial.cull = debugRender ? CULLFACE_BACK : CULLFACE_NONE;
        this.quadMaterial.blendType = BLEND_NORMAL;
        this.quadMaterial.depthWrite = false;

        this.quadMaterial.shader = createShaderFromCode(this.device, debugRender ? gsDebugVS : gsVS, debugRender ? gsDebugFS : gsFS, 'gsShader', {
            vertex_position: SEMANTIC_POSITION,
            splat_center: SEMANTIC_ATTR11,
            splat_color: SEMANTIC_COLOR,
            ...debugRender ? {
                splat_rotation: SEMANTIC_ATTR12,
                splat_scale: SEMANTIC_ATTR13
            } : {
                splat_cova: SEMANTIC_ATTR12,
                splat_covb: SEMANTIC_ATTR13
            }
        });

        this.quadMaterial.update();

        if (debugRender) {
            this.quadMesh = createBox(this.device, {
                halfExtents: new Vec3(1.0, 1.0, 1.0)
            });
        } else {
            this.quadMesh = new Mesh(this.device);
            this.quadMesh.setPositions(new Float32Array([
                -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1
            ]), 2);
            this.quadMesh.update();
        }
    }

    destroy() {

    }

    instantiateModelEntity(/* options: any */): Entity {
        return null;
    }

    instantiateRenderEntity(options: any): Entity {
        const vertexElement = this.elements.find(element => element.name === 'vertex');
        if (!vertexElement) {
            return null;
        }

        const find = (name: string) => {
            return vertexElement.properties.find((property: any) => property.name === name && property.storage)?.storage;
        };

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

        const stride = 4 + (debugRender ? 7 : 6);

        // position.xyz, color, cova.xyz, covb.xyz, rotation.xyzw, scale.xyz
        const floatData = new Float32Array(vertexElement.count * stride);
        const uint8Data = new Uint8ClampedArray(floatData.buffer);

        const quat = new Quat();
        const r = [0, 0, 0, 0];
        const s = [0, 0, 0];

        for (let i = 0; i < vertexElement.count; ++i) {
            const j = i;

            // mirror the scene in the x and y axis (both positions and rotations)
            x[j] *= -1;
            y[j] *= -1;
            rot_1[j] *= -1;
            rot_2[j] *= -1;

            // positions
            floatData[i * stride + 0] = x[j];
            floatData[i * stride + 1] = y[j];
            floatData[i * stride + 2] = z[j];

            // vertex colors
            if (f_dc_0 && f_dc_1 && f_dc_2) {
                const SH_C0 = 0.28209479177387814;
                uint8Data[i * stride * 4 + 12] = (0.5 + SH_C0 * f_dc_0[j]) * 255;
                uint8Data[i * stride * 4 + 13] = (0.5 + SH_C0 * f_dc_1[j]) * 255;
                uint8Data[i * stride * 4 + 14] = (0.5 + SH_C0 * f_dc_2[j]) * 255;
            }

            // opacity
            if (opacity) {
                const sigmoid = (v: number) => {
                    if (v > 0) {
                        return 1 / (1 + Math.exp(-v));
                    }

                    const t = Math.exp(v);
                    return t / (1 + t);
                };
                uint8Data[i * stride * 4 + 15] = sigmoid(opacity[j]) * 255;
            } else {
                uint8Data[i * stride * 4 + 15] = 255;
            }

            quat.set(rot_0[j], rot_1[j], rot_2[j], rot_3[j]).normalize();

            r[0] = quat.x;
            r[1] = quat.y;
            r[2] = quat.z;
            r[3] = quat.w;

            s[0] = Math.exp(scale_0[j]);
            s[1] = Math.exp(scale_1[j]);
            s[2] = Math.exp(scale_2[j]);

            if (debugRender) {
                // rotation
                floatData[i * stride + 4] = r[0];
                floatData[i * stride + 5] = r[1];
                floatData[i * stride + 6] = r[2];
                floatData[i * stride + 7] = r[3];

                // scale
                floatData[i * stride + 8] = s[0];
                floatData[i * stride + 9] = s[1];
                floatData[i * stride + 10] = s[2];
            } else {
                // pre-calculate covariance a & b
                const R = [
                    1.0 - 2.0 * (r[2] * r[2] + r[3] * r[3]),
                    2.0 * (r[1] * r[2] + r[0] * r[3]),
                    2.0 * (r[1] * r[3] - r[0] * r[2]),

                    2.0 * (r[1] * r[2] - r[0] * r[3]),
                    1.0 - 2.0 * (r[1] * r[1] + r[3] * r[3]),
                    2.0 * (r[2] * r[3] + r[0] * r[1]),

                    2.0 * (r[1] * r[3] + r[0] * r[2]),
                    2.0 * (r[2] * r[3] - r[0] * r[1]),
                    1.0 - 2.0 * (r[1] * r[1] + r[2] * r[2])
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
                    s[2] * R[8]
                ];

                // covariance a
                floatData[i * stride + 4] = M[0] * M[0] + M[3] * M[3] + M[6] * M[6];
                floatData[i * stride + 5] = M[0] * M[1] + M[3] * M[4] + M[6] * M[7];
                floatData[i * stride + 6] = M[0] * M[2] + M[3] * M[5] + M[6] * M[8];

                // covariance b
                floatData[i * stride + 7] = M[1] * M[1] + M[4] * M[4] + M[7] * M[7];
                floatData[i * stride + 8] = M[1] * M[2] + M[4] * M[5] + M[7] * M[8];
                floatData[i * stride + 9] = M[2] * M[2] + M[5] * M[5] + M[8] * M[8];
            }
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
            };
            const xMinMax = minmax(x);
            const yMinMax = minmax(y);
            const zMinMax = minmax(z);

            const aabb = new BoundingBox();
            aabb.setMinMax(new Vec3(xMinMax[0], yMinMax[0], zMinMax[0]), new Vec3(xMinMax[1], yMinMax[1], zMinMax[1]));

            return aabb;
        };

        // create instance data
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR11, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_COLOR, components: 4, type: TYPE_UINT8, normalize: true }
        ].concat(debugRender ? [
            { semantic: SEMANTIC_ATTR12, components: 4, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 }
        ] : [
            { semantic: SEMANTIC_ATTR12, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 }
        ]));
        const vertexBuffer = new VertexBuffer(this.device, vertexFormat, vertexElement.count, BUFFER_DYNAMIC, floatData.buffer);

        const meshInstance = new MeshInstance(this.quadMesh, this.quadMaterial);
        meshInstance.setInstancing(vertexBuffer);

        const result = new Entity('ply');
        result.addComponent('render', {
            type: 'asset',
            meshInstances: [meshInstance],
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

                // let caller know the view changed
                options?.onChanged();
            };

            // send the initial buffer to worker
            const buf = new ArrayBuffer(vertexBuffer.numBytes);
            new Float32Array(buf).set(new Float32Array(vertexBuffer.lock()));
            vertexBuffer.unlock();

            sortWorker.postMessage({
                data: buf,
                stride: stride
            }, [buf]);

            options.app.on('prerender', () => {
                const t = options.camera.getWorldTransform().data;
                sortWorker.postMessage({
                    cameraPosition: { x: t[12], y: t[13], z: t[14] },
                    cameraDirection: { x: t[8], y: t[9], z: t[10] }
                });

                const focal = [1164.6601287484507, 1159.5880733038064];

                this.quadMaterial.setParameter('viewport', [this.device.width, this.device.height]);
                this.quadMaterial.setParameter('focal', [focal[0], focal[1]]);
            });
        }

        return result;
    }
}

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

    async load(url: any, callback: (err: string, resource: ContainerResource) => void) {
        const response = await fetch(url.load);
        readPly(response.body.getReader(), new Set(elements))
            .then((response) => {
                callback(null, new PlyContainerResource(this.device, response));
            })
            .catch((err) => {
                callback(err, null);
            });
    }

    open(url: string, data: any) {
        return data;
    }
}

const registerPlyParser = (app: AppBase) => {
    const containerHandler = app.loader.getHandler('container') as ContainerHandler;
    containerHandler.parsers.ply = new PlyContainerParser(app.graphicsDevice, app.assets, app.loader.maxRetries);
};

export { registerPlyParser };
