import { AppBase } from 'playcanvas';

class DummyWebGPU {
    constructor(app: AppBase) {
        if (app.graphicsDevice.isWebGPU) {
            console.log('WebGPU is already created, skipping dummy WebGPU creation');
            return;
        }

        if (!navigator.gpu) {
            console.log('WebGPU is not supported, skipping dummy WebGPU creation');
            return;
        }

        // Create a new canvas for WebGPU with a smaller size
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 20;
        canvas.style.position = 'absolute';
        canvas.style.top = '20px';
        canvas.style.left = '20px';
        document.body.appendChild(canvas);

        (async () => {
            const adapter = await navigator.gpu.requestAdapter();
            const device = await adapter.requestDevice();

            console.log('Created WebGPU device used for profiling');

            // Create a WebGPU context for the new canvas
            const context = canvas.getContext('webgpu') as any;

            // Configure the WebGPU context
            context.configure({ device, format: 'bgra8unorm' });

            // Hook into the 'frameend' event
            app.on('frameend', () => {
                // Clear the WebGPU surface to red after WebGL rendering

                // Get the current texture to render to
                const textureView = context.getCurrentTexture().createView();

                // Create a command encoder
                const commandEncoder = device.createCommandEncoder();

                // Create a render pass descriptor with a red background
                const renderPassDescriptor = {
                    colorAttachments: [{
                        view: textureView,
                        clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },  // Red background
                        loadOp: 'clear',
                        storeOp: 'store'
                    }]
                };

                // render pass
                const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
                passEncoder.end();

                // Submit the commands to the GPU
                device.queue.submit([commandEncoder.finish()]);
            });
        })();
    }
}

export { DummyWebGPU };
