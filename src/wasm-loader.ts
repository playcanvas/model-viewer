// check for wasm module support
const wasmSupported = () => {
    try {
        if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
            const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
            if (module instanceof WebAssembly.Module)
                return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
        }
    } catch (e) { }
    return false;
};

// load a script
const loadScriptAsync = (url: string, doneCallback: () => void) => {
    const tag = document.createElement('script');
    tag.onload = () => {
        doneCallback();
    };
    tag.onerror = () => {
        throw new Error('failed to load ' + url);
    };
    tag.async = true;
    tag.src = url;
    document.head.appendChild(tag);
};

// load and initialize a wasm module
const loadWasmModuleAsync = (moduleName: string, jsUrl: string, binaryUrl: string, doneCallback: () => void) => {
    loadScriptAsync(jsUrl, () => {
        const lib = (window as any)[moduleName];
        (window as any)[moduleName + 'Lib'] = lib;
        lib({
            locateFile: () => {
                return binaryUrl;
            }
        }).then((instance: any) => {
            (window as any)[moduleName] = instance;
            doneCallback();
        });
    });
};

export { wasmSupported, loadScriptAsync, loadWasmModuleAsync };
