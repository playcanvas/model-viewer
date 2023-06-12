import {
    shaderChunks,
    AppBase,
    Vec3
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

bool intersectSphere(inout float t, vec3 pos, vec3 dir, vec4 sphere) {
    vec3 L = sphere.xyz - pos;
    float tca = dot(L, dir);

    float d2 = sphere.w - (dot(L, L) - tca * tca);
    if (d2 >= 0.0) {
        float thc = tca + sqrt(d2);
        if (thc >= 0.0 && thc < t) {
            t = thc;
            return true;
        }
    }

    return false;
}

varying vec3 vViewDir;

uniform samplerCube texture_cubeMap;
uniform mat3 cubeMapRotationMatrix;
uniform vec3 view_position;             // camera world position
uniform vec4 tripodParams;              // x, y, z: world space origin of the tripod, w: blend factor
uniform vec4 domeParams;                // x, y, z: world space dome center, w: (dome radius)^2
uniform vec4 groundPlane;               // x, y, z, w: world space ground plane

void main(void) {
    // get world space ray
    vec3 view_pos = view_position;
    vec3 view_dir = normalize(vViewDir);

    // intersect ray with world geometry
    float t = 8000.0;   // max intersection distance
    if (intersectSphere(t, view_pos, view_dir, domeParams) && view_dir.y < 0.0) {
        intersectPlane(t, view_pos, view_dir, groundPlane);
    }

    // calculate world space intersection
    vec3 world_pos = view_pos + view_dir * t;

    // get vector from world space pos to tripod origin
    vec3 env_dir = normalize(world_pos - tripodParams.xyz);

    vec3 final_dir = mix(view_dir, env_dir, tripodParams.w) * cubeMapRotationMatrix;

    vec3 linear = $DECODE(textureCube(texture_cubeMap, fixSeamsStatic(final_dir * vec3(-1.0, 1.0, 1.0), $FIXCONST)));

    gl_FragColor = vec4(gammaCorrectOutput(toneMap(processEnvironment(linear))), 1.0);
}
`;

shaderChunks.skyboxHDRPS = projectiveSkyboxHDRPS;
shaderChunks.skyboxVS = projectiveSkyboxVS;

class ProjectiveSkybox {
    app: AppBase;
    _enabled = false;
    origin = new Vec3(0);
    tripodOffset = 0.1;         // tripod offset in Y-axis above the origin
    domeRadius = 1;             // in world units
    domeOffset = 0.5;           // dome offset in Y-axis above the origin

    constructor(app: AppBase) {
        this.app = app;

        app.on('prerender', () => {
            const scope = app.graphicsDevice.scope;
            scope.resolve('tripodParams').setValue([
                this.origin.x,
                this.origin.y + this.domeRadius * this.tripodOffset,
                this.origin.z,
                this.enabled ? 1.0 : 0.0
            ]);
            scope.resolve('domeParams').setValue([
                this.origin.x,
                this.origin.y + this.domeRadius * this.domeOffset,
                this.origin.z,
                this.domeRadius * this.domeRadius
            ]);
            scope.resolve('groundPlane').setValue([
                0,
                1,
                0,
                -this.origin.y
            ]);
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
