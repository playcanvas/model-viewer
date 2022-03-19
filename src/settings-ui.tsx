import React, { useEffect, useState, useContext } from 'react';
import { Observer } from '@playcanvas/observer';
import { BindingTwoWay } from '@playcanvas/pcui';
import { Panel, Container, BooleanInput, Label, SliderInput, SelectInput } from '@playcanvas/pcui/react';

import { Option } from './types';

const ObserverContext = React.createContext(null);
const ObserverProvider = ObserverContext.Provider;

const useObserverState = (observer: Observer, path: string, json?: boolean) => {
    const parseFunc = (observerValue: any) => {
        return json ? JSON.parse(observerValue) : observerValue;
    };
    const [value, setValue] = useState(parseFunc(observer.get(path)));
    observer.on(`${path}:set`, value => setValue(parseFunc(value)));
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

const ShowPanel = () => {
    return (
        <Panel headerText='SHOW' collapsible>
            <Toggle name='stats' path='show.stats' />
            <Toggle name='wireframe' path='show.wireframe' />
            <Toggle name='bounds' path='show.bounds' />
            <Toggle name='skeleton' path='show.skeleton' />
            <Toggle name='axes' path='show.axes' />
            <Toggle name='grid' path='show.grid' />
            <Slider name='normals' precision={2} min={0} max={1} path='show.normals' />
            <Slider name='fov' precision={0} min={35} max={150} path='show.fov' />
        </Panel>
    );
};

const LightingPanel = () => {
    const observer: Observer = useContext(ObserverContext);
    const skyboxOptions: Array<Option> = useObserverState(observer, 'lighting.env.options', true);
    return (
        <Panel headerText='LIGHTING' collapsible>
            <Slider name='lightingDirect' precision={2} min={0} max={6} path='lighting.direct' label='Direct' />
            <Toggle name='lightingShadow' path='lighting.shadow' label='Shadow' />
            <Select name='lightingEnv' type='string' options={skyboxOptions} path='lighting.env.value' label='Environment' />
            <Select name='lightingSkyboxMip' type='number' options={[0, 1, 2, 3, 4, 5, 6].map(v => ({ v: v, t: v === 0 ? 'Disable' : Number(v - 1).toString() }))} path='lighting.env.skyboxMip' label='Skybox Level' />
            <Slider name='lightingEnv' precision={2} min={0} max={6} path='lighting.env.intensity' label='Intensity' />
            <Slider name='lightingRotation' precision={0} min={-180} max={180} path='lighting.rotation' label='Rotation' />
            <Select name='lightingTonemapping' type='string' options={['Linear', 'Filmic', 'Hejl', 'ACES'].map(v => ({ v, t: v }))} path='lighting.tonemapping' label='Tonemap' />
        </Panel>
    );
};

const SettingsControls = (props: { observer: Observer }) => {
    useEffect(() => {
        // set up the control panel toggle button
        const panelToggleDiv = document.getElementById('panel-toggle');
        const wrapper = document.getElementById('wrapper');
        panelToggleDiv.addEventListener('click', function () {
            wrapper.classList.toggle('collapsed');
            props.observer.emit('canvasResized');
        });
        if (document.body.clientWidth <= 600) {
            wrapper.classList.toggle('collapsed');
        }
    });
    return (
        <div id='controls'>
            <ObserverProvider value={props.observer}>
                <ShowPanel />
                <LightingPanel />
            </ObserverProvider>
        </div>
    );
};

export default SettingsControls;
