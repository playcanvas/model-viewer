declare module '*.png' {
    const value: HTMLImageElement;
    export default value;
}

declare module '*.svg' {
    const value: HTMLImageElement;
    export default value;
}

declare module '*.scss' {}

declare module 'qrious' {
    const QRious: new (options: { element: HTMLCanvasElement; value: string; size: number }) => object;
    export default QRious;
}
