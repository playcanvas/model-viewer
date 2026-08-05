declare module '*.png' {
    const value: string;
    export default value;
}

declare module '*.svg' {
    const value: { src: string };
    export default value;
}

declare module '*.scss' {
    const value: string;
    export default value;
}

declare module 'qrious' {
    const QRious: new (options: { element: HTMLCanvasElement; value: string; size: number }) => object;
    export default QRious;
}
