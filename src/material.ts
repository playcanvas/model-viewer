import * as pc from 'playcanvas';

let setBlendTypeOrig: any;

function setBlendType(type: number) {
    // set engine function
    setBlendTypeOrig.call(this, type);

    // tweak alpha blending
    switch (type) {
        case pc.BLEND_NONE:
            break;
        default:
            this.separateAlphaBlend = true;
            this.blendSrcAlpha = pc.BLENDMODE_ONE;
            this.blendDstAlpha = pc.BLENDMODE_ONE_MINUS_SRC_ALPHA;
            break;
    }
}

// here we patch the material set blendType function to blend
// alpha correctly

const initMaterials = () => {
    const blendTypeDescriptor = Object.getOwnPropertyDescriptor(pc.Material.prototype, 'blendType');

    // store the original setter
    setBlendTypeOrig = blendTypeDescriptor.set;

    // update the setter function
    Object.defineProperty(pc.Material.prototype, 'blendType', {
        set(type) {
            setBlendType.call(this, type);
        }
    });
};

export {
    initMaterials
}
