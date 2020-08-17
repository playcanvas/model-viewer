import * as pcui from '../lib/pcui.js';
import { getAssetPath } from './helpers';

// controls interface linking to the rest of the application

export class Controls {
    // -- events eminating from controls
    onShowStats: (show: boolean) => void;
    onShowWireframe: (show: boolean) => void;
    onShowBounds: (show: boolean) => void;
    onShowSkeleton: (show: boolean) => void;
    onNormalLength: (length: number) => void;
    onFov: (fov: number) => void;

    onDirectLighting: (value: number) => void;
    onEnvLighting: (value: number) => void;
    onSkyboxMip: (value: number) => void;

    onPlay: () => void;
    onPlayAnimation: (animation: string, appendAnimation: boolean) => void;
    onStop: () => void;
    onSpeed: (speed: number) => void;
    onShowGraphs: (show: boolean) => void;

    onCanvasResized: () => void;

    onLoad: (filename: string) => void;
    onClearSkybox: () => void;

    // -- events eminating from viewer
    animationsLoaded(animationList: Array<string>) {
        // eslint-disable-next-line no-use-before-define
        onAnimationsLoaded(animationList);
    }

    morphTargetsLoaded(morphList: Array<Morph>) {
        // eslint-disable-next-line no-use-before-define
        onMorphTargetsLoaded(morphList);
    }

    resetScene() {
        // eslint-disable-next-line no-use-before-define
        onSceneReset();
    }

    setShowSkeleton(show: boolean) {
        // eslint-disable-next-line no-use-before-define
        showPanel._skeletonToggle.value = show;
    }
}

let controls : Controls = null;

// Build controls
const controlsDiv = document.getElementById('controls');

interface ControlDom {
    root: any,
    children: Array<any>
}

const buildToggle = function (name: string, label?: string) {
    const toggleDom: ControlDom = {
        root: {},
        children: [
            {}, {}
        ]
    };
    toggleDom.root[name + 'ToggleContainer'] = new pcui.Container({
        class: 'panel-option'
    });
    toggleDom.children[0][name + 'ToggleLabel'] = new pcui.Label({
        text: label ? label : name.substring(0, 1).toUpperCase() + name.substring(1, name.length)
    });
    toggleDom.children[1][name + 'Toggle'] = new pcui.BooleanInput({
        type: 'toggle'
    });
    return toggleDom;
};

const buildSlider = function (name: string, precision: number, min: number, max: number, value: number, label?: number) {
    const sliderDom: ControlDom = {
        root: {},
        children: [
            {}, {}
        ]
    };
    sliderDom.root[name + 'SliderContainer'] = new pcui.Container({
        class: 'panel-option'
    });
    sliderDom.children[0][name + 'SliderLabel'] = new pcui.Label({
        text: label ? label : name.substring(0, 1).toUpperCase() + name.substring(1, name.length)
    });
    sliderDom.children[1][name + 'Slider'] = new pcui.SliderInput({
        min: min,
        max: max,
        sliderMin: min,
        sliderMax: max,
        step: 0.01,
        precision: precision
    });
    sliderDom.children[1][name + 'Slider'].value = value;
    sliderDom.children[1][name + 'Slider'].precision = precision;
    return sliderDom;
};

const buildSelect = function (name: string, type: string, options: Record<any, any>, label?: string) {
    const selectDom: ControlDom = {
        root: {},
        children: [
            {}, {}
        ]
    };
    selectDom.root[name + 'SelectContainer'] = new pcui.Container({
        class: 'panel-option'
    });
    selectDom.children[0][name + 'SelectLabel'] = new pcui.Label({
        text: label ? label : name.substring(0, 1).toUpperCase() + name.substring(1, name.length)
    });
    selectDom.children[1][name + 'Select'] = new pcui.SelectInput({
        type: type,
        options: options
    });
    return selectDom;
};

/* SHOW PANEL */

const showPanelDom = function () {
    return [
        buildToggle('stats'),
        buildToggle('wireframe'),
        buildToggle('bounds'),
        buildToggle('skeleton'),
        buildSlider('normals', 2, 0, 1, 0),
        buildSlider('fov', 0, 30, 150, 75)
    ];
};

const showPanel = new pcui.Panel({
    headerText: 'SHOW',
    collapsible: true
});

const initShowPanel = function () {
    showPanel.buildDom(showPanelDom());
    controlsDiv.append(showPanel.dom);

    // Show events
    showPanel._statsToggle.on('change', function (value: string) {
        controls.onShowStats(!!value);
    });
    showPanel._wireframeToggle.on('change', function (value: string) {
        controls.onShowWireframe(!!value);
    });
    showPanel._boundsToggle.on('change', function (value: string) {
        controls.onShowBounds(!!value);
    });
    showPanel._skeletonToggle.on('change', function (value: string) {
        controls.onShowSkeleton(!!value);
    });
    showPanel._normalsSlider.on('change', function (value: string) {
        controls.onNormalLength(Number.parseFloat(value));
    });
    showPanel._fovSlider.on('change', function (value: string) {
        controls.onFov(Number.parseFloat(value));
    });
};

/* LIGHTING PANEL */

const lightingPanelDom = function () {
    return [
        buildSlider('direct', 2, 0, 6, 1),
        buildSlider('env', 2, 0, 6, 1)
    ];
};

const lightingPanel = new pcui.Panel({
    headerText: 'LIGHTING',
    collapsible: true
});

// populate select inputs with manifest assets

export interface Skybox {
    url: string,
    label: string
}

let skyboxes : Skybox[];
let defaultSkybox: string;

export const setSkyboxes = function ( data: { skyboxes: Array<Skybox>, defaultSkybox: string } ) {
    skyboxes = data.skyboxes;
    defaultSkybox = data.defaultSkybox;
};

interface SkyboxOption {
    v: string | null,
    t: string
}

const initLightingPanel = function () {
    // lighting
    lightingPanel.buildDom(lightingPanelDom());
    controlsDiv.append(lightingPanel.dom);

    // skybox
    const skyboxOptions: Array<SkyboxOption> = [{
        v: null, t: 'None'
    }];
    skyboxes.forEach(function (skybox: Skybox ) {
        skyboxOptions.push({ v: getAssetPath(skybox.url), t: skybox.label });
    });
    lightingPanel.buildDom([buildSelect('skybox', 'string', skyboxOptions)]);
    lightingPanel._skyboxSelect.on('change', function (value: string) {
        if (value) {
            controls.onLoad(value);
        } else {
            controls.onClearSkybox();
        }
    });

    // skybox mip
    const skyboxMipOptions: Array<SkyboxOption> = [
        { v: "0", t: "0" },
        { v: "1", t: "1" },
        { v: "2", t: "2" },
        { v: "3", t: "3" },
        { v: "4", t: "4" },
        { v: "5", t: "5" },
        { v: "6", t: "6" }
    ];
    lightingPanel.buildDom([buildSelect('skyboxMip', 'string', skyboxMipOptions, 'Mip')]);
    lightingPanel._skyboxMipSelect.on('change', function (value: string) {
        controls.onSkyboxMip(Number.parseFloat(value));
    });

    // Lighting events
    lightingPanel._directSlider.on('change', function (value: string) {
        controls.onDirectLighting(Number.parseFloat(value));
    });
    lightingPanel._envSlider.on('change', function (value: string) {
        controls.onEnvLighting(Number.parseFloat(value));
    });
};

/* ANIMATION PANEL */

const animationPanelDom = function () {
    return [
        {
            root: {
                buttonContainer: new pcui.Container({
                    class: 'animation-buttons'
                })
            },
            children: [
                {
                    playButton: new pcui.Button({
                        icon: 'E286'
                    })
                },
                {
                    stopButton: new pcui.Button({
                        icon: 'E376'
                    })
                }
            ]
        },
        buildSlider('speed', 2, 0, 4, 1),
        buildToggle('graphs')
    ];
};

const animationPanel = new pcui.Panel({
    headerText: 'ANIMATION',
    collapsible: true
});

const initAnimationPanel = function () {
    animationPanel.buildDom(animationPanelDom());
    controlsDiv.append(animationPanel.dom);

    // Animation events
    animationPanel._playButton.on('click', function () {
        controls.onPlay();
    });
    animationPanel._stopButton.on('click', function () {
        controls.onStop();
    });
    animationPanel._speedSlider.on('change', function (value: string) {
        controls.onSpeed(Number.parseFloat(value));
    });
    animationPanel._graphsToggle.on('change', function (value: string) {
        controls.onShowGraphs(!!value);
    });
};

// called when animations are loaded
const onAnimationsLoaded = function (animationList: Array<string>) {
    if (animationPanel._animationList) {
        animationPanel.remove(animationPanel._animationList);
        delete animationPanel._animationList;
    }

    animationPanel._animationList = new pcui.Container({
        class: 'animation-list-container'
    });

    for (let i = 0; i < animationList.length; ++i) {
        const button = new pcui.Button({ text: animationList[i] });
        button.on('click', (function (animation, controls) {
            return function (evt: { shiftKey: string }) {
                controls.onPlayAnimation(animation, !!evt.shiftKey);
            };
        })(animationList[i], controls));
        animationPanel._animationList.append(button);
    }
    animationPanel.append(animationPanel._animationList);
};

/* MORPH TARGET PANEL */

export interface Morph {
    name: string,
    getWeight?: () => number,
    setWeight?: (weight: number) => void,
    onWeightChanged: () => void
}

const morphTargetPanel = new pcui.Panel({
    headerText: 'MORPH TARGETS',
    collapsible: true
});

const initMorphPanel = function () {
    controlsDiv.append(morphTargetPanel.dom);
};

const onMorphTargetsLoaded = function (morphList: Array<Morph>) {

    if (morphTargetPanel._morphTargetList) {
        morphTargetPanel.remove(morphTargetPanel._morphTargetList);
        delete morphTargetPanel._morphTargetList;
    }

    if (morphList.length === 0) return;

    morphTargetPanel._morphTargetList = new pcui.Container({
        class: 'morph-target-list-container'
    });

    let currentMeshPanel;
    for (let i = 0; i < morphList.length; ++i) {
        const morph: Morph = morphList[i];
        if (morph.hasOwnProperty('getWeight')) {
            const morphTargetContainer = new pcui.Container();
            morphTargetContainer.buildDom([buildSlider(morph.name, 24, 0, 1, morph.getWeight())]);
            const slider = morphTargetContainer['_' + morph.name + 'Slider'];
            slider.on('change', (value: number) => {
                if (value !== morph.getWeight()) {
                    morph.setWeight(value);
                }
            });
            morph.onWeightChanged = function (morph: Morph) {
                this.value = morph.getWeight();
            }.bind(slider, morph);
            morphTargetContainer['_' + morph.name + 'SliderLabel'].class.add('morph-target-label');
            currentMeshPanel.append(morphTargetContainer);
        } else {
            currentMeshPanel = new pcui.Panel({
                headerText: morph.name,
                collapsible: true,
                class: 'morph-target-panel'
            });
            morphTargetPanel._morphTargetList.append(currentMeshPanel);
        }
    }
    morphTargetPanel.append(morphTargetPanel._morphTargetList);
    document.getElementById('panel').style.overflowY = 'scroll';
};

const onSceneReset = function () {
    if (morphTargetPanel._morphTargetList) {
        morphTargetPanel.remove(morphTargetPanel._morphTargetList);
        delete morphTargetPanel._morphTargetList;
    }
    document.getElementById('panel').style.overflowY = 'overlay';
};

// init controls given callback functions

export const initControls = function (controls_: Controls) {
    // store controls interface
    controls = controls_;

    // init panels
    initShowPanel();
    initLightingPanel();
    initAnimationPanel();
    initMorphPanel();

    // set the defaults
    lightingPanel._skyboxSelect.value = getAssetPath(defaultSkybox);
    lightingPanel._skyboxMipSelect.value = 1;

    // Build panel toggle
    const panelToggleDiv = document.getElementById('panel-toggle');
    panelToggleDiv.addEventListener('click', function () {
        const panel = document.getElementById('panel');
        panel.classList.toggle('collapsed');
        controls.onCanvasResized();
    });
};
