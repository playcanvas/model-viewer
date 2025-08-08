export interface MorphTargetData {
    name: string,
    targetIndex: number,
    weight?: number
}

export interface File {
    url: string,
    filename?: string
}

export interface Option {
    v: string | number | null,
    t: string
}

export interface HierarchyNode {
    name: string,
    path: string,
    children: Array<HierarchyNode>
}

export interface ObserverData {
    ui: {
        fullscreen: boolean,
        active?: string,
        spinner: boolean,
        error?: string,
    },
    camera: {
        fov: number,
        tonemapping: string,
        pixelScale: number
        multisampleSupported: boolean,
        multisample: boolean,
        hq: boolean,
        mode: 'orbit' | 'fly'
    },
    skybox: {
        value: string,
        options: string,
        exposure: number,
        rotation: number,
        background: 'Solid Color' | 'Infinite Sphere' | 'Projective Dome' | 'Projective Box',
        backgroundColor: {
            r: number,
            g: number,
            b: number
        },
        blur: number,
        domeProjection: {
            domeRadius: number,
            tripodOffset: number
        }
    },
    light: {
        enabled: boolean,
        color: {
            r: number,
            g: number,
            b: number
        },
        intensity: number,
        follow: boolean,
        shadow: boolean
    },
    shadowCatcher: {
        enabled: boolean,
        intensity: number
    },
    debug: {
        renderMode: 'default' | 'albedo' | 'opacity' | 'worldNormal' | 'specularity' | 'gloss' | 'metalness' | 'ao' | 'emission' | 'lighting' | 'uv0',
        stats: boolean,
        wireframe: boolean,
        wireframeColor: {
            r: number,
            g: number,
            b: number
        },
        bounds: boolean,
        skeleton: boolean,
        axes: boolean,
        grid: boolean,
        normals: number
    },
    animation: {
        playing: boolean,
        speed: number,
        transition: number,
        loops: number,
        list: string,
        progress: number,
        selectedTrack: string
    },
    scene: {
        urls: string[],
        filenames: string[],
        nodes: string,
        selectedNode: {
            path: string,
            name?: string,
            position: {
                0: number,
                1: number,
                2: number
            },
            rotation: {
                0: number,
                1: number,
                2: number,
                3: number
            },
            scale: {
                0: number,
                1: number,
                2: number
            }
        },
        meshCount?: number,
        materialCount?: number,
        textureCount?: number,
        vertexCount?: number,
        primitiveCount?: number,
        textureVRAM?: number,
        meshVRAM?: number,
        bounds?: any,
        variant: {
            selected: number
        },
        variants: {
            list: string
        },
        loadTime?: number
    },
    morphs?: Record<string, {
        name: string,
        targets: Record<string, MorphTargetData>
    }>,
    runtime: {
        activeDeviceType: string,
        viewportWidth: number,
        viewportHeight: number,
        xrSupported: boolean,
        xrActive: boolean
    },
    enableWebGPU: boolean,
    centerScene: boolean,
}

export type SetProperty = (path: string, value: any) => void;
