import {
    Lightmapper,
    AppBase,
    AppOptions,
    AnimComponentSystem,
    RenderComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    RenderHandler,
    AnimClipHandler,
    AnimStateGraphHandler,
    BinaryHandler,
    ContainerHandler,
    CubemapHandler,
    TextureHandler,
    XrManager,
    GSplatComponentSystem,
    GSplatHandler,
    ScriptComponentSystem
} from 'playcanvas';

class App extends AppBase {
    constructor(canvas: HTMLCanvasElement, options: any) {
        super(canvas);

        const appOptions = new AppOptions();

        appOptions.graphicsDevice = options.graphicsDevice;
        this.addComponentSystems(appOptions);
        this.addResourceHandles(appOptions);

        appOptions.elementInput = options.elementInput;
        appOptions.keyboard = options.keyboard;
        appOptions.mouse = options.mouse;
        appOptions.touch = options.touch;
        appOptions.gamepads = options.gamepads;

        appOptions.scriptPrefix = options.scriptPrefix;
        appOptions.assetPrefix = options.assetPrefix;
        appOptions.scriptsOrder = options.scriptsOrder;

        appOptions.lightmapper = Lightmapper;
        appOptions.xr = XrManager;

        this.init(appOptions);
    }

    addComponentSystems(appOptions: AppOptions) {
        appOptions.componentSystems = [
            AnimComponentSystem,
            RenderComponentSystem,
            CameraComponentSystem,
            LightComponentSystem,
            GSplatComponentSystem,
            ScriptComponentSystem
        ];
    }

    addResourceHandles(appOptions: AppOptions) {
        appOptions.resourceHandlers = [
            RenderHandler,
            AnimClipHandler,
            AnimStateGraphHandler,
            TextureHandler,
            CubemapHandler,
            BinaryHandler,
            ContainerHandler,
            GSplatHandler
        ];
    }
}

export { App };
