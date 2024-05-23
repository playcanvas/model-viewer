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

// extract members of the object given a list of paths to extract
const extract = (obj: any, paths: string[]) => {

    const resolve = (obj: any, path: string[]) => {
        for (const p of path) {
            if (!obj.hasOwnProperty(p)) {
                return null;
            }
            obj = obj[p];
        }
        return obj;
    };

    const result: any = { };

    for (const pathString of paths) {
        const path = pathString.split('.');
        const value = resolve(obj, path);

        let parent = result;
        for (let i = 0; i < path.length; ++i) {
            const p = path[i];
            if (i < path.length - 1) {
                if (!parent.hasOwnProperty(p)) {
                    parent[p] = { };
                }
                parent = parent[p];
            } else {
                parent[p] = value;
            }
        }
    }

    return result;
};

export { addEventListenerOnClickOnly, extract };
