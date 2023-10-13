import {
    AppBase,
    AssetRegistry,
    ContainerHandler,
    GraphicsDevice
} from 'playcanvas';
import { SplatResource } from './splat-resource';
import { readPly } from './ply-reader';

// filter out element data we're not going to use
const elements = [
    'x', 'y', 'z',
    'red', 'green', 'blue',
    'opacity',
    'f_dc_0', 'f_dc_1', 'f_dc_2',
    'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3'
];

class PlyContainerParser {
    device: GraphicsDevice;
    assets: AssetRegistry;
    maxRetries: number;

    constructor(device: GraphicsDevice, assets: AssetRegistry, maxRetries: number) {
        this.device = device;
        this.assets = assets;
        this.maxRetries = maxRetries;
    }

    async load(url: any, callback: (err: string, resource: SplatResource) => void) {
        const response = await fetch(url.load);
        readPly(response.body.getReader(), new Set(elements))
            .then((response) => {
                callback(null, new SplatResource(this.device, response));
            })
            .catch((err) => {
                callback(err, null);
            });
    }

    open(url: string, data: any) {
        return data;
    }
}

const registerPlyParser = (app: AppBase) => {
    const containerHandler = app.loader.getHandler('container') as ContainerHandler;
    containerHandler.parsers.ply = new PlyContainerParser(app.graphicsDevice, app.assets, app.loader.maxRetries);
};

export { registerPlyParser };
