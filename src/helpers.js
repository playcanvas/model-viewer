var getAssetPath = function (assetPath) {
    var prefix = '';
    // #if process.env.PUBLIC_PATH
    prefix = '/viewer/';
    // #endif
    return prefix + assetPath;
};

export { getAssetPath };
