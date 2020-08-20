// @ts-ignore: library file import
import * as pcui from 'lib/pcui.js';
import { getAssetPath } from './helpers';
import * as pc from 'playcanvas';
import Viewer from './viewer.js';

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

showPanel.buildDom(showPanelDom());

controlsDiv.append(showPanel.dom);

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

lightingPanel.buildDom(lightingPanelDom());

controlsDiv.append(lightingPanel.dom);

// populate select inputs with manifest assets

interface Skybox {
    url: string,
    label: string
}

interface SkyboxOption {
    v: string | null,
    t: string
}

new pc.Http().get(
    getAssetPath("asset_manifest.json"),
    {
        cache: true,
        responseType: "text",
        retry: false
    },
    function (err: string, result: { skyboxes: Array<Skybox> }) {
        if (err) {
            console.warn(err);
        } else {
            const skyboxOptions: Array<SkyboxOption> = [{
                v: null, t: 'None'
            }];
            result.skyboxes.forEach(function (skybox: Skybox ) {
                skyboxOptions.push({ v: getAssetPath(skybox.url), t: skybox.label });
            });
            lightingPanel.buildDom([buildSelect('skybox', 'string', skyboxOptions)]);

            lightingPanel._skyboxSelect.on('change', function (value: string) {
                if (value) {
                    // @ts-ignore: Global viewer
                    window.viewer.load(value);
                } else {
                    // @ts-ignore: Global viewer
                    viewer.clearSkybox();
                }
            });
        }
    }
);

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

animationPanel.buildDom(animationPanelDom());

controlsDiv.append(animationPanel.dom);

// called when animations are loaded
export const onAnimationsLoaded = function (viewer: any, animationList: Array<string>) {
    if (animationPanel._animationList) {
        animationPanel.remove(animationPanel._animationList);
        delete animationPanel._animationList;
    }

    animationPanel._animationList = new pcui.Container({
        class: 'animation-list-container'
    });

    const theviewer = viewer;
    for (let i = 0; i < animationList.length; ++i) {
        const button = new pcui.Button({ text: animationList[i] });
        button.on('click', (function (animation) {
            return function (evt: { shiftKey: string }) {
                theviewer.play(animation, evt.shiftKey);
            };
        })(animationList[i]));
        animationPanel._animationList.append(button);
    }
    animationPanel.append(animationPanel._animationList);
};

/* MORPH TARGET PANEL */

const morphTargetPanel = new pcui.Panel({
    headerText: 'MORPH TARGETS',
    collapsible: true
});

controlsDiv.append(morphTargetPanel.dom);

interface Morph {
    name: string,
    getWeight?: () => number,
    setWeight?: (weight: number) => void,
    onWeightChanged: () => void
}

export const onMorphTargetsLoaded = function (viewer: Viewer, morphList: Array<Morph>) {

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

export const onSceneReset = function () {
    if (morphTargetPanel._morphTargetList) {
        morphTargetPanel.remove(morphTargetPanel._morphTargetList);
        delete morphTargetPanel._morphTargetList;
    }
    document.getElementById('panel').style.overflowY = 'overlay';
};

export const registerElementEvents = function (viewer: any) {
    showPanel._statsToggle.on('change', function (value: string) {
        viewer.setStats(value);
    });
    showPanel._wireframeToggle.on('change', function (value: string) {
        viewer.setShowWireframe(value);
    });
    showPanel._boundsToggle.on('change', function (value: string) {
        viewer.setShowBounds(value);
    });
    showPanel._skeletonToggle.on('change', function (value: string) {
        viewer.setShowSkeleton(value);
    });
    showPanel._normalsSlider.on('change', function (value: string) {
        viewer.setNormalLength(Number.parseFloat(value));
    });
    showPanel._fovSlider.on('change', function (value: string) {
        viewer.setFov(Number.parseFloat(value));
    });

    // Lighting events
    lightingPanel._directSlider.on('change', function (value: string) {
        viewer.setDirectLighting(Number.parseFloat(value));
    });
    lightingPanel._envSlider.on('change', function (value: string) {
        viewer.setEnvLighting(Number.parseFloat(value));
    });

    // Animation events
    animationPanel._playButton.on('click', function () {
        viewer.play();
    });
    animationPanel._stopButton.on('click', function () {
        viewer.stop();
    });
    animationPanel._speedSlider.on('change', function (value: string) {
        viewer.setSpeed(Number.parseFloat(value));
    });
    animationPanel._graphsToggle.on('change', function (value: string) {
        viewer.setShowGraphs(value);
    });
    // Build panel toggle
    const panelToggleDiv = document.getElementById('panel-toggle');
    panelToggleDiv.addEventListener('click', function () {
        const panel = document.getElementById('panel');
        panel.classList.toggle('collapsed');
        viewer.resizeCanvas();
    });
};
