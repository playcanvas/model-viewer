var getAssetPath = function (assetPath) {
    return (__PUBLIC_PATH__ ? __PUBLIC_PATH__ : '/static/') + assetPath;
};

export { getAssetPath };
