import {
    BLEND_PREMULTIPLIED,
    SHADOW_VSM_16F,
    SHADOWUPDATE_REALTIME as SHADOWUPDATE,
    AppBase,
    BoundingBox,
    CameraComponent,
    Entity,
    Layer,
    MeshInstance,
    RenderComponent,
    StandardMaterial
} from 'playcanvas';

const litUserMainEndGLSL = `
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - gl_FragColor.r);
`;

const litUserMainEndWGSL = `
    output.color = vec4f(0.0, 0.0, 0.0, 1.0 - output.color.r);
`;

class ShadowCatcher {
    layer: Layer;

    material: StandardMaterial;

    plane: Entity;

    light: Entity;

    sceneRoot: Entity;

    camera: CameraComponent;

    constructor(app: AppBase, camera: CameraComponent, parent: Entity, sceneRoot: Entity) {
        // create and add the shadow layer
        this.layer = new Layer({
            name: 'Shadow Layer'
        });

        const layers = app.scene.layers;
        const worldLayer = layers.getLayerByName('World');
        const idx = layers.getTransparentIndex(worldLayer);
        layers.insert(this.layer, idx + 1);

        // create shadow catcher material
        this.material = new StandardMaterial();
        this.material.blendType = BLEND_PREMULTIPLIED;
        this.material.shadowCatcher = true;
        this.material.useSkybox = false;
        this.material.depthWrite = false;
        this.material.diffuse.set(0, 0, 0);
        this.material.specular.set(0, 0, 0);

        this.material.shaderChunks.glsl.set('litUserMainEndPS', litUserMainEndGLSL);
        this.material.shaderChunks.wgsl.set('litUserMainEndPS', litUserMainEndWGSL);

        this.material.update();

        // create shadow catcher geometry
        this.plane = new Entity('ShadowPlane');
        this.plane.addComponent('render', {
            type: 'plane',
            castShadows: false,
            material: this.material
        });

        // create shadow catcher light
        this.light = new Entity('ShadowLight');
        this.light.addComponent('light', {
            type: 'directional',
            castShadows: true,
            normalOffsetBias: 0,
            shadowBias: 0.0,
            shadowResolution: 1024,
            shadowType: SHADOW_VSM_16F,
            shadowUpdateMode: SHADOWUPDATE,
            vsmBlurSize: 64,
            enabled: true,
            shadowIntensity: 0.4
        });

        parent.addChild(this.plane);
        parent.addChild(this.light);
        this.plane.render.layers = [this.layer.id];
        this.light.light.layers = [this.layer.id];

        // add the shadow layer to the camera
        camera.layers = camera.layers.concat([this.layer.id]);

        this.sceneRoot = sceneRoot;
        this.camera = camera;
    }

    onEntityAdded(entity: Entity) {
        entity.findComponents('render').forEach((component: RenderComponent) => {
            this.layer.shadowCasters = this.layer.shadowCasters.concat(component.meshInstances);
        });
    }

    onEntityRemoved(entity: Entity) {
        entity.findComponents('render').forEach((component: RenderComponent) => {
            this.layer.shadowCasters = this.layer.shadowCasters.filter(
                (meshInstance: MeshInstance) => {
                    return component.meshInstances.indexOf(meshInstance) === -1;
                }
            );
        });
    }

    onUpdate(sceneBounds: BoundingBox) {
        const bound = sceneBounds;
        const center = bound.center;
        const len = Math.sqrt(bound.halfExtents.x * bound.halfExtents.x + bound.halfExtents.z * bound.halfExtents.z);

        this.plane.setLocalScale(len * 4, 1, len * 4);
        this.plane.setPosition(center.x, bound.getMin().y, center.z);

        this.light.light.shadowDistance = this.camera.camera._farClip;
    }

    set enabled(enabled: boolean) {
        this.layer.enabled = enabled;
        this.light.enabled = enabled;
    }

    get enabled() {
        return this.layer.enabled;
    }

    set intensity(value: number) {
        this.light.light.shadowIntensity = value;
    }

    get intensity() {
        return this.light.light.shadowIntensity;
    }
}

export {
    ShadowCatcher
};
