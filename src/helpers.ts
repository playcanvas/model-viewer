function getAssetPath(assetPath: string): string {
    // @ts-ignore: path variable injected at build time
    return (__PUBLIC_PATH__ ? __PUBLIC_PATH__ : '/static/') + assetPath;
}

export { getAssetPath };
