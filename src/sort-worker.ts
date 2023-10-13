type Vec3 = {
    x: number,
    y: number,
    z: number
};

// sort blind set of data
function SortWorker() {
    const epsilon = 0.0001;

    let data: Float32Array;
    let stride: number;
    let cameraPosition: Vec3;
    let cameraDirection: Vec3;

    const lastCameraPosition = { x: 0, y: 0, z: 0 };
    const lastCameraDirection = { x: 0, y: 0, z: 0 };

    let distanceBuffer: Float32Array;
    let orderBuffer: Uint32Array;
    let target: Float32Array;

    const update = () => {
        if (!data || !stride || !cameraPosition || !cameraDirection) return;

        // early out if camera hasn't moved
        if (Math.abs(cameraPosition.x - lastCameraPosition.x) < epsilon &&
            Math.abs(cameraPosition.y - lastCameraPosition.y) < epsilon &&
            Math.abs(cameraPosition.z - lastCameraPosition.z) < epsilon &&
            Math.abs(cameraDirection.x - lastCameraDirection.x) < epsilon &&
            Math.abs(cameraDirection.y - lastCameraDirection.y) < epsilon &&
            Math.abs(cameraDirection.z - lastCameraDirection.z) < epsilon) {
            return;
        }

        const numVertices = data.length / stride;

        // create distance buffer
        if (!distanceBuffer || distanceBuffer.length !== numVertices) {
            distanceBuffer = new Float32Array(numVertices);
            orderBuffer = new Uint32Array(numVertices);
            target = new Float32Array(numVertices * stride);
        }

        // store
        lastCameraPosition.x = cameraPosition.x;
        lastCameraPosition.y = cameraPosition.y;
        lastCameraPosition.z = cameraPosition.z;
        lastCameraDirection.x = cameraDirection.x;
        lastCameraDirection.y = cameraDirection.y;
        lastCameraDirection.z = cameraDirection.z;

        const px = cameraPosition.x;
        const py = cameraPosition.y;
        const pz = cameraPosition.z;
        const dx = cameraDirection.x;
        const dy = cameraDirection.y;
        const dz = cameraDirection.z;

        // generate per vertex distance to camera
        for (let i = 0; i < numVertices; ++i) {
            distanceBuffer[i] =
                (data[i * stride + 0] - px) * dx +
                (data[i * stride + 1] - py) * dy +
                (data[i * stride + 2] - pz) * dz;
            orderBuffer[i] = i;
        }

        // sort indices
        orderBuffer.sort((a, b) => distanceBuffer[a] - distanceBuffer[b]);

        const orderChanged = orderBuffer.some((v, i) => v !== i);

        if (orderChanged) {
            // order the splat data
            for (let i = 0; i < numVertices; ++i) {
                const ti = i * stride;
                const si = orderBuffer[i] * stride;
                for (let j = 0; j < stride; ++j) {
                    target[ti + j] = data[si + j];
                }
            }

            // swap
            const tmp = data;
            data = target;
            target = tmp;

            // send results
            self.postMessage({
                data: data.buffer
            }, [data.buffer]);

            data = null;
        }
    };

    self.onmessage = (message: any) => {
        if (message.data.data) {
            data = new Float32Array(message.data.data);
        }
        if (message.data.stride) {
            stride = message.data.stride;
        }
        if (message.data.cameraPosition) cameraPosition = message.data.cameraPosition;
        if (message.data.cameraDirection) cameraDirection = message.data.cameraDirection;

        update();
    };
}

export { SortWorker };
