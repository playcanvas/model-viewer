import * as pc from 'playcanvas';

interface IGraph {
    node: pc.GraphNode,
    color: pc.Color,
    callback: () => number,
    samples: Array<any>
    sample: number,
    prevSample: number,
    constantSamples: number
}

class Graph {
    app: pc.Application;
    numSamples: number;
    graphs: Array<IGraph>
    positions: Array<pc.Vec3>;

    constructor(app: pc.Application, numSamples: number) {
        const positions = [];
        for (let i = 0; i < numSamples - 1; ++i) {
            positions[i * 2 + 0] = new pc.Vec3(0, 0, 0);
            positions[i * 2 + 1] = new pc.Vec3(0, 0, 0);
        }

        this.app = app;
        this.numSamples = numSamples;
        this.graphs = [];
        this.positions = positions;
        // this.app.on('prerender', this.render.bind(this));
    }

    addGraph(node: pc.GraphNode, color: pc.Color, callback: () => number) {
        this.graphs.push({
            node: node,
            color: color,
            callback: callback,
            samples: [],
            sample: 0,
            prevSample: 0,
            constantSamples: this.numSamples
        });
    }

    hasNode(node: pc.GraphNode) {
        return this.graphs.findIndex(function (g) {
            return g.node === node;
        }) !== -1;
    }

    clear() {
        this.graphs = [];
    }

    update() {
        const graphs = this.graphs;
        const numSamples = this.numSamples;
        for (let i = 0; i < graphs.length; ++i) {
            const graph = graphs[i];
            const sample = graph.callback();

            if (graph.samples.length === 0) {
                // first sample, initialize everything
                for (let j = 0; j < this.numSamples; ++j) {
                    graph.samples.push(sample);
                }
                graph.prevSample = sample;
                graph.constantSamples = 512;
            } else {
                graph.samples[graph.sample] = sample;
                graph.sample++;
                if (graph.sample >= numSamples) {
                    graph.sample = 0;
                }

                if (sample === graph.prevSample) {
                    graph.constantSamples++;
                } else {
                    graph.constantSamples = 0;
                    graph.prevSample = sample;
                }
            }
        }
    }

    render() {
        const app = this.app;
        const camera = this.app.root.findByName('Camera');
        if (!camera) {
            return;
        }

        const graphs = this.graphs;
        const numSamples = this.numSamples;
        const positions = this.positions;
        let i, j;

        const right = new pc.Vec3();
        const up = new pc.Vec3();
        let sample;
        let pos;

        const options = {
            layer: app.scene.layers.getLayerById(pc.LAYERID_IMMEDIATE),
            depthTest: false
        };

        for (i = 0; i < graphs.length; ++i) {
            const graph = graphs[i];
            if (graph.constantSamples < this.numSamples) {
                const idx = graph.sample + numSamples - 1 + numSamples;
                const base = (graph.node.parent || graph.node).getPosition();
                const dist = base.distance(camera.getPosition());
                right.copy(camera.right);
                right.scale(dist * 0.005);
                up.copy(camera.up);
                up.scale(dist * 0.05);

                for (j = 0; j < numSamples - 1; ++j) {

                    sample = graph.samples[(idx - j) % numSamples];
                    pos = positions[j * 2 + 0];
                    pos.x = base.x + right.x * j + up.x * sample;
                    pos.y = base.y + right.y * j + up.y * sample;
                    pos.z = base.z + right.z * j + up.z * sample;

                    sample = graph.samples[(idx - j - 1) % numSamples];
                    pos = positions[j * 2 + 1];
                    pos.x = base.x + right.x * (j + 1) + up.x * sample;
                    pos.y = base.y + right.y * (j + 1) + up.y * sample;
                    pos.z = base.z + right.z * (j + 1) + up.z * sample;
                }

                // @ts-ignore TODO: update renderLines docs
                app.renderLines(positions, graph.color, options);
            }
        }
    }
}

Object.assign(Graph.prototype, {
});

export default Graph;
