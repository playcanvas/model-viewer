# PlayCanvas glTF Viewer

The PlayCanvas glTF scene viewer is blazingly fast and 100% compliant with the glTF 2.0 spec.

![PlayCanvas Viewer](https://user-images.githubusercontent.com/11276292/188189268-27d397f2-2085-4d8e-a6b2-4205fd13f0fb.png)

You can find a live version at:

https://playcanvas.com/model-viewer

## Viewing Scenes

The viewer can load any glTF 2.0 scene. Embedded glTF and binary glTF (GLB) can be dragged directly into the 3D view. To load an unpacked glTF scene, drag its parent folder into the 3D view.

You can also drag and drop images into the 3D view to set a background. Options are:

* Single file images are treated as equirectangular projections. Supported formats are PNG, JPG and HDR. Find high quality HDR images at [HDRHaven](https://hdrihaven.com/).
* Six images are treated as cube map faces. Naming should be one of the following 5 forms, where each face name below should be incorporated in the overall filename like `name_posx.png` for example:

| Face 0  | Face 1  | Face 2  | Face 3  | Face 4  | Face 5  |
|---------|---------|---------|---------|---------|---------|
| posx    |  negx   | posy    | negy    | posz    | negz    |
| px      |  nx     | py      | ny      | pz      | nz      |
| right   |  left   | up      | down    | front   | back    |
| right   |  left   | top     | bottom  | forward | backward|
| 0       |  1      | 2       | 3       | 4       | 5       |

### Supported URL Parameters

Some URL query parameters are available to override certain aspects of the viewer:

| Parameter         | Description                          | Example |
|-------------------|--------------------------------------|---------|
| `load`/`assetUrl` | Specify URL to a glTF scene to load  | [?load=URL](https://playcanvas.com/model-viewer/?load=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb) |
| `cameraPosition`  | Override the initial camera position | [?cameraPosition=0,0,20](https://playcanvas.com/model-viewer/?load=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb&cameraPosition=0,0,20) |

## How to build

Ensure you have [Node.js](https://nodejs.org) installed (v18.0+). Then, from a command prompt, run:

    npm install
    npm run build

This will invoke Rollup and output the built viewer to the `dist` folder. To invoke Rollup with the `--watch` flag (which rebuilds the viewer on saving any source file), do:

    npm run watch

## How to build with local PlayCanvas engine

You can set the npm build scripts to use local versions of the PlayCanvas engine & PlayCanvas extras builds by setting the following environment variables when launching the npm build scripts:

    ENGINE_PATH=./path/to/engine npm run build

## How to run

Run:

    npm run serve

Open a browser and navigate to http://localhost:3000.

## Development 

Run:

    npm run develop

Open a browser and navigate to http://localhost:3000.

N.B. To load local models run `npx server --cors` in the directory containing the model (disables CORS).
