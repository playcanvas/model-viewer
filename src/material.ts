import {
    BLEND_NONE,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    Material
} from 'playcanvas';

let setBlendTypeOrig: any;

function setBlendType(type: number) {
    // set engine function
    setBlendTypeOrig.call(this, type);

    // tweak alpha blending
    switch (type) {
        case BLEND_NONE:
            break;
        default:
            this.separateAlphaBlend = true;
            this.blendSrcAlpha = BLENDMODE_ONE;
            this.blendDstAlpha = BLENDMODE_ONE_MINUS_SRC_ALPHA;
            break;
    }
}

// here we patch the material set blendType function to blend
// alpha correctly

const initMaterials = () => {
    const blendTypeDescriptor = Object.getOwnPropertyDescriptor(Material.prototype, 'blendType');

    // store the original setter
    setBlendTypeOrig = blendTypeDescriptor.set;

    // update the setter function
    Object.defineProperty(Material.prototype, 'blendType', {
        set(type) {
            setBlendType.call(this, type);
        },
        get() {
            return blendTypeDescriptor.get.call(this);
        }
    });
};

export {
    initMaterials
};
