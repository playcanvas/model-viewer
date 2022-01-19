export interface Morph {
    name: string,
    targetIndex?: number,
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

export interface Skybox {
    url: string,
    label: string
}

export interface Observer {
    set: (path: string, value: any, silent?: boolean, remote?: boolean, force?: boolean) => void,
    get: (path: string) => any,
    on: (eventName: string, callback: (value: any) => void) => void,
    emit: (eventName: string) => void
}

export interface HierarchyNode {
    name: string,
    path: string,
    children: Array<HierarchyNode>
}
