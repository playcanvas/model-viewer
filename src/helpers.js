var getAssetPath = function (assetPath) {
    var prefix = '/static/';
    // #if process.env.PUBLIC_PATH
    prefix = '/viewer/static/';
    // #endif
    return prefix + assetPath;
};

export { getAssetPath };
