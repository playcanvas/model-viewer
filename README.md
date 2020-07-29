# PlayCanvas glTF Viewer

The PlayCanvas glTF scene viewer is blazingly fast and 100% compliant with the glTF 2.0 spec. You can find a live version at:

https://playcanvas.com/viewer

The viewer can load any glTF 2.0 scene. Embedded glTF and binary glTF (GLB) can be dragged directly into the 3D view. To load an unpacked glTF scene, drag its parent folder into the 3D view. You can also load scenes via the `load` URL query parameter. An example would be:

https://playcanvas.com/viewer/?load=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb

## How to build

Ensure you have [Node.js](https://nodejs.org) installed (v10.0+). Then, from a command prompt, run:

    npm install
    npm build:local

This will invoke Webpack and output the built viewer to the `dist` folder.

## How to run

Run:

    npm run serve

Open a browser and navigate to http://localhost:8080.
