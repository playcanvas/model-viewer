import {
    AppBase,
    BoundingBox,
    BUFFER_DYNAMIC,
    Color,
    ContainerResource,
    createShaderFromCode,
    createBox,
    CULLFACE_NONE,
    CULLFACE_BACK,
    Entity,
    GraphicsDevice,
    Mat4,
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

import { PlyElement } from './ply-reader';
import { SortWorker } from './sort-worker';

// set true to render splats as oriented boxes
const debugRender = false;

const quatToMat3 = `
mat3 quatToMat3(vec3 R)
{
    float x = R.x;
    float y = R.y;
    float z = R.z;
    float w = sqrt(1.0 - dot(R, R));

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
`;

const splatVS = /* glsl_ */ `
attribute vec2 vertex_position;
attribute vec3 splat_center;
attribute vec4 splat_color;
attribute vec3 splat_rotation;
attribute vec3 splat_scale;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;

uniform vec2 viewport;

varying vec2 texCoord;
varying vec4 color;

${quatToMat3}

void computeCov3d(in vec3 rot, in vec3 scale, out vec3 covA, out vec3 covB)
{
    mat3 R = quatToMat3(rot);

    // M = S * R
    float M[9] = float[9](
        scale.x * R[0][0],
        scale.x * R[0][1],
        scale.x * R[0][2],
        scale.y * R[1][0],
        scale.y * R[1][1],
        scale.y * R[1][2],
        scale.z * R[2][0],
        scale.z * R[2][1],
        scale.z * R[2][2]
    );

    covA = vec3(
        M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
        M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
        M[0] * M[2] + M[3] * M[5] + M[6] * M[8]
    );

    covB = vec3(
        M[1] * M[1] + M[4] * M[4] + M[7] * M[7],
        M[1] * M[2] + M[4] * M[5] + M[7] * M[8],
        M[2] * M[2] + M[5] * M[5] + M[8] * M[8]
    );
}

void main(void)
{
    vec4 splat_cam = matrix_view * matrix_model * vec4(splat_center, 1.0);
    vec4 splat_proj = matrix_projection * splat_cam;

    // cull behind camera
    if (splat_proj.z < -splat_proj.w) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    vec3 splat_cova;
    vec3 splat_covb;
    computeCov3d(splat_rotation, splat_scale, splat_cova, splat_covb);

    mat3 Vrk = mat3(
        splat_cova.x, splat_cova.y, splat_cova.z, 
        splat_cova.y, splat_covb.x, splat_covb.y,
        splat_cova.z, splat_covb.y, splat_covb.z
    );

    float focal = viewport.x * matrix_projection[0][0];

    mat3 J = mat3(
        focal / splat_cam.z, 0., -(focal * splat_cam.x) / (splat_cam.z * splat_cam.z), 
        0., focal / splat_cam.z, -(focal * splat_cam.y) / (splat_cam.z * splat_cam.z), 
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
        vec4((vertex_position.x * v1 + vertex_position.y * v2) / viewport * 2.0,
             0.0, 0.0) * splat_proj.w;

    texCoord = vertex_position * 2.0;
    color = splat_color;
}
`;

const splatFS = /* glsl_ */ `
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

const splatDebugVS = /* glsl_ */ `
attribute vec3 vertex_position;
attribute vec3 splat_center;
attribute vec4 splat_color;
attribute vec3 splat_rotation;
attribute vec3 splat_scale;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

varying vec4 color;

${quatToMat3}

void main(void)
{
    vec3 local = quatToMat3(splat_rotation) * (vertex_position * splat_scale * 2.0) + splat_center;
    gl_Position = matrix_viewProjection * matrix_model * vec4(local, 1.0);
    color = splat_color;
}
`;

const splatDebugFS = /* glsl_ */ `
varying vec4 color;

void main(void)
{
    if (color.a < 0.2) discard;
    gl_FragColor = color;
}
`;

const vec3 = new Vec3();
const mat4 = new Mat4();
const aabb = new BoundingBox();

const debugPoints = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()];
const debugLines = [
    debugPoints[0], debugPoints[1], debugPoints[1], debugPoints[3], debugPoints[3], debugPoints[2], debugPoints[2], debugPoints[0],
    debugPoints[4], debugPoints[5], debugPoints[5], debugPoints[7], debugPoints[7], debugPoints[6], debugPoints[6], debugPoints[4],
    debugPoints[0], debugPoints[4], debugPoints[1], debugPoints[5], debugPoints[2], debugPoints[6], debugPoints[3], debugPoints[7]
];
const debugColor = new Color(1, 1, 0, 0.4);

const getSplatMat = (result: Mat4, data: Float32Array) => {
    const px = data[0];
    const py = data[1];
    const pz = data[2];
    const x = data[4];
    const y = data[5];
    const z = data[6];
    const w = Math.sqrt(1 - (x * x + y * y + z * z));

    // build rotation matrix
    result.data.set([
        1.0 - 2.0 * (z * z + w * w),
        2.0 * (y * z + x * w),
        2.0 * (y * w - x * z),
        0,

        2.0 * (y * z - x * w),
        1.0 - 2.0 * (y * y + w * w),
        2.0 * (z * w + x * y),
        0,

        2.0 * (y * w + x * z),
        2.0 * (z * w - x * y),
        1.0 - 2.0 * (y * y + z * z),
        0,

        px, py, pz, 1
    ]);
};

const getSplatAabb = (result: BoundingBox, data: Float32Array) => {
    getSplatMat(mat4, data);
    aabb.center.set(0, 0, 0);
    aabb.halfExtents.set(data[7] * 2, data[8] * 2, data[9] * 2);
    result.setFromTransformedAabb(aabb, mat4);
};

const renderDebugSplat = (app: AppBase, worldMat: Mat4, data: Float32Array) => {
    getSplatMat(mat4, data);
    mat4.mul2(worldMat, mat4);

    const sx = data[7];
    const sy = data[8];
    const sz = data[9];

    for (let i = 0; i < 8; ++i) {
        vec3.set(
            sx * 2 * ((i & 1) ? 1 : -1),
            sy * 2 * ((i & 2) ? 1 : -1),
            sz * 2 * ((i & 4) ? 1 : -1)
        )
        mat4.transformPoint(vec3, debugPoints[i]);
    }

    app.drawLines(debugLines, debugColor);
};

class SplatResource extends ContainerResource {
    device: GraphicsDevice;
    elements: PlyElement[];

    quadMaterial: Material;
    quadMesh: Mesh;

    focalPoint = new Vec3();
    entity: Entity;

    renders: RenderComponent[] = [];
    meshes: Mesh[] = [];
    materials: Material[] = [];
    textures: Texture[] = [];

    constructor(device: GraphicsDevice, elements: PlyElement[]) {
        super();

        this.device = device;
        this.elements = elements;

        this.quadMaterial = new Material();
        this.quadMaterial.name = 'splatMaterial';
        this.quadMaterial.cull = debugRender ? CULLFACE_BACK : CULLFACE_NONE;
        this.quadMaterial.blendType = BLEND_NORMAL;
        this.quadMaterial.depthWrite = false;

        const vs = debugRender ? splatDebugVS : splatVS;
        const fs = debugRender ? splatDebugFS : splatFS;

        this.quadMaterial.shader = createShaderFromCode(this.device, vs, fs, 'splatShader', {
            vertex_position: SEMANTIC_POSITION,
            splat_center: SEMANTIC_ATTR11,
            splat_color: SEMANTIC_COLOR,
            splat_rotation: SEMANTIC_ATTR12,
            splat_scale: SEMANTIC_ATTR13
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

        const stride = 10;

        // position.xyz, color, rotation.xyz, scale.xyz
        const floatData = new Float32Array(vertexElement.count * stride);
        const uint8Data = new Uint8ClampedArray(floatData.buffer);

        const quat = new Quat();

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

            // rotation
            if (quat.w < 0) {
                floatData[i * stride + 4] = -quat.x;
                floatData[i * stride + 5] = -quat.y;
                floatData[i * stride + 6] = -quat.z;
            } else {
                floatData[i * stride + 4] = quat.x;
                floatData[i * stride + 5] = quat.y;
                floatData[i * stride + 6] = quat.z;
            }

            // scale
            floatData[i * stride + 7] = Math.exp(scale_0[j]);
            floatData[i * stride + 8] = Math.exp(scale_1[j]);
            floatData[i * stride + 9] = Math.exp(scale_2[j]);
        }

        // create instance data
        const vertexFormat = new VertexFormat(this.device, [
            { semantic: SEMANTIC_ATTR11, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_COLOR, components: 4, type: TYPE_UINT8, normalize: true },
            { semantic: SEMANTIC_ATTR12, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_ATTR13, components: 3, type: TYPE_FLOAT32 }
        ]);
        const vertexBuffer = new VertexBuffer(this.device, vertexFormat, vertexElement.count, BUFFER_DYNAMIC, floatData.buffer);

        const meshInstance = new MeshInstance(this.quadMesh, this.quadMaterial);
        meshInstance.setInstancing(vertexBuffer);

        const result = new Entity('ply');
        result.addComponent('render', {
            type: 'asset',
            meshInstances: [meshInstance],
            castShadows: false                  // shadows not supported
        });

        // calculate scene aabb taking into account splat size
        const calcAabb = (aabb: BoundingBox) => {
            // initialize aabb
            aabb.center.set(floatData[0], floatData[1], floatData[2]);
            aabb.halfExtents.set(0, 0, 0);

            const splat = new Float32Array(stride);
            const tmpAabb = new BoundingBox();
            for (let i = 0; i < vertexElement.count; ++i) {
                for (let j = 0; j < stride; ++j) {
                    splat[j] = floatData[i * stride + j];
                }
                getSplatAabb(tmpAabb, splat);
                aabb.add(tmpAabb);
            }
        }

        // set custom aabb
        const aabb = new BoundingBox();
        calcAabb(aabb);
        result.render.customAabb = aabb;

        // create sort worker
        if (options?.app && options?.camera) {
            const sortWorker = new Worker(URL.createObjectURL(new Blob([`(${SortWorker.toString()})()`], {
                type: 'application/javascript'
            })));

            sortWorker.onmessage = (message: any) => {
                const data = message.data.data;

                // copy source data
                floatData.set(new Float32Array(data));

                // send the memory buffer back to worker
                sortWorker.postMessage({
                    data: data
                }, [data]);

                // upload new data to GPU
                vertexBuffer.unlock();

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

            const viewport = [ this.device.width, this.device.height ];

            options.app.on('prerender', () => {
                const t = options.camera.getWorldTransform().data;
                sortWorker.postMessage({
                    cameraPosition: { x: t[12], y: t[13], z: t[14] },
                    cameraDirection: { x: t[8], y: t[9], z: t[10] }
                });

                viewport[0] = this.device.width;
                viewport[1] = this.device.height;
                this.quadMaterial.setParameter('viewport', viewport);

                // debug render splat bounds
                // const modelMat = result.getWorldTransform();
                // const splat = new Float32Array(stride);
                // for (let i = 0; i < vertexElement.count; ++i) {
                //     for (let j = 0; j < stride; ++j) {
                //         splat[j] = floatData[i * stride + j];
                //     }
                //     renderDebugSplat(options.app, modelMat, splat);
                // }
            });
        }

        // calculate focal point
        const calcFocalPoint = (result: Vec3) => {
            let sum = 0;
            for (let i = 0; i < vertexElement.count; ++i) {
                const weight = 1.0 / (1.0 + Math.exp(Math.max(scale_0[i], scale_1[i], scale_2[i])));
                result.x += x[i] * weight;
                result.y += y[i] * weight;
                result.z += z[i] * weight;
                sum += weight;
            }
            result.mulScalar(1 / sum);
        };
        calcFocalPoint(this.focalPoint);

        this.entity = result;

        return result;
    }

    getFocalPoint(): Vec3 {
        return this.entity.getWorldTransform().transformPoint(this.focalPoint);
    }
}

export { SplatResource };
