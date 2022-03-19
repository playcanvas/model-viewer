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

export interface HierarchyNode {
    name: string,
    path: string,
    children: Array<HierarchyNode>
}

export type DropHandlerFunc =(files: Array<File>, resetScene: boolean) => void;
