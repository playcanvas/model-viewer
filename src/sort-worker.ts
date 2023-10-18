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

    let orderBuffer: BigUint64Array;
    let orderBuffer32: Uint32Array;
    let target: Float32Array;

    const update = () => {
        if (!data || !stride || !cameraPosition || !cameraDirection) return;

        const px = cameraPosition.x;
        const py = cameraPosition.y;
        const pz = cameraPosition.z;
        const dx = cameraDirection.x;
        const dy = cameraDirection.y;
        const dz = cameraDirection.z;

        // early out if camera hasn't moved
        if (Math.abs(px - lastCameraPosition.x) < epsilon &&
            Math.abs(py - lastCameraPosition.y) < epsilon &&
            Math.abs(pz - lastCameraPosition.z) < epsilon &&
            Math.abs(dx - lastCameraDirection.x) < epsilon &&
            Math.abs(dy - lastCameraDirection.y) < epsilon &&
            Math.abs(dz - lastCameraDirection.z) < epsilon) {
            return;
        }

        lastCameraPosition.x = px;
        lastCameraPosition.y = py;
        lastCameraPosition.z = pz;
        lastCameraDirection.x = dx;
        lastCameraDirection.y = dy;
        lastCameraDirection.z = dz;

        const numVertices = data.length / stride;

        // create distance buffer
        if (orderBuffer?.length !== numVertices) {
            orderBuffer = new BigUint64Array(numVertices);
            orderBuffer32 = new Uint32Array(orderBuffer.buffer);
            target = new Float32Array(numVertices * stride);
        }

        const strideVertices = numVertices * stride;

        // calc min/max
        let minDist = (data[0] - px) * dx + (data[1] - py) * dy + (data[2] - pz) * dz;
        let maxDist = minDist;
        for (let i = stride; i < strideVertices; i += stride) {
            const d = (data[i + 0] - px) * dx +
                      (data[i + 1] - py) * dy +
                      (data[i + 2] - pz) * dz;
            minDist = Math.min(minDist, d);
            maxDist = Math.max(maxDist, d);
        }

        // generate per vertex distance to camera
        const range = maxDist - minDist;
        for (let i = 0; i < numVertices; ++i) {
            const istride = i * stride;
            const d = (data[istride + 0] - px) * dx +
                      (data[istride + 1] - py) * dy +
                      (data[istride + 2] - pz) * dz;
            orderBuffer32[i * 2 + 1] = Math.floor((d - minDist) / range * (2 ** 32));
            orderBuffer32[i * 2] = i;
        }

        // sort indices
        orderBuffer.sort();

        // order the splat data
        for (let i = 0; i < numVertices; ++i) {
            const ti = i * stride;
            const si = orderBuffer32[i * 2] * stride;
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
