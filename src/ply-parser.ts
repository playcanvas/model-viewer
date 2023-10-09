import {
    AppBase,
    Asset,
    AssetRegistry,
    ContainerHandler,
    ContainerResource,
    GraphicsDevice
} from 'playcanvas';

class PlyParser {
    constructor() {
        
    }
}

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
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            console.log(value.length);
        }
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
