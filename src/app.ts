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
    GSplatHandler
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

        // @ts-ignore
        appOptions.lightmapper = Lightmapper;
        // @ts-ignore
        appOptions.xr = XrManager;

        this.init(appOptions);
    }

    addComponentSystems(appOptions: AppOptions) {
        appOptions.componentSystems = [
            AnimComponentSystem,
            RenderComponentSystem,
            CameraComponentSystem,
            LightComponentSystem,
            GSplatComponentSystem
        ];
    }

    addResourceHandles(appOptions: AppOptions) {
        appOptions.resourceHandlers = [
            // @ts-ignore
            RenderHandler,
            // @ts-ignore
            AnimClipHandler,
            // @ts-ignore
            AnimStateGraphHandler,
            // @ts-ignore
            TextureHandler,
            // @ts-ignore
            CubemapHandler,
            // @ts-ignore
            BinaryHandler,
            // @ts-ignore
            ContainerHandler,
            // @ts-ignore
            GSplatHandler
        ];
    }
}

export { App };
