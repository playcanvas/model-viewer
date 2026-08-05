const addEventListenerOnClickOnly = (element: HTMLElement, callback: (event: MouseEvent) => void, delta = 2) => {
    let startX: number;
    let startY: number;

    const mouseDownEvt = (event: MouseEvent) => {
        startX = event.pageX;
        startY = event.pageY;
    };
    element.addEventListener('mousedown', mouseDownEvt);

    const mouseUpEvt = (event: MouseEvent) => {
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
const extract = <T extends object>(obj: T, paths: string[]) => {
    const resolve = (obj: object, path: string[]) => {
        for (const p of path) {
            if (!Reflect.apply(obj.hasOwnProperty, obj, [p])) {
                return null;
            }
            obj = (obj as Record<string, unknown>)[p] as object;
        }
        return obj;
    };

    const result: Record<string, unknown> = {};

    for (const pathString of paths) {
        const path = pathString.split('.');
        const value = resolve(obj, path);

        let parent: Record<string, unknown> = result;
        for (let i = 0; i < path.length; ++i) {
            const p = path[i];
            if (i < path.length - 1) {
                if (!Reflect.apply(parent.hasOwnProperty, parent, [p])) {
                    parent[p] = {};
                }
                parent = parent[p] as Record<string, unknown>;
            } else {
                parent[p] = value;
            }
        }
    }

    return result;
};

export { addEventListenerOnClickOnly, extract };
