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
