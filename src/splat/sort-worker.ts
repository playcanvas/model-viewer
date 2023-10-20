type Vec3 = {
    x: number,
    y: number,
    z: number
};

// sort blind set of data
function SortWorker() {
    const epsilon = 0.0001;

    let data: Float32Array;
    let centers: Float32Array;
    let cameraPosition: Vec3;
    let cameraDirection: Vec3;
    let isWebGPU: boolean;

    const lastCameraPosition = { x: 0, y: 0, z: 0 };
    const lastCameraDirection = { x: 0, y: 0, z: 0 };

    let orderBuffer: BigUint64Array;
    let orderBuffer32: Uint32Array;
    let target: Float32Array;

    const update = () => {
        if (!centers || !data || !cameraPosition || !cameraDirection) return;

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

        const numVertices = centers.length / 3;

        // create distance buffer
        if (orderBuffer?.length !== numVertices) {
            orderBuffer = new BigUint64Array(numVertices);
            orderBuffer32 = new Uint32Array(orderBuffer.buffer);
            target = new Float32Array(numVertices);
        }

        // calc min/max
        let minDist = (centers[0] - px) * dx + (centers[1] - py) * dy + (centers[2] - pz) * dz;
        let maxDist = minDist;
        for (let i = 1; i < numVertices; i++) {
            const istride = i * 3;
            const d = (centers[istride + 0] - px) * dx +
                      (centers[istride + 1] - py) * dy +
                      (centers[istride + 2] - pz) * dz;
            minDist = Math.min(minDist, d);
            maxDist = Math.max(maxDist, d);
        }

        // generate per vertex distance to camera
        const range = maxDist - minDist;
        for (let i = 0; i < numVertices; ++i) {
            const istride = i * 3;
            const d = (centers[istride + 0] - px) * dx +
                      (centers[istride + 1] - py) * dy +
                      (centers[istride + 2] - pz) * dz;
            orderBuffer32[i * 2 + 0] = i;
            orderBuffer32[i * 2 + 1] = Math.floor((d - minDist) / range * (2 ** 32));
        }

        // sort indices
        orderBuffer.sort();

        // order the splat data
        if (isWebGPU) {
            const target32 = new Uint32Array(target.buffer);
            for (let i = 0; i < numVertices; ++i) {
                const index = orderBuffer32[i * 2];
                target32[i] = index;
            }
        } else {
            for (let i = 0; i < numVertices; ++i) {
                const index = orderBuffer32[i * 2];
                target[i] = index + 0.2;
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
        if (message.data.centers) {
            centers = new Float32Array(message.data.centers);
        }
        if (message.data.isWebGPU) {
            isWebGPU = message.data.isWebGPU;
        }
        if (message.data.cameraPosition) cameraPosition = message.data.cameraPosition;
        if (message.data.cameraDirection) cameraDirection = message.data.cameraDirection;

        update();
    };
}

export { SortWorker };
