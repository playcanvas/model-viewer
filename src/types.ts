export interface Morph {
    name: string,
    targetIndex?: number,
    weight?: number
}

export interface URL {
    url: string,
    filename?: string
}

export interface Entry {
    isFile: boolean,
    isDirectory: boolean,
    createReader: any,
    file: any,
    fullPath: string
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
    set: (path: string, value: any) => void,
    get: (path: string) => any,
    on: (eventName: string, callback: (value: any) => void) => void,
    emit: (eventName: string) => void
}

export interface HierarchyNode {
    name: string,
    path: string,
    children: Array<HierarchyNode>
}
