// @ts-ignore: library file import
import { Container, BooleanInput, Label, SliderInput, SelectInput, Panel, Button, TreeViewItem, TreeView, VectorInput } from '@playcanvas/pcui/pcui-react';
// @ts-ignore: library file import
import { BindingTwoWay, useObserverState } from '@playcanvas/pcui/pcui-binding';
import React, { useEffect, useState, useContext } from 'react';
import { Morph, Option, Observer } from './types';

const ObserverContext = React.createContext(null);
const ObserverProvider = ObserverContext.Provider;

const useObserverState = (observer: Observer, path: string, json?: boolean) => {
    const parseFunc = (observerValue: any) => json ? JSON.parse(observerValue) : observerValue;
    const [value, setValue] = useState(parseFunc(observer.get(path)));
    observer.on(`${path}:set`, (value) => setValue(parseFunc(value)));
    return value;
};

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
        <SliderInput min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01}  link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
Slider.defaultProps = { enabled: true };

const Select = (props: { name: string, path:string, type: string, options: Array<Option>, label?: string, enabled?: boolean }) => {
    const observer: Observer = useContext(ObserverContext);
    return <Container class='panel-option'>
        <Label text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} />
        <SelectInput type={props.type} options={props.options} link={{ observer, path: props.path }} binding={new BindingTwoWay()} enabled={props.enabled} />
    </Container>;
};
Select.defaultProps = { enabled: true };

const ShowPanel = () => {
    return (
        <Panel headerText='SHOW' collapsible>
            <Toggle name='stats' path='show.stats' />
            <Toggle name='wireframe'  path='show.wireframe' />
            <Toggle name='bounds'  path='show.bounds' />
            <Toggle name='skeleton' path='show.skeleton' />
            <Slider name='normals' precision={2} min={0} max={1} path='show.normals' />
            <Slider name='fov' precision={0} min={35} max={150} path='show.fov' />
        </Panel>
    );
};

const LightingPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const skyboxOptions: Array<Option> = useObserverState(observer, 'lighting.skybox.options', true);
    return (
        <Panel headerText='LIGHTING' collapsible>
            <Slider name='lightingDirect' precision={2} min={0} max={6} path='lighting.direct' label='Direct' />
            <Slider name='lightingEnv' precision={2} min={0} max={6} path='lighting.env' label='Env' />
            <Select name='lightingTonemapping' type='string' options={['Linear', 'Filmic', 'Hejl', 'ACES'].map(v => ({ v, t: v }))} path='lighting.tonemapping' label='Tonemap' />
            <Select name='lightingSkybox' type='string' options={skyboxOptions} path='lighting.skybox.value' label='Skybox' />
            <Select name='lightingSkyboxMip' type='number' options={[0, 1, 2, 3, 4, 5, 6].map(v => ({ v, t: Number(v).toString() }))} path='lighting.skybox.mip' label='Mip' />
            <Slider name='lightingRotation' precision={0} min={-180} max={180} path='lighting.rotation' label='Rotation' />
        </Panel>
    );
};

const ModelPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const modelHierarchy: Array<any> = useObserverState(observer, 'model.nodes', true);
    const enabled: boolean =  modelHierarchy.length > 0;
    const mapNodes = (nodes: Array<any>) => {
        return nodes.map((node:any) => <TreeViewItem text={`${node.name}`} key={node.path} onSelected={() => observer.set('model.selectedNode.path', node.path)}>
            { mapNodes(node.children) }
        </TreeViewItem>);
    };
    return (
        <Panel headerText='MODEL' collapsible >
            <Detail name='vertexCount' label='Verts:' path='model.vertexCount'/>
            <Detail name='primitiveCount' label='Primitives:' path='model.primitiveCount'/>
            <Panel headerText='SELECTED NODE' collapsible class={'modelSelectedNodePanel'} enabled={enabled}>
                <Detail name='selectedNodeName' label='Name:' path='model.selectedNode.name'/>
                <Vector name='selectedNodePosition' label='Position:' dimensions={3} path='model.selectedNode.position' enabled={false}/>
                <Vector name='selectedNodeRotation' label='Rotation:' dimensions={4} path='model.selectedNode.rotation' enabled={false}/>
                <Vector name='selectedNodeScale' label='Scale:' dimensions={3} path='model.selectedNode.scale' enabled={false}/>
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
    const playing: boolean = useObserverState(observer, 'animation.playing');
    const animationsList: Array<string> = useObserverState(observer, 'animation.list', true);
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
    const allTracks: boolean = useObserverState(observer, 'animation.selectedTrack') === 'ALL_TRACKS';
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
            <Toggle name='animationGraph' path='animation.graphs' label='Graphs' enabled={enabled} />
        </Panel>
    );
};

const MorphPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const morphTargets: Record<string, {name: string, morphs: Record<string, Morph>}> = useObserverState(observer, 'morphTargets');
    if (!morphTargets) return null;
    return (
        <Panel headerText='MORPH TARGETS' collapsible>
            {Object.keys(morphTargets).map(key => {
                const panel = morphTargets[key];
                return (
                    <Panel key={panel.name} headerText={panel.name} collapsible class='morph-target-panel'>
                        {Object.keys(panel.morphs).map((morphKey) => {
                            const morph: Morph = panel.morphs[morphKey];
                            return <Slider  key={`${key}.${morphKey}`} name={Number(morph.targetIndex).toString()} precision={2} min={0} max={1} path={`morphTargets.${key}.morphs.${morph.targetIndex}.weight`} />;
                        })}
                    </Panel>
                );
            }
            )}
        </Panel>
    );
};

const Controls = (props: { observer: Observer }) => {
    useEffect(() => {
        // set up the control panel toggle button
        const panelToggleDiv = document.getElementById('panel-toggle');
        const panel = document.getElementById('panel');
        panelToggleDiv.addEventListener('click', function () {
            panel.classList.toggle('collapsed');
            props.observer.emit('canvasResized');
        });
        if (document.body.clientWidth <= 600) {
            panel.classList.toggle('collapsed');
        }
    });
    return (
        <div id='controls'>
            <ObserverProvider value={props.observer}>
                <ShowPanel />
                <LightingPanel />
                <ModelPanel />
                <AnimationPanel />
                <MorphPanel />
            </ObserverProvider>
        </div>
    );
};

export default Controls;
