import {
    AppBase,
    Asset,
    AssetRegistry,
    ContainerHandler,
    ContainerResource,
    createShaderFromCode,
    Entity,
    GraphicsDevice,
    Material,
    Mesh,
    MeshInstance,
    PRIMITIVE_POINTS,
    RenderComponent,
    StandardMaterial,
    Texture
} from 'playcanvas';

import { readPly, PlyElement } from './ply-parser';

const gsVS = /*glsl_*/ `
attribute vec3 vertex_position;
attribute vec2 vertex_color;

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;

varying vec2 texCoord;
varying vec4 color;

void main(void)
{
    // vertex in the world space
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    texCoord = vertex_texCoord;
    worldPos = (matrix_model * vec4(vertex_position, 1.0)).xyz;
}
`;

const gsFS = /*glsl_*/ `
uniform sampler2D source;
uniform float shadowIntensity;

varying vec2 texCoord;
varying vec4 color;

uniform vec3 view_position;
uniform vec3 sceneMin;
uniform vec3 sceneMax;

void main(void)
{
    float shadow = texture2D(source, texCoord).a;

    shadow = pow(shadow, 1.25);

    float v = max(0.0, min(1.0, normalize(view_position - worldPos).y * 6.0)) * 2.0;
    float fade = (v < 1.0) ? (v * v * 0.5) : ((v - 1.0) * (v - 3.0) - 1.0) * -0.5;
    gl_FragColor = vec4(0, 0, 0, mix(0.0, shadowIntensity, shadow) * fade);
}
`;

class PlyContainerResource extends ContainerResource {
    device: GraphicsDevice;
    elements: PlyElement[];

    renders: RenderComponent[] = [];
    meshes: Mesh[] = [];
    materials: Material[] = [];
    textures: Texture[] = [];

    constructor(device: GraphicsDevice, elements: PlyElement[]) {
        super();

        this.device = device;
        this.elements = elements;

        // const material = new Material();
        // material.shader = createShaderFromCode(this.device, gsVS, gsFS, 'gs', {
        //     vertex_position: SEMANTIC_POSITION,
        //     vertex_texCoord: SEMANTIC_TEXCOORD0
        // });
        // material.update();

        // // create the quad mesh
        // this.mesh = new Mesh(this.device);
        // this.mesh.setPositions(new Float32Array([
        //     -2, -2, 2, -2, 2, 2, -2, 2
        // ]);
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
            return vertexElement.properties.find((property: any) => property.name === name && property.storage);
        }

        const x = find('x');
        const y = find('y');
        const z = find('z');

        const r = find('red');
        const g = find('green');
        const b = find('blue');

        const f_dc_0 = find('f_dc_0');
        const f_dc_1 = find('f_dc_1');
        const f_dc_2 = find('f_dc_2');

        const opacity = find('opacity');

        if (!x || !y || !z) {
            return null;
        }

        const positions = new Float32Array(vertexElement.count * 3);
        const colors = new Uint8ClampedArray(vertexElement.count * 4);
        for (let i = 0; i < vertexElement.count; ++i) {
            // positions
            positions[i * 3 + 0] = x.storage[i] * -1;
            positions[i * 3 + 1] = y.storage[i] * -1;
            positions[i * 3 + 2] = z.storage[i];

            // vertex colors
            if (r && g && b) {
                colors[i * 4 + 0] = r.storage[i];
                colors[i * 4 + 1] = g.storage[i];
                colors[i * 4 + 2] = b.storage[i];
            } else if (f_dc_0 && f_dc_1 && f_dc_2) {
                const SH_C0 = 0.28209479177387814;
                colors[i * 4 + 0] = (0.5 + SH_C0 * f_dc_0.storage[i]) * 255;
                colors[i * 4 + 1] = (0.5 + SH_C0 * f_dc_1.storage[i]) * 255;
                colors[i * 4 + 2] = (0.5 + SH_C0 * f_dc_2.storage[i]) * 255;
            }

            // opacity
            if (opacity) {
                colors[i * 4 + 3] = (1 / (1 + Math.exp(-opacity.storage[i]))) * 255;
            } else {
                colors[i * 4 + 3] = 255;
            }
        }

        // construct mesh
        const mesh = new Mesh(this.device);
        mesh.setPositions(positions, 3);
        mesh.setColors32(colors);
        mesh.update(PRIMITIVE_POINTS, true);

        // construct material
        const material = new StandardMaterial();
        material.emissive.set(1, 1, 1);
        material.emissiveTint = true;
        material.emissiveVertexColor = true;
        material.update();

        const meshInstance = new MeshInstance(mesh, material);

        const result = new Entity('ply');
        result.addComponent('render', {
            type: 'asset',
            meshInstances: [ meshInstance ]
        });

        return result;
    }
};  

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
        readPly(response.body.getReader(), new Set(['x', 'y', 'z', 'red', 'green', 'blue', 'opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2']))
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