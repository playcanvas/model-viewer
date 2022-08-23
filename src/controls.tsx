import React, { useEffect, useState, useContext } from 'react';
import { Observer } from '@playcanvas/observer';
import { BindingTwoWay } from '@playcanvas/pcui';
import { Panel, Container, BooleanInput, Label, SliderInput, Button, TreeViewItem, TreeView, VectorInput, SelectInput, TextInput } from '@playcanvas/pcui/react';
import { Morph, Option, HierarchyNode } from './types';
import Viewer from './viewer';

const ObserverContext = React.createContext(null);
const ObserverProvider = ObserverContext.Provider;

class ObserverState {
    observer: Observer;
    observerSetFunctions: { [key: string]: any } = {};

    constructor(observer: Observer) {
        this.observer = observer;
    }

    useState(path: string, json?: boolean) {
        const parseFunc = (observerValue: any) => {
            return json ? JSON.parse(observerValue) : observerValue;
        };
        const [value, setValue] = useState(parseFunc(this.observer.get(path)));
        if (!this.observerSetFunctions[path]) {
            const func = (value: string | number | object) => {
                setValue(parseFunc(value));
            };
            this.observerSetFunctions[path] = func;
            this.observer.on(`${path}:set`, func);
        }
        return value;
    }
}

const Detail = (props: { name: string, path:string, label?: string, enabled?: boolean}) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <Label class='panel-value' link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled}/>
    </Container>;
};

const Vector = (props: { name: string, path:string, label?: string, dimensions: number, enabled?: boolean}) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <VectorInput class='panel-value' link={{ observer, path: props.path }} binding={new BindingTwoWay()} dimensions={props.dimensions} enabled={props.enabled}/>
    </Container>;
};

const Toggle = (props: { name: string, path:string, label?: string, enabled?: boolean}) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <BooleanInput class='panel-value-boolean' type='toggle' link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled}/>
    </Container>;
};
Toggle.defaultProps = { enabled: true };

const Slider = (props: { name: string, path:string, precision: number, min: number, max: number, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <SliderInput class='panel-value' min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
Slider.defaultProps = { enabled: true };

const MorphSlider = (props: { name: string, path:string, precision: number, min: number, max: number, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label class='morph-label' flexGrow={1} flexShrink={1} text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} flex />
        <SliderInput class='morph-value' flexGrow={0} flexShrink={0} min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
MorphSlider.defaultProps = { enabled: true };

const Select = (props: { name: string, path:string, type: string, options: Array<Option>, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <SelectInput class='panel-value' type={props.type} options={props.options} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
Select.defaultProps = { enabled: true };

// naked versions
const NakedSelect = (props: { width: number, path:string, type: string, options: Array<Option>, enabled?: boolean, id?: string, class?: string }) => {
    const observer: Observer = useContext(ObserverContext);
    return <SelectInput id={props.id} class={props.class} width={props.width} type={props.type} options={props.options} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />;
};
NakedSelect.defaultProps = { enabled: true };

const NakedSlider = (props: { width: number, path:string, precision: number, min: number, max: number, enabled?: boolean, id?: string, class?: string }) => {
    const observer: Observer = useContext(ObserverContext);
    return <SliderInput id={props.id} class={props.class} width={props.width} min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />;
};
NakedSlider.defaultProps = { enabled: true };

const ScenePanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const modelHierarchy: Array<HierarchyNode> = observerState.useState('scene.nodes', true);
    const morphTargets: Record<string, {name: string, morphs: Record<string, Morph>}> = observerState.useState('morphTargets');
    const enabled: boolean =  modelHierarchy.length > 0;
    const mapNodes = (nodes: Array<HierarchyNode>) => {
        return nodes.map((node:HierarchyNode) => <TreeViewItem text={`${node.name}`} key={node.path} onSelected={() => observer.set('scene.selectedNode.path', node.path)}>
            { mapNodes(node.children) }
        </TreeViewItem>);
    };
    return (
        <Container id='scene-container' flex>
            <Panel headerText='SCENE' flexShrink={0} flexGrow={0} collapsible >
                <Detail name='meshCount' label='Meshes' path='scene.meshCount'/>
                <Detail name='vertexCount' label='Verts' path='scene.vertexCount'/>
                <Detail name='primitiveCount' label='Primitives' path='scene.primitiveCount'/>
                <Vector name='bounds' label='Bounds' dimensions={3} path='scene.bounds' enabled={false}/>
            </Panel>
            <div id='scene-scrolly-bits'>
                <Panel headerText='HIERARCHY' class='scene-hierarchy-panel' enabled={enabled} collapsible>
                    { modelHierarchy.length > 0 &&
                        <TreeView allowReordering={false} allowDrag={false}>
                            { mapNodes(modelHierarchy) }
                        </TreeView>
                    }
                </Panel>
                { morphTargets && <Panel headerText='MORPH TARGETS' class='scene-morph-panel' collapsible>
                    {Object.keys(morphTargets).map((key) => {
                        const panel = morphTargets[key];
                        return (
                            <Panel key={`${key}.${panel.name}`} headerText={panel.name} collapsible class='morph-target-panel'>
                                {Object.keys(panel.morphs).map((morphKey) => {
                                    const morph: Morph = panel.morphs[morphKey];
                                    return <MorphSlider key={`${key}.${morphKey}`} name={`${morph.name}`} precision={2} min={0} max={1} path={`morphTargets.${key}.morphs.${morph.targetIndex}.weight`} />;
                                })}
                            </Panel>
                        );
                    })}
                </Panel> }
            </div>
        </Container>
    );
};

const toggleCollapsed = (observer: Observer) => {
    document.getElementById('panel-left').classList.toggle('collapsed');
    observer.emit('canvasResized');
};

const SceneControls = (props: { observer: Observer }) => {
    useEffect(() => {
        // set up the control panel toggle button
        const panelToggleDiv = document.getElementById('panel-toggle');
        panelToggleDiv.addEventListener('click', function () {
            toggleCollapsed(props.observer);
        });
        if (document.body.clientWidth <= 600) {
            toggleCollapsed(props.observer);
        }
    });
    return (
        <ObserverProvider value={props.observer}>
            <ScenePanel />
        </ObserverProvider>
    );
};

const SelectedNodePanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const hasHierarchy = observerState.useState('scene.nodes', true).length > 0;
    const nodeSelected = observerState.useState('scene.selectedNode.path');
    return hasHierarchy && nodeSelected ? (
        <div className='selected-node-panel-parent'>
            <Container class='selected-node-panel' flex>
                <Detail name='selectedNodeName' label='Name' path='scene.selectedNode.name'/>
                <Vector name='selectedNodePosition' label='Position' dimensions={3} path='scene.selectedNode.position' enabled={false}/>
                <Vector name='selectedNodeRotation' label='Rotation' dimensions={3} path='scene.selectedNode.rotation' enabled={false}/>
                <Vector name='selectedNodeScale' label='Scale' dimensions={3} path='scene.selectedNode.scale' enabled={false}/>
            </Container>
        </div>
    ) : <div></div>;
};

const SelectedNodeControls = (props: { observer: Observer }) => {
    return (
        <ObserverProvider value={props.observer}>
            <SelectedNodePanel />
        </ObserverProvider>
    );
};

const AnimationControls = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const playing: boolean = observerState.useState('animation.playing');
    const animationsList: Array<string> = observerState.useState('animation.list', true);
    const enabled: boolean =  animationsList.length > 0;

    let selectTrackOptions: Array<{ v: string, t: string }> = animationsList.map((animation: string) => ({ v: animation, t: animation }));
    if (selectTrackOptions.length > 1) {
        selectTrackOptions = [{ v: 'ALL_TRACKS', t: 'All tracks' }, ...selectTrackOptions];
        if (!animationsList.includes(observer.get('animation.selectedTrack'))) {
            observer.set('animation.selectedTrack', selectTrackOptions[0].v);
        }
    } else if (selectTrackOptions.length === 1) {
        observer.set('animation.selectedTrack', selectTrackOptions[0].v);
    }

    const speedOptions: Array<{ v: string, t: string }> = [
        { v: '0.25', t: '0.25x' },
        { v: '0.5',  t: '0.5x' },
        { v: '1',    t: '1x' },
        { v: '1.5',  t: '1.5x' },
        { v: '2',    t: '2x' }
    ];

    const allTracks: boolean = observerState.useState('animation.selectedTrack') === 'ALL_TRACKS';
    return enabled ? (
        <div className='animation-controls-panel-parent'>
            <Button class='anim-control-button' width={30} height={30} icon={ playing ? 'E376' : 'E286' } text='' onClick={() => observer.set('animation.playing', !observer.get('animation.playing'))} />
            <NakedSelect id='anim-track-select' width={160} type='string' options={selectTrackOptions} path='animation.selectedTrack' />
            <NakedSlider id='anim-scrub-slider' width={240} precision={2} min={0} max={1} path='animation.progress' enabled={!allTracks} />
            <NakedSelect id='anim-speed-select' width={60} type='string' options={speedOptions} path='animation.speed' />
            {/* { allTracks && <Slider name='animationTransition' precision={2} min={0} max={4} path='animation.transition' label='Transition' enabled={enabled} /> }
            { allTracks && <Select name='animationLoops' type='number' options={[1, 2, 3, 4].map(v => ({ v, t: Number(v).toString() }))} path='animation.loops' label='Loops' enabled={enabled} /> } */}
        </div>
    ) : <div></div>;
};

const PopupButtons = () => {
    const observer: Observer = useContext(ObserverContext);
    const handleClick = (value: string) => {
        observer.set('ui.active', observer.get('ui.active') === value ? null : value);
    };

    const observerState = new ObserverState(observer);
    const state = observerState.useState('ui.active');
    const buildClass = (value: string) => {
        return (state === value) ? ['popup-button', 'selected'] : 'popup-button';
    };

    return (
        <div id='popup-buttons-parent'>
            <AnimationControls />
            <Button class={buildClass('camera')} icon='E212' width={40} height={40} onClick={() => handleClick('camera')} />
            <Button class={buildClass('show')} icon='E188' width={40} height={40} onClick={() => handleClick('show')} />
            <Button class={buildClass('lighting')} icon='E192' width={40} height={40} onClick={() => handleClick('lighting')} />
            <Button class={buildClass('fullscreen')} icon='E127' width={40} height={40} onClick={() => toggleCollapsed(observer)} />
        </div>
    );
};

const PopupButtonControls = (props: { observer: Observer }) => {
    return (
        <ObserverProvider value={props.observer}>
            <PopupButtons />
        </ObserverProvider>
    );
};

const CameraPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const hidden = () => observerState.useState('ui.active') !== 'camera';
    const multisampleSupported: boolean = observerState.useState('render.multisampleSupported', true);
    const animationPlaying: boolean = observerState.useState('animation.playing');
    const statsShowing: boolean = observerState.useState('show.stats');
    return (
        <div className='popup-panel-parent'>
            <Container class='popup-panel' flex hidden={hidden()}>
                <Slider name='fov' precision={0} min={35} max={150} path='show.fov' />
                <Select name='lightingTonemapping' type='string' options={['Linear', 'Filmic', 'Hejl', 'ACES'].map(v => ({ v, t: v }))} path='lighting.tonemapping' label='Tonemap' />
                <Select name='pixelScale' path='render.pixelScale' label='Pixel Scale' type='number' options={[1, 2, 4, 8, 16].map(v => ({ v: v, t: Number(v).toString() }))} />
                <Toggle name='multisample' path='render.multisample' enabled={multisampleSupported}/>
                <Toggle name='hq' path='render.hq' label='High Quality' enabled={!animationPlaying && !statsShowing}/>
                <Toggle name='stats' path='show.stats' />
            </Container>
        </div>
    );
};

const ShowPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const hidden = () => observerState.useState('ui.active') !== 'show';
    return (
        <div className='popup-panel-parent'>
            <Container class='popup-panel' flex hidden={hidden()}>
                <Toggle name='grid' path='show.grid' />
                <Toggle name='wireframe' path='show.wireframe' />
                <Toggle name='axes' path='show.axes' />
                <Toggle name='skeleton' path='show.skeleton' />
                <Toggle name='bounds' path='show.bounds' />
                <Slider name='normals' precision={2} min={0} max={1} path='show.normals' />
            </Container>
        </div>
    );
};

const LightingPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const hidden = () => observerState.useState('ui.active') !== 'lighting';
    const skyboxOptions: Array<Option> = observerState.useState('lighting.env.options', true);
    return (
        <div className='popup-panel-parent'>
            <Container class='popup-panel' flex hidden={hidden()}>
                <Select name='lightingEnv' type='string' options={skyboxOptions} path='lighting.env.value' label='Environment' />
                <Select name='lightingSkyboxMip' type='number' options={[0, 1, 2, 3, 4, 5, 6].map(v => ({ v: v, t: v === 0 ? 'Disable' : Number(v - 1).toString() }))} path='lighting.env.skyboxMip' label='Skybox Level' />
                <Slider name='lightingExposure' precision={2} min={-6} max={6} path='lighting.env.exposure' label='Exposure' />
                <Slider name='lightingRotation' precision={0} min={-180} max={180} path='lighting.rotation' label='Rotation' />
                <Slider name='lightingDirect' precision={2} min={0} max={6} path='lighting.direct' label='Direct' />
                <Toggle name='lightingShadow' path='lighting.shadow' label='Shadow' />
            </Container>
        </div>
    );
};

const PopupPanelControls = (props: { observer: Observer }) => {
    return (
        <ObserverProvider value={props.observer}>
            <CameraPanel />
            <ShowPanel />
            <LightingPanel />
        </ObserverProvider>
    );
};

const DownloadButton = (props: { viewer: Viewer }) => {
    return (
        <div id='download-button-parent'>
            <Button class='download-button' icon='E228' width={40} height={40} onClick={() => window.viewer.downloadPngScreenshot()} />
        </div>
    );
}

export {
    SceneControls,
    SelectedNodeControls,
    PopupButtonControls,
    PopupPanelControls,
    DownloadButton
};
