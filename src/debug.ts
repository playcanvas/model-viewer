import * as pc from 'playcanvas';

let debugLayerFront: pc.Layer = null;
let debugLayerBack: pc.Layer = null;

const v0 = new pc.Vec3();
const v1 = new pc.Vec3();
const v2 = new pc.Vec3();
const up = new pc.Vec3(0, 1, 0);
const mat = new pc.Mat4();
const unitBone = [
    [[0,    0,   0], [-0.5, 0, 0.3]],
    [[0,    0,   0], [0.5,  0, 0.3]],
    [[0,    0,   0], [0, -0.5, 0.3]],
    [[0,    0,   0], [0,  0.5, 0.3]],
    [[0,    0,   1], [-0.5, 0, 0.3]],
    [[0,    0,   1], [0.5,  0, 0.3]],
    [[0,    0,   1], [0, -0.5, 0.3]],
    [[0,    0,   1], [0,  0.5, 0.3]],
    [[0, -0.5, 0.3], [0.5,  0, 0.3]],
    [[0.5,  0, 0.3], [0,  0.5, 0.3]],
    [[0,  0.5, 0.3], [-0.5, 0, 0.3]],
    [[-0.5, 0, 0.3], [0, -0.5, 0.3]]
];

const vshader = `
attribute vec3 vertex_position;
attribute vec4 vertex_color;

varying vec4 vColor;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

void main(void) {
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    vColor = vertex_color;
}`;

const fshader = `
precision highp float;

varying vec4 vColor;

uniform vec4 uColor;

void main(void) {
    gl_FragColor = vColor * uColor;
}`;

const linesShaderDefinition = {
    attributes: {
        vertex_position: pc.SEMANTIC_POSITION,
        vertex_color: pc.SEMANTIC_COLOR
    },
    vshader: vshader,
    fshader: fshader
};

class DebugLines {
    app: pc.Application;
    mesh: pc.Mesh;
    meshInstances: pc.MeshInstance[];
    vertexFormat: pc.VertexFormat;
    vertexCursor: number;
    vertexData: Float32Array;
    colorData: Uint32Array;

    constructor(app: pc.Application, camera: pc.Entity, backLayer = true) {
        const device = app.graphicsDevice as pc.WebglGraphicsDevice;

        if (!debugLayerFront) {
            // construct the debug layer
            debugLayerBack = new pc.Layer({
                enabled: true,
                name: 'Debug Layer Behind',
                opaqueSortMode: pc.SORTMODE_NONE,
                transparentSortMode: pc.SORTMODE_NONE,
                passThrough: true,
                overrideClear: true,
                onDrawCall: (drawCall: any, index: number) => {
                    device.setDepthFunc(pc.FUNC_GREATER);
                }
            });

            debugLayerFront = new pc.Layer({
                enabled: true,
                name: 'Debug Layer',
                opaqueSortMode: pc.SORTMODE_NONE,
                transparentSortMode: pc.SORTMODE_NONE,
                passThrough: true,
                overrideClear: true
            });

            app.scene.layers.pushTransparent(debugLayerBack);
            app.scene.layers.pushTransparent(debugLayerFront);
            camera.camera.layers = camera.camera.layers.concat([debugLayerBack.id, debugLayerFront.id]);
        }

        const vertexFormat = new pc.VertexFormat(device, [
            { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 },
            { semantic: pc.SEMANTIC_COLOR, components: 4, type: pc.TYPE_UINT8, normalize: true }
        ]);

        // construct the mesh
        const mesh = new pc.Mesh();
        mesh.vertexBuffer = new pc.VertexBuffer(device, vertexFormat, 8192, pc.BUFFER_DYNAMIC);
        mesh.primitive[0].type = pc.PRIMITIVE_LINES;
        mesh.primitive[0].base = 0;
        mesh.primitive[0].indexed = false;
        mesh.primitive[0].count = 0;

        const frontMaterial = new pc.Material();
        frontMaterial.shader = new pc.Shader(device, linesShaderDefinition);
        frontMaterial.setParameter('uColor', [1, 1, 1, 0.7]);
        frontMaterial.blendType = pc.BLEND_NORMAL;
        frontMaterial.update();

        const frontInstance = new pc.MeshInstance(mesh, frontMaterial, new pc.GraphNode());
        frontInstance.cull = false;
        frontInstance.visible = false;

        debugLayerFront.addMeshInstances([frontInstance], true);

        this.meshInstances = [frontInstance];

        // construct back
        if (backLayer) {
            const backMaterial = new pc.Material();
            backMaterial.shader = new pc.Shader(device, linesShaderDefinition);
            backMaterial.setParameter('uColor', [0.5, 0.5, 0.5, 0.5]);
            backMaterial.blendType = pc.BLEND_NORMAL;
            backMaterial.depthTest = true;
            backMaterial.depthWrite = false;
            backMaterial.update();

            const backInstance = new pc.MeshInstance(mesh, backMaterial, new pc.GraphNode());
            backInstance.cull = false;
            backInstance.visible = false;

            debugLayerBack.addMeshInstances([backInstance], true);

            this.meshInstances.push(backInstance);
        }

        this.app = app;
        this.mesh = mesh;

        this.vertexFormat = vertexFormat;
        this.vertexCursor = 0;
        this.vertexData = new Float32Array(this.mesh.vertexBuffer.lock());
        this.colorData = new Uint32Array(this.mesh.vertexBuffer.lock());
    }

    private static matrixMad(result: pc.Mat4, mat: pc.Mat4, factor: number) {
        if (factor > 0) {
            for (let i = 0; i < 16; ++i) {
                result.data[i] += mat.data[i] * factor;
            }
        }
    }

    clear(): void {
        this.vertexCursor = 0;
    }

    box(min: pc.Vec3, max: pc.Vec3): void {
        this.line(new pc.Vec3(min.x, min.y, min.z), new pc.Vec3(max.x, min.y, min.z));
        this.line(new pc.Vec3(max.x, min.y, min.z), new pc.Vec3(max.x, min.y, max.z));
        this.line(new pc.Vec3(max.x, min.y, max.z), new pc.Vec3(min.x, min.y, max.z));
        this.line(new pc.Vec3(min.x, min.y, max.z), new pc.Vec3(min.x, min.y, min.z));

        this.line(new pc.Vec3(min.x, max.y, min.z), new pc.Vec3(max.x, max.y, min.z));
        this.line(new pc.Vec3(max.x, max.y, min.z), new pc.Vec3(max.x, max.y, max.z));
        this.line(new pc.Vec3(max.x, max.y, max.z), new pc.Vec3(min.x, max.y, max.z));
        this.line(new pc.Vec3(min.x, max.y, max.z), new pc.Vec3(min.x, max.y, min.z));

        this.line(new pc.Vec3(min.x, min.y, min.z), new pc.Vec3(min.x, max.y, min.z));
        this.line(new pc.Vec3(max.x, min.y, min.z), new pc.Vec3(max.x, max.y, min.z));
        this.line(new pc.Vec3(max.x, min.y, max.z), new pc.Vec3(max.x, max.y, max.z));
        this.line(new pc.Vec3(min.x, min.y, max.z), new pc.Vec3(min.x, max.y, max.z));
    }

    line(v0: pc.Vec3, v1: pc.Vec3, clr = 0xffffffff): void {
        if (this.vertexCursor >= this.vertexData.length / 8) {
            const oldVBuffer = this.mesh.vertexBuffer;
            const byteSize = oldVBuffer.lock().byteLength * 2;
            const arrayBuffer = new ArrayBuffer(byteSize);

            this.mesh.vertexBuffer = new pc.VertexBuffer(
                this.app.graphicsDevice,
                oldVBuffer.getFormat(),
                oldVBuffer.getNumVertices() * 2,
                pc.BUFFER_DYNAMIC,
                arrayBuffer
            );
            this.vertexData = new Float32Array(arrayBuffer);
            this.colorData = new Uint32Array(arrayBuffer);

            this.colorData.set(new Uint32Array(oldVBuffer.lock()));
        }

        const vertex = this.vertexCursor;
        const vertexData = this.vertexData;
        const colorData = this.colorData;
        vertexData[vertex * 8 + 0] = v0.x;
        vertexData[vertex * 8 + 1] = v0.y;
        vertexData[vertex * 8 + 2] = v0.z;
        colorData[vertex * 8 + 3] = clr;
        vertexData[vertex * 8 + 4] = v1.x;
        vertexData[vertex * 8 + 5] = v1.y;
        vertexData[vertex * 8 + 6] = v1.z;
        colorData[vertex * 8 + 7] = clr;
        this.vertexCursor++;
    }

    generateNormals(vertexBuffer: pc.VertexBuffer, worldMat: pc.Mat4, length: number, skinMatrices: Array<pc.Mat4>) {
        const it = new pc.VertexIterator(vertexBuffer);
        const positions = it.element[pc.SEMANTIC_POSITION];
        const normals = it.element[pc.SEMANTIC_NORMAL];
        const blendIndices = it.element[pc.SEMANTIC_BLENDINDICES];
        const blendWeights = it.element[pc.SEMANTIC_BLENDWEIGHT];

        const numVertices = vertexBuffer.getNumVertices();
        const p0 = new pc.Vec3();
        const p1 = new pc.Vec3();
        const skinMat = new pc.Mat4();

        for (let i = 0; i < numVertices; ++i) {
            // get local/morphed positions and normals
            p0.set(positions.get(0), positions.get(1), positions.get(2));
            p1.set(normals.get(0), normals.get(1), normals.get(2));

            if (blendIndices && blendWeights && skinMatrices) {
                // transform by skinning matrices
                skinMat.copy(pc.Mat4.ZERO);
                for (let j = 0; j < 4; ++j) {
                    DebugLines.matrixMad(
                        skinMat,
                        skinMatrices[blendIndices.get(j)],
                        blendWeights.get(j)
                    );
                }
                skinMat.mul2(worldMat, skinMat);
                skinMat.transformPoint(p0, p0);
                skinMat.transformVector(p1, p1);
            } else {
                worldMat.transformPoint(p0, p0);
                worldMat.transformVector(p1, p1);
            }

            p1.normalize().mulScalar(length).add(p0);

            this.line(p0, p1);

            it.next();
        }
    }

    // render a bone originating at p0 and ending at p1
    bone(p0: pc.Vec3, p1: pc.Vec3, clr = 0xffffffff) {
        mat.setLookAt(p0, p1, up);

        v0.sub2(p1, p0);
        const len = v0.length();
        const transform = (v: pc.Vec3, va: number[]) => {
            v0.set(va[0] * len * 0.3, va[1] * len * 0.3, va[2] * -len);
            mat.transformPoint(v0, v);
        };

        unitBone.forEach((line) => {
            transform(v1, line[0]);
            transform(v2, line[1]);
            this.line(v1, v2, clr);
        });
    }

    // render a colored axis at the given matrix orientation and size
    axis(m: pc.Mat4, size = 1) {
        m.getTranslation(v0);
        m.getScale(v2);

        // ignore matrix scale
        v2.set(size / v2.x, size / v2.y, size / v2.z);

        m.getX(v1).mul(v2).add(v0);
        this.line(v0, v1, 0xffff0000);

        m.getY(v1).mul(v2).add(v0);
        this.line(v0, v1, 0xff00ff00);

        m.getZ(v1).mul(v2).add(v0);
        this.line(v0, v1, 0xff0000ff);
    }

    // generate skeleton
    generateSkeleton(node: pc.GraphNode, showBones: boolean, showAxes: boolean, selectedNode: pc.GraphNode) {
        const recurse = (curr: pc.GraphNode, selected: boolean) => {
            if (curr.enabled) {
                selected ||= curr === selectedNode;

                // render child links
                for (let i = 0; i < curr.children.length; ++i) {
                    const child = curr.children[i];
                    if (showBones) {
                        this.bone(curr.getPosition(), child.getPosition(), selected ? 0xffffff00 : 0xffffffff);
                    }
                    recurse(child, selected);
                }

                // render axis
                if (showAxes) {
                    const parent = node.parent;
                    if (parent) {
                        v0.sub2(curr.getPosition(), parent.getPosition());
                        this.axis(curr.getWorldTransform(), v0.length() * 0.05);
                    }
                }
            }
        };
        recurse(node, false);
    }

    update() {
        const empty = this.vertexCursor === 0;
        if (!empty) {
            this.meshInstances.forEach((m) => {
                m.visible = true;
            });
            this.mesh.vertexBuffer.unlock();
            this.mesh.primitive[0].count = this.vertexCursor * 2;
            this.vertexCursor = 0;
        } else {
            this.meshInstances.forEach((m) => {
                m.visible = false;
            });
        }
    }
}

export {
    DebugLines
};
