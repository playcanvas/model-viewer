
import {
    BLEND_PREMULTIPLIED,
    SEMANTIC_POSITION,
    createShaderFromCode,
    Entity,
    Material,
    Mesh,
    Vec3,
    GraphicsDevice,
    MeshInstance
} from 'playcanvas';

const planeEpsilon = 1e-3;
const traceBounces = 3;

const vshader = `
attribute vec3 vertex_position;

uniform mat4 matrix_viewProjection;
uniform mat4 matrix_model;
uniform mat4 matrix_model_inverse;

uniform vec3 view_position;
varying vec3 view_pos;
varying vec3 view_dir;

void main(void) {
    vec4 p = vec4(vertex_position, 1.0);
    vec4 v = vec4(view_position, 1.0);
    gl_Position = matrix_viewProjection * matrix_model * p;
    view_pos = (matrix_model_inverse * v).xyz;
    view_dir = p.xyz - view_pos;
}
`;

const fshader = `
precision mediump float;

const int numPlanes = $NUM_PLANES;
uniform vec4 planes[numPlanes];

void intersectFrontFaces(out vec3 ipos, out vec3 inormal, vec3 pos, vec3 dir) {
    float t = 0.0;
    for (int i = 0; i < numPlanes; ++i) {
        vec4 plane = planes[i];
        float d = dot(dir, plane.xyz);
        if (d < 0.0) {
            float n = -(dot(pos, plane.xyz) + plane.w) / d;
            if (n > t) {
                t = n;
                inormal = plane.xyz;
            }
        }
    }
    ipos = pos + dir * t;
}

void intersectBackFaces(out vec3 ipos, out vec3 inormal, vec3 pos, vec3 dir) {
    float t = 1000.0;
    for (int i = 0; i < numPlanes; ++i) {
        vec4 plane = planes[i];
        float d = dot(dir, plane.xyz);
        if (d > 0.0) {
            float n = -(dot(pos, plane.xyz) + plane.w) / d;
            if (n < t) {
                t = n;
                inormal = -plane.xyz;
            }
        }
    }
    ipos = pos + dir * t;
}

vec3 decodeRGBM(vec4 raw) {
    vec3 color = (8.0 * raw.a) * raw.rgb;
    return color * color;
}

vec3 gammaCorrectOutput(vec3 color) {
    return pow(color + 0.0000001, vec3(1.0 / 2.2));
}

float calcFresnel(vec3 i, vec3 n) {
    return pow(1.0 - clamp(dot(n, i), 0.0, 1.0), 4.0);
}

uniform samplerCube texture_cubeMap;
vec3 sampleEnv(vec3 dir) {
    vec4 raw = textureCubeLodEXT(texture_cubeMap, dir * vec3(-1.0, 1.0, 1.0), 10.0);
    return decodeRGBM(raw);
}

void writeFinalOutput(vec3 color) {
    gl_FragColor = vec4(gammaCorrectOutput(color), 1.0);
}

vec3 traceInternal(vec3 pos, vec3 dir, int numBounces, float ri) {
    vec3 result = vec3(0.0);
    float t = 1.0;
    vec3 p, n;
    for (int i = 0; i < numBounces; ++i) {
        intersectBackFaces(p, n, pos, dir);

        // external refraction
        vec3 f = refract(dir, n, ri);

        if (f != vec3(0.0)) {
            float fresnel = calcFresnel(-dir, n);
            result += sampleEnv(f) * (1.0 - fresnel) * t;
            t *= fresnel;
        }

        pos = p;
        dir = reflect(dir, n);
    }

    result += sampleEnv(dir) * t;

    return result;
}

const float airRI = 1.0;
const vec3 diamondRI = vec3(2.410, 2.420, 2.435);

varying vec3 view_pos;
varying vec3 view_dir;

void main(void) {
    vec3 cameraPos = view_pos;
    vec3 cameraDir = normalize(view_dir);

    // camera to diamond intersection
    vec3 p, n;
    intersectFrontFaces(p, n, cameraPos, cameraDir);

    // internal refraction for r, g, b
    // vec3 f = refract(cameraDir, n, airRI / diamondRI.x);
    // vec3 refraction = traceInternal(p, f, ${traceBounces}, diamondRI.x);

    // refract r, g, b separately
    vec3 refraction = vec3(
        traceInternal(p, refract(cameraDir, n, airRI / diamondRI.x), ${traceBounces}, diamondRI.x).x,
        traceInternal(p, refract(cameraDir, n, airRI / diamondRI.y), ${traceBounces}, diamondRI.y).y,
        traceInternal(p, refract(cameraDir, n, airRI / diamondRI.z), ${traceBounces}, diamondRI.z).z
    );

    // external reflection
    vec3 r = reflect(cameraDir, n);

    float fresnel = calcFresnel(-cameraDir, n);

    vec3 color = mix(refraction, sampleEnv(r), fresnel);

    writeFinalOutput(color);
}
`;

const normal = new Vec3();
const pa = new Vec3();
const pb = new Vec3();
const pc = new Vec3();

class Gem {
    positions: Float32Array;
    indices: number[];
    planes: number[];

    constructor(positions: Float32Array, indices: number[], planes: number[]) {
        this.positions = positions;
        this.indices = indices;
        this.planes = planes;
    }

    instantiate(device: GraphicsDevice) {
        const processedFshader = fshader.replace('$NUM_PLANES', `${this.planes.length / 4}`);
        const material = new Material();
        material.blendType = BLEND_PREMULTIPLIED;
        material.shader = createShaderFromCode(device, vshader, processedFshader, 'gem', {
            vertex_position: SEMANTIC_POSITION,
        });

        const mesh = new Mesh(device);
        mesh.setPositions(this.positions);
        mesh.setIndices(this.indices);
        mesh.update();

        // create box geometry around the gem
        const meshInstance = new MeshInstance(mesh, material);

        const entity = new Entity();
        entity.addComponent('render', {
            type: 'asset',
            material: material,
            meshInstances: [meshInstance]
        });

        const transform = entity.getWorldTransform().clone().invert();
        material.setParameter('matrix_model_inverse', transform.data);
        material.setParameter('planes[0]', this.planes);

        return entity;
    }

    static createFromMesh(mesh: Mesh) {
        const positions = new Float32Array(mesh.vertexBuffer.numVertices * 3);
        mesh.getPositions(positions);

        const indices: number[] = [];
        mesh.getIndices(indices);

        const planes: number[] = [];

        for (let i = 0; i < indices.length / 3; ++i) {
            const a = indices[i * 3 + 0];
            const b = indices[i * 3 + 1];
            const c = indices[i * 3 + 2];

            pa.set(positions[a * 3 + 0], positions[a * 3 + 1], positions[a * 3 + 2]);
            pb.set(positions[b * 3 + 0], positions[b * 3 + 1], positions[b * 3 + 2]);
            pc.set(positions[c * 3 + 0], positions[c * 3 + 1], positions[c * 3 + 2]);

            // calculate plane
            pb.sub(pa);
            pc.sub(pa);
            normal.cross(pb, pc).normalize();

            const d = -normal.dot(pa);

            // check the plane doesn't already exist
            const epsilon = 1e-03;
            let j;
            for (j = 0; j < planes.length / 4; ++j) {
                if (Math.abs(normal.x - planes[j * 4 + 0]) < planeEpsilon &&
                    Math.abs(normal.y - planes[j * 4 + 1]) < planeEpsilon &&
                    Math.abs(normal.z - planes[j * 4 + 2]) < planeEpsilon &&
                    Math.abs(d - planes[j * 4 + 3]) < planeEpsilon) {
                    break;
                }
            }

            if (j === planes.length / 4) {
                planes.push(normal.x, normal.y, normal.z, d);
            }
        }

        console.log(planes.length / 4);

        return new Gem(positions, indices, planes);
    }
}

export { Gem };
