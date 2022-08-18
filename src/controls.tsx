import React, { useEffect, useState, useContext } from 'react';
import { Observer } from '@playcanvas/observer';
import { BindingTwoWay } from '@playcanvas/pcui';
import { Panel, Container, BooleanInput, Label, SliderInput, Button, TreeViewItem, TreeView, VectorInput, SelectInput } from '@playcanvas/pcui/react';

import { Morph, Option, HierarchyNode } from './types';

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
        <Label text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <Label link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled}/>
    </Container>;
};

const Vector = (props: { name: string, path:string, label?: string, dimensions: number, enabled?: boolean}) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <VectorInput link={{ observer, path: props.path }} binding={new BindingTwoWay()} dimensions={props.dimensions} enabled={props.enabled}/>
    </Container>;
};

const Toggle = (props: { name: string, path:string, label?: string, enabled?: boolean}) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <BooleanInput type='toggle' link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled}/>
    </Container>;
};
Toggle.defaultProps = { enabled: true };

const Slider = (props: { name: string, path:string, precision: number, min: number, max: number, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <SliderInput min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
Slider.defaultProps = { enabled: true };

const MorphSlider = (props: { name: string, path:string, precision: number, min: number, max: number, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label flexGrow={1} text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} flex />
        <SliderInput flexGrow={0} flexShrink={0} min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
MorphSlider.defaultProps = { enabled: true };

const Select = (props: { name: string, path:string, type: string, options: Array<Option>, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <SelectInput type={props.type} options={props.options} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
Select.defaultProps = { enabled: true };

const ScenePanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const modelHierarchy: Array<HierarchyNode> = observerState.useState('scene.nodes', true);
    const enabled: boolean =  modelHierarchy.length > 0;
    const mapNodes = (nodes: Array<HierarchyNode>) => {
        return nodes.map((node:HierarchyNode) => <TreeViewItem text={`${node.name}`} key={node.path} onSelected={() => observer.set('scene.selectedNode.path', node.path)}>
            { mapNodes(node.children) }
        </TreeViewItem>);
    };
    return (
        <Panel headerText='SCENE' collapsible >
            <Detail name='meshCount' label='Meshes' path='scene.meshCount'/>
            <Detail name='vertexCount' label='Verts' path='scene.vertexCount'/>
            <Detail name='primitiveCount' label='Primitives' path='scene.primitiveCount'/>
            <Vector name='bounds' label='Bounds' dimensions={3} path='scene.bounds' enabled={false}/>
            <Panel headerText='SELECTED NODE' collapsible class={'modelSelectedNodePanel'} enabled={enabled}>
                <Detail name='selectedNodeName' label='Name' path='scene.selectedNode.name'/>
                <Vector name='selectedNodePosition' label='Position' dimensions={3} path='scene.selectedNode.position' enabled={false}/>
                <Vector name='selectedNodeRotation' label='Rotation' dimensions={3} path='scene.selectedNode.rotation' enabled={false}/>
                <Vector name='selectedNodeScale' label='Scale' dimensions={3} path='scene.selectedNode.scale' enabled={false}/>
            </Panel>
            <Panel headerText='HIERARCHY' collapsible class={'modelHierarchyPanel'} enabled={enabled}>
                { modelHierarchy.length > 0 &&
                    <TreeView allowReordering={false} allowDrag={false}>
                        { mapNodes(modelHierarchy) }
                    </TreeView>
                }
            </Panel>
        </Panel>
    );
};

const AnimationPanel = () => {
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
    const allTracks: boolean = observerState.useState('animation.selectedTrack') === 'ALL_TRACKS';
    return (
        <Panel headerText='ANIMATION' collapsible>
            <Select name='animationTrack' type='string' options={selectTrackOptions} path='animation.selectedTrack' label='Track' enabled={enabled} />
            <Container class='panel-option'>
                <Button icon={ playing ? 'E376' : 'E286' } text='' onClick={() => observer.set('animation.playing', !observer.get('animation.playing'))} enabled={enabled} />
            </Container>
            <Slider name='animationSpeed' precision={2} min={0} max={4} path='animation.speed' label='Speed' enabled={enabled} />
            { !allTracks && <Slider name='animationFrameTimeline' precision={2} min={0} max={1} path='animation.progress' label='Timeline' enabled={enabled} /> }
            { allTracks && <Slider name='animationTransition' precision={2} min={0} max={4} path='animation.transition' label='Transition' enabled={enabled} /> }
            { allTracks && <Select name='animationLoops' type='number' options={[1, 2, 3, 4].map(v => ({ v, t: Number(v).toString() }))} path='animation.loops' label='Loops' enabled={enabled} /> }
        </Panel>
    );
};

const MorphPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const observerState = new ObserverState(observer);
    const morphTargets: Record<string, {name: string, morphs: Record<string, Morph>}> = observerState.useState('morphTargets');
    if (!morphTargets) return null;
    return (
        <Panel headerText='MORPH TARGETS' collapsible>
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
            }
            )}
        </Panel>
    );
};

const toggleCollapsed = () => {
    document.getElementById('wrapper-left').classList.toggle('collapsed');
    // document.getElementById('wrapper-right').classList.toggle('collapsed');
};

const Controls = (props: { observer: Observer }) => {
    useEffect(() => {
        // set up the control panel toggle button
        const panelToggleDiv = document.getElementById('panel-toggle');
        panelToggleDiv.addEventListener('click', function () {
            toggleCollapsed();
            props.observer.emit('canvasResized');
        });
        if (document.body.clientWidth <= 600) {
            toggleCollapsed();
        }
    });
    return (
        <div id='controls-left'>
            <ObserverProvider value={props.observer}>
                <AnimationPanel />
                <ScenePanel />
                <MorphPanel />
            </ObserverProvider>
        </div>
    );
};

const PopupButtons = () => {
    const observer: Observer = useContext(ObserverContext);
    const handleClick = (value: string) => {
        observer.set('ui.active', observer.get('ui.active') === value ? null : value);
    };

    const observerState = new ObserverState(observer);
    const state = observerState.useState('ui.active');
    const buildClass = (value: string) => {
        console.log(`${value}=${state}`);
        return (state === value) ? 'popup-button-selected' : 'popup-button';
    };

    return (
        <div className='popup-buttons-parent'>
            <Button class={buildClass('camera')} icon='E212' width={40} height={40} onClick={() => handleClick('camera')} />
            <Button class={buildClass('show')} icon='E410' width={40} height={40} onClick={() => handleClick('show')} />
            <Button class={buildClass('lighting')} icon='E192' width={40} height={40} onClick={() => handleClick('lighting')} />
            <Button class={buildClass('fullscreen')} icon='E127' width={40} height={40} onClick={() => toggleCollapsed()} />
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
    return (
        <div className='popup-panel-parent'>
            <Container class='popup-panel' flex hidden={hidden()}>
                <Slider name='fov' precision={0} min={35} max={150} path='show.fov' />
                <Select name='lightingTonemapping' type='string' options={['Linear', 'Filmic', 'Hejl', 'ACES'].map(v => ({ v, t: v }))} path='lighting.tonemapping' label='Tonemap' />
                <Toggle name='multisample' path='render.multisample' enabled={multisampleSupported}/>
                <Toggle name='hq' path='render.hq' label='High Quality' />
                <Select name='pixelScale' path='render.pixelScale' label='Pixel Scale' type='number' options={[1, 2, 4, 8, 16].map(v => ({ v: v, t: Number(v).toString() }))} />
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
                <Toggle name='stats' path='show.stats' />
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
                <Slider name='lightingExposure' precision={2} min={-6} max={6} path='lighting.env.exposure' label='Exposure' />
                <Slider name='lightingRotation' precision={0} min={-180} max={180} path='lighting.rotation' label='Rotation' />
                <Select name='lightingSkyboxMip' type='number' options={[0, 1, 2, 3, 4, 5, 6].map(v => ({ v: v, t: v === 0 ? 'Disable' : Number(v - 1).toString() }))} path='lighting.env.skyboxMip' label='Skybox Level' />
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

export {
    Controls,
    PopupButtonControls,
    PopupPanelControls
};
