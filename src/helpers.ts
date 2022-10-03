function getAssetPath(assetPath: string): string {
    // @ts-ignore: path variable injected at build time
    return (__PUBLIC_PATH__ ? __PUBLIC_PATH__ : '/static/') + assetPath;
}

function getRootPath(): string {
    // @ts-ignore: path variable injected at build time
    return (__PUBLIC_PATH__ ? './model-viewer' : '.');
}

const addEventListenerOnClickOnly = (element: any, callback: any, delta = 2) => {
    let startX: number;
    let startY: number;

    const mouseDownEvt = (event: any) => {
        startX = event.pageX;
        startY = event.pageY;
    };
    element.addEventListener('mousedown', mouseDownEvt);

    const mouseUpEvt = (event: any) => {
        const diffX = Math.abs(event.pageX - startX);
        const diffY = Math.abs(event.pageY - startY);

        if (diffX < delta && diffY < delta) {
            callback(event);
        }
    };
    element.addEventListener('mouseup', mouseUpEvt);

    return () => {
        element.removeEventListener('mousedown', mouseDownEvt);
        element.removeEventListener('mouseup', mouseUpEvt);
    };

};

export { getAssetPath, getRootPath, addEventListenerOnClickOnly };
