import * as pcui from './lib/pcui.js';
import { http } from 'playcanvas';

// Build controls
var controlsDiv = document.getElementById('controls');

var buildToggle = function (name, label) {
    var toggleDom = {
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

var buildSlider = function (name, precision, min, max, value, label) {
    var sliderDom = {
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
        step: 0.01
    });
    sliderDom.children[1][name + 'Slider'].value = value;
    sliderDom.children[1][name + 'Slider'].precision = precision;
    return sliderDom;
};

var buildSelect = function (name, type, options, label) {
    var selectDom = {
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

var showPanelDom = function () {
    return [
        buildToggle('shiny', 'Shiny Ball'),
        buildToggle('stats'),
        buildToggle('wireframe'),
        buildToggle('bounds'),
        buildToggle('skeleton'),
        buildSlider('normals', 2, 0, 1, 0),
        buildSlider('fov', 0, 30, 150, 75)
    ];
};

var showPanel = new pcui.Panel({
    headerText: 'SHOW',
    collapsible: true
});

showPanel.buildDom(showPanelDom());

controlsDiv.append(showPanel.dom);

/* LIGHTING PANEL */

var lightingPanelDom = function () {
    return [
        buildSlider('direct', 2, 0, 6, 1),
        buildSlider('env', 2, 0, 6, 1)
    ];
};

var lightingPanel = new pcui.Panel({
    headerText: 'LIGHTING',
    collapsible: true
});

lightingPanel.buildDom(lightingPanelDom());

controlsDiv.append(lightingPanel.dom);

// populate select inputs with manifest assets
http.get(
    "asset_manifest.json",
    {
        cache: true,
        responseType: "text",
        retry: false
    },
    function (err, result) {      // eslint-disable-line no-unused-vars
        if (err) {
            console.warn(err);
        } else {
            var skyboxOptions = [{
                v: null, t: 'None'
            }];
            result.skyboxes.forEach(function (skybox) {
                skyboxOptions.push({ v: skybox.url, t: skybox.label });
            });
            lightingPanel.buildDom([buildSelect('skybox', 'string', skyboxOptions)]);

            lightingPanel._skyboxSelect.on('change', function (value) {
                if (value) {
                    viewer.load(value);
                } else {
                    viewer.clearSkybox();
                }
            });
        }
    }
);

/* ANIMATION PANEL */

var animationPanelDom = function () {
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
        buildSlider('speed', 2, 0, 2, 1),
        buildToggle('graphs')
    ];
};

var animationPanel = new pcui.Panel({
    headerText: 'ANIMATION',
    collapsible: true
});

animationPanel.buildDom(animationPanelDom());

controlsDiv.append(animationPanel.dom);

/* eslint-disable no-unused-vars */

// called when animations are loaded
export var onAnimationsLoaded = function (viewer, animationList) {
    if (animationPanel._animationList) {
        animationPanel.remove(animationPanel._animationList);
        delete animationPanel._animationList;
    }

    animationPanel._animationList = new pcui.Container({
        class: 'animation-list-container'
    });

    var theviewer = viewer;
    for (var i = 0; i < animationList.length; ++i) {
        var button = new pcui.Button({ text: animationList[i] });
        button.on('click', (function (animation) {
            return function () {
                theviewer.play(animation);
            };
        })(animationList[i]));
        animationPanel._animationList.append(button);
    }
    animationPanel.append(animationPanel._animationList);
};

/* MORPH TARGET PANEL */

var morphTargetPanel = new pcui.Panel({
    headerText: 'MORPH TARGETS',
    collapsible: true
});

controlsDiv.append(morphTargetPanel.dom);

export var onMorphTargetsLoaded = function (viewer, morphList) {

    if (morphTargetPanel._morphTargetList) {
        morphTargetPanel.remove(morphTargetPanel._morphTargetList);
        delete morphTargetPanel._morphTargetList;
    }

    if (morphList.length === 0) return;

    morphTargetPanel._morphTargetList = new pcui.Container({
        class: 'morph-target-list-container'
    });


    var theviewer = viewer;
    var currentMeshPanel;
    for (var i = 0; i < morphList.length; ++i) {
        var morph = morphList[i];
        if (!Number.isFinite(morph.weight)) {
            currentMeshPanel = new pcui.Panel({
                headerText: morph.name,
                collapsible: true,
                class: 'morph-target-panel'
            });
            morphTargetPanel._morphTargetList.append(currentMeshPanel);
        } else {
            var morphTargetContainer = new pcui.Container();
            morphTargetContainer.buildDom([buildSlider(morph.name, 2, 0, 1, morph.weight)]);
            morphTargetContainer['_' + morph.name + 'Slider'].on('change', (function (morph) {
                return function () {
                    theviewer.setMorphWeight(morph, this.value);
                };
            })(morph.name));
            morphTargetContainer['_' + morph.name + 'SliderLabel'].class.add('morph-target-label');
            currentMeshPanel.append(morphTargetContainer);
        }
    }
    morphTargetPanel.append(morphTargetPanel._morphTargetList);
    document.getElementById('panel').style.overflowY = 'scroll';
};

export var onSceneReset = function () {
    if (morphTargetPanel._morphTargetList) {
        morphTargetPanel.remove(morphTargetPanel._morphTargetList);
        delete morphTargetPanel._morphTargetList;
    }
    document.getElementById('panel').style.overflowY = 'overlay';
};

export var registerElementEvents = function (viewer) {
    // Show events
    showPanel._shinyToggle.on('change', function (value) {
        viewer.setShowShinyBall(value);
    });
    showPanel._statsToggle.on('change', function (value) {
        viewer.setStats(value);
    });
    showPanel._wireframeToggle.on('change', function (value) {
        viewer.setShowWireframe(value);
    });
    showPanel._boundsToggle.on('change', function (value) {
        viewer.setShowBounds(value);
    });
    showPanel._skeletonToggle.on('change', function (value) {
        viewer.setShowSkeleton(value);
    });
    showPanel._normalsSlider.on('change', function (value) {
        viewer.setNormalLength(Number.parseFloat(value));
    });
    showPanel._fovSlider.on('change', function (value) {
        viewer.setFov(Number.parseFloat(value));
    });

    // Lighting events
    lightingPanel._directSlider.on('change', function (value) {
        viewer.setDirectLighting(Number.parseFloat(value));
    });
    lightingPanel._envSlider.on('change', function (value) {
        viewer.setEnvLighting(Number.parseFloat(value));
    });

    // Animation events
    animationPanel._playButton.on('click', function () {
        viewer.play();
    });
    animationPanel._stopButton.on('click', function () {
        viewer.stop();
    });
    animationPanel._speedSlider.on('change', function (value) {
        viewer.setSpeed(Number.parseFloat(value));
    });
    animationPanel._graphsToggle.on('change', function (value) {
        viewer.setShowGraphs(value);
    });
};

// /* eslint-enable no-unused-vars */
