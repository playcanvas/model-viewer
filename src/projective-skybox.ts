
import {
    shaderChunks,
    AppBase
} from "playcanvas";

const projectiveSkyboxVS = shaderChunks.skyboxVS.replace(' * cubeMapRotationMatrix', '');

const projectiveSkyboxHDRPS = `
void intersectPlane(inout float t, vec3 pos, vec3 dir, vec4 plane) {
    float d = dot(dir, plane.xyz);
    if (d != 0.0) {
        float n = -(dot(pos, plane.xyz) + plane.w) / d;
        if (n >= 0.0 && n < t) {
            t = n;
        }
    }
}

void intersectSphere(inout float t, vec3 pos, vec3 dir, vec4 sphere) {
    vec3 L = sphere.xyz - pos;
    float tca = dot(L, dir);

    if (tca >= 0.0) {
        float d2 = sphere.w - (dot(L, L) - tca * tca);
        if (d2 >= 0.0) {
            float thc = tca + sqrt(d2);
            if (thc >= 0.0 && thc < t) t = thc;
        }
    }
}

varying vec3 vViewDir;

uniform samplerCube texture_cubeMap;
uniform mat3 cubeMapRotationMatrix;
uniform vec3 view_position;             // camera world position
uniform vec4 domeParams;                // x, y, z: dome center, w: dome radius
uniform vec4 groundParams;              // x: plane height, y: tripod height, z: blend factor, w: unused

void main(void) {
    // get world space ray
    vec3 view_pos = view_position;
    vec3 view_dir = normalize(vViewDir);

    // intersect ray with world geometry
    float t = 1000.0;
    if (view_dir.y < 0.0) intersectPlane(t, view_pos, view_dir, vec4(0.0, 1.0, 0.0, -groundParams.x));
    intersectSphere(t, view_pos, view_dir, vec4(domeParams.xyz, domeParams.w * domeParams.w));
    vec3 world_pos = view_pos + view_dir * t;

    // calculate env sample vector based on world intersection and projection center
    vec3 env_dir = normalize(world_pos - vec3(0.0, groundParams.y, 0.0));

    vec3 final_dir = mix(view_dir, env_dir, groundParams.z) * cubeMapRotationMatrix;

    vec3 linear = $DECODE(textureCube(texture_cubeMap, fixSeamsStatic(final_dir * vec3(-1.0, 1.0, 1.0), $FIXCONST)));

    gl_FragColor = vec4(gammaCorrectOutput(toneMap(processEnvironment(linear))), 1.0);
}
`;

shaderChunks.skyboxHDRPS = projectiveSkyboxHDRPS;
shaderChunks.skyboxVS = projectiveSkyboxVS;

class ProjectiveSkybox {
    app: AppBase;
    _enabled = false;
    groundPosition = 0;         // in world units
    domeRadius = 1;             // in world units
    domeOffset = 0.5;           // dome offset in Y-axis above the ground
    tripodOffset = 0.1;         // tripod offset in Y-axis above the ground

    constructor(app: AppBase) {
        this.app = app;

        app.on('prerender', () => {
            const scope = app.graphicsDevice.scope;
            scope.resolve('domeParams').setValue([0, this.groundPosition + this.domeRadius * this.domeOffset, 0, this.domeRadius]);
            scope.resolve('groundParams').setValue([this.groundPosition, this.groundPosition + this.tripodOffset, this.enabled ? 1.0 : 0.0, 0]);
        });
    }

    set enabled(value: boolean) {
        this._enabled = value;
    }

    get enabled() {
        return this._enabled;
    }
}

export { ProjectiveSkybox };
