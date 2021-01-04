// @ts-ignore: library file import
import { Container, BooleanInput, Label, SliderInput, SelectInput, Panel, Button } from '@playcanvas/pcui/pcui-react';
// @ts-ignore: library file import
import { BindingTwoWay, useObserverState } from '@playcanvas/pcui/pcui-binding';
import React, { useEffect, useState, useContext } from 'react';
import { ProgressPlugin } from 'webpack';
import { Morph, Option, Observer } from './types';

const ObserverContext = React.createContext(null);
const ObserverProvider = ObserverContext.Provider;

const useObserverState = (observer: Observer, path: string, json?: boolean) => {
    const parseFunc = (observerValue: any) => json ? JSON.parse(observerValue) : observerValue;
    const [value, setValue] = useState(parseFunc(observer.get(path)));
    observer.on(`${path}:set`, (value) => setValue(parseFunc(value)));
    return value;
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

const AnimationPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const playing: boolean = useObserverState(observer, 'animation.playing');
    const animationsList: Array<string> = useObserverState(observer, 'animation.list', true);
    const enabled =  animationsList.length > 0;
    return (
        <Panel headerText='ANIMATION' collapsible>
            <Container class='panel-option'>
                <Button icon={ playing ? 'E376' : 'E286' } text='' onClick={() => observer.set('animation.playing', !observer.get('animation.playing'))} enabled={enabled} />
            </Container>
            <Slider name='animationSpeed' precision={2} min={0} max={4} path='animation.speed' label='Speed' enabled={enabled} />
            <Slider name='animationTransition' precision={2} min={0} max={4} path='animation.transition' label='Transition' enabled={enabled} />
            <Select name='animationLoops' type='number' options={[1, 2, 3, 4].map(v => ({ v, t: Number(v).toString() }))} path='animation.loops' label='Loops' enabled={enabled} />
            <Toggle name='animationGraph' path='animation.graphs' label='Graphs' enabled={enabled} />
            <Container>
                {animationsList.map((animation: string) => <Container key={animation} class='panel-option'><Button text={animation} onClick={() => observer.set('animation.playAnimation', animation)}></Button></Container>)}
            </Container>
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
                <AnimationPanel />
                <MorphPanel />
            </ObserverProvider>
        </div>
    );
};

export default Controls;
