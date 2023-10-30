import { VertexBuffer } from "playcanvas";

type Vec3 = {
    x: number,
    y: number,
    z: number
};

// sort blind set of data
function SortWorker() {
    const epsilon = 0.0001;

    // number of bits used to store the distance in integer array. Smaller number gives it a smaller
    // precision but less radix sort passes to sort. Could even be dynamic for less precise sorting.
    // 16bit seems plenty of large scenes (train), 10bits is enough for sled.
    const compareBits = 16;

    // larger based makes a lot less passes by radix sort, but each pass is slightly slower. Big win
    // to use 512 vs 10. Needs to find a the sweet spot for this.
    const radixBase = 512;

    let data: Float32Array;
    let centers: Float32Array;
    let cameraPosition: Vec3;
    let cameraDirection: Vec3;
    let intIndices: boolean;

    const boundMin = { x: 0, y: 0, z: 0 };
    const boundMax = { x: 0, y: 0, z: 0 };

    const lastCameraPosition = { x: 0, y: 0, z: 0 };
    const lastCameraDirection = { x: 0, y: 0, z: 0 };

    let orderBuffer: BigUint64Array;
    let orderBuffer32: Uint32Array;
    let orderBufferTmp: BigUint64Array;
    let target: Float32Array;

    // A function to do counting sort of arr[] according to the digit represented by exp.
    const countSort = (arr: BigUint64Array, arr32: Uint32Array, temp: BigUint64Array, n: number, exp: number, intIndices: boolean, outputArray: any) => {
        const count = new Array(radixBase);
        for (let i = 0; i < radixBase; i++)
            count[i] = 0;

        // Store count of occurrences in count[]
        for (let i = 0; i < n; i++) {
            const x = Math.floor(arr32[i * 2 + 1] / exp) % radixBase;
            count[x]++;
        }

        // Change count[i] so that count[i] now contains actual position of this digit in output[]
        for (let i = 1; i < radixBase; i++)
            count[i] += count[i - 1];

        // Build the output array
        for (let i = n - 1; i >= 0; i--) {
            const x = Math.floor(arr32[i * 2 + 1] / exp) % radixBase;
            temp[count[x] - 1] = arr[i];
            count[x]--;
        }

        // if outputting directly to final array, avoid the copy to temp array
        if (outputArray) {

            const temp32 = new Uint32Array(temp.buffer);
            if (intIndices) {

                for (let i = 0; i < n; i++)
                    outputArray[i] = temp32[i * 2];

            } else {

                for (let i = 0; i < n; i++)
                    outputArray[i] = temp32[i * 2] + 0.2;
            }

        } else {

            // Copy the output array to arr[], so that arr[] now contains sorted numbers according to current digit
            for (let i = 0; i < n; i++)
                arr[i] = temp[i];
        }
    };

    // The main function to that sorts arr[] of size n using Radix Sort
    const radixSort = (arr: BigUint64Array, arr32: Uint32Array, arrTmp: BigUint64Array, n: number, intIndices: boolean, finalArray: any) => {

        // maximum number to know number of digits
        const m = 2 ** compareBits;

        // Do counting sort for every digit. Note that instead of passing digit number, exp is passed.
        // exp is 10^i where i is current digit number
        for (let exp = 1; Math.floor(m / exp) > 0; exp *= radixBase) {

            const lastPass = Math.floor(m / (exp * radixBase)) === 0;
            countSort(arr, arr32, arrTmp, n, exp, intIndices, lastPass ? finalArray : null);
        }
    };

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
            orderBufferTmp = new BigUint64Array(numVertices);
            target = new Float32Array(numVertices);
        }

        // calc min/max distance using bound
        let minDist;
        let maxDist;
        for (let i = 0; i < 8; ++i) {
            const x = i & 1 ? boundMin.x : boundMax.x;
            const y = i & 2 ? boundMin.y : boundMax.y;
            const z = i & 4 ? boundMin.z : boundMax.z;
            const d = (x - px) * dx + (y - py) * dy + (z - pz) * dz;
            if (i === 0) {
                minDist = maxDist = d;
            } else {
                minDist = Math.min(minDist, d);
                maxDist = Math.max(maxDist, d);
            }
        }

        // generate per vertex distance to camera
        const range = maxDist - minDist;
        const divider = 1 / range * (2 ** compareBits);
        for (let i = 0; i < numVertices; ++i) {
            const istride = i * 3;
            const d = (centers[istride + 0] - px) * dx +
                      (centers[istride + 1] - py) * dy +
                      (centers[istride + 2] - pz) * dz;
            orderBuffer32[i * 2 + 0] = i;
            orderBuffer32[i * 2 + 1] = Math.floor((d - minDist) * divider);
        }

        // sort indices by distance only, so use distance in orderBuffer32 as sorting key
        const finalArray = intIndices ? new Uint32Array(target.buffer) : target;
        radixSort(orderBuffer, orderBuffer32, orderBufferTmp, numVertices, intIndices, finalArray);

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

            // calculate bounds
            boundMin.x = boundMax.x = centers[0];
            boundMin.y = boundMax.y = centers[1];
            boundMin.z = boundMax.z = centers[2];

            const numVertices = centers.length / 3;
            for (let i = 1; i < numVertices; ++i) {
                const x = centers[i * 3 + 0];
                const y = centers[i * 3 + 1];
                const z = centers[i * 3 + 2];

                boundMin.x = Math.min(boundMin.x, x);
                boundMin.y = Math.min(boundMin.y, y);
                boundMin.z = Math.min(boundMin.z, z);

                boundMax.x = Math.max(boundMax.x, x);
                boundMax.y = Math.max(boundMax.y, y);
                boundMax.z = Math.max(boundMax.z, z);
            }
        }
        if (message.data.intIndices) {
            intIndices = message.data.intIndices;
        }
        if (message.data.cameraPosition) cameraPosition = message.data.cameraPosition;
        if (message.data.cameraDirection) cameraDirection = message.data.cameraDirection;

        update();
    };
}

class SortManager {
    worker: Worker;
    vertexBuffer: VertexBuffer;
    updatedCallback: () => void;

    constructor() {
        this.worker = new Worker(URL.createObjectURL(new Blob([`(${SortWorker.toString()})()`], {
            type: 'application/javascript'
        })));

        this.worker.onmessage = (message: any) => {
            const newData = message.data.data;
            const oldData = this.vertexBuffer.storage;

            // send vertex storage to worker to start the next frame
            this.worker.postMessage({
                data: oldData
            }, [oldData]);

            this.vertexBuffer.setData(newData);
            this.updatedCallback?.();
        };
    }

    destroy() {
        this.worker.terminate();
        this.worker = null;
    }

    sort(vertexBuffer: VertexBuffer, centers: Float32Array, intIndices: boolean, updatedCallback?: () => void) {
        this.vertexBuffer = vertexBuffer;
        this.updatedCallback = updatedCallback;

        // send the initial buffer to worker
        const buf = vertexBuffer.storage.slice(0);
        this.worker.postMessage({
            data: buf,
            centers: centers.buffer,
            intIndices: intIndices
        }, [buf, centers.buffer]);
    }

    setCamera(pos: Vec3, dir: Vec3) {
        this.worker.postMessage({
            cameraPosition: { x: pos.x, y: pos.y, z: pos.z },
            cameraDirection: { x: dir.x, y: dir.y, z: dir.z }
        });
    }
}

export { SortManager };
