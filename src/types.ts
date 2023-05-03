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

export enum RenderMode {
    Normal,
    Albedo,
    Opacity,
    WorldNormal,
    Specularity,
    Gloss,
    Metalness,
    Ao,
    Emission,
    Lighting,
    Uv0
};

export interface ObserverData {
    ui: {
        active?: string
    },
    render: {
        multisampleSupported: boolean,
        multisample: boolean,
        hq: boolean,
        pixelScale: number
    },
    show: {
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
        normals: number,
        fov: number,
        renderMode: 'default' | 'albedo' | 'opacity' | 'worldNormal' | 'specularity' | 'gloss' | 'metalness' | 'ao' | 'emission' | 'lighting' | 'uv0'
    },
    lighting: {
        direct: number,
        directColor: {
            r: number,
            g: number,
            b: number
        },
        follow: boolean,
        shadow: boolean,
        env: {
            value: string,
            options: null,
            default: null,
            skyboxMip: string,
            exposure: number,
            backgroundColor: {
                r: number,
                g: number,
                b: number
            }
        },
        rotation: number,
        tonemapping: string
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
        vertexCount?: number,
        primitiveCount?: number,
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
    spinner: boolean,
    error?: string,
    xrSupported: boolean,
    xrActive: boolean,
    glbUrl?: string
}

export type SetProperty = (path: string, value: any) => void;
