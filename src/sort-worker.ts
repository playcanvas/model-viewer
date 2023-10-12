
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

    let lastCameraPosition = { x: 0, y: 0, z: 0 };
    let lastCameraDirection = { x: 0, y: 0, z: 0 };

    let distanceBuffer: Float32Array;
    let orderBuffer: Uint32Array
    let target: Float32Array;
    let vertexData: Float32Array;

    const update = () => {
        if (!data || !stride || !cameraPosition || !cameraDirection) return;

        // early out if nothing changed
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

        // shuffle the data
        for (let i = 0; i < numVertices; ++i) {
            const index = orderBuffer[i];
            // copy source data to temp buffer
            for (let j = 0; j < stride; ++j) target[i * stride + j] = data[index * stride + j];
        }

        // store
        lastCameraPosition.x = cameraPosition.x;
        lastCameraPosition.y = cameraPosition.y;
        lastCameraPosition.z = cameraPosition.z;
        lastCameraDirection.x = cameraDirection.x;
        lastCameraDirection.y = cameraDirection.y;
        lastCameraDirection.z = cameraDirection.z;

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

    self.onmessage = (message: any) => {
        if (message.data.data) {
            data = new Float32Array(message.data.data);
        }
        if (message.data.stride) {
            stride = message.data.stride;
            vertexData = new Float32Array(stride);
        }
        if (message.data.cameraPosition) cameraPosition = message.data.cameraPosition;
        if (message.data.cameraDirection) cameraDirection = message.data.cameraDirection;
        update();
    }
}

export {
    SortWorker
}
