import React from 'react';
import { Container, BooleanInput, Label, SliderInput, VectorInput, SelectInput } from 'pcui';
import { Option } from '../../types';

export const Detail = (props: { label: string, value:string|number}) => {
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label} />
        <Label class='panel-value' text={String(props.value)}/>
    </Container>;
};

export const Vector = (props: { label: string, value:any, dimensions: 2 | 3 | 4, enabled?: boolean}) => {
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label} />
        <VectorInput class='panel-value' dimensions={props.dimensions} enabled={props.enabled} value={props.value} precision={7} />
    </Container>;
};

export const Toggle = (props: { label: string, enabled?: boolean, setProperty: (value: boolean) => void, value: boolean }) => {
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label} />
        <BooleanInput class='panel-value-boolean' type='toggle' enabled={props.enabled} value={props.value} onChange={(value: boolean) => props.setProperty(value)} />
    </Container>;
};
Toggle.defaultProps = { enabled: true };

export const Slider = (props: { label: string, value: number, setProperty: (value: number) => void, precision: number, min: number, max: number, enabled?: boolean }) => {
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label} />
        <SliderInput class='panel-value' min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} enabled={props.enabled}
            onChange={(value: any) => {
                props.setProperty(value);
            }}
            value={props.value}
        />
    </Container>;
};
Slider.defaultProps = { enabled: true };

export const MorphSlider = (props: { value: number, setProperty: (value: number) => void, name: string, precision: number, min: number, max: number, label?: string, enabled?: boolean }) => {
    return <Container class='panel-option'>
        <Label class='morph-label' flexGrow={1} flexShrink={1} text={props.label ? props.label : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)} flex />
        <SliderInput class='morph-value' flexGrow={0} flexShrink={0} min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} enabled={props.enabled}
            onChange={(value: any) => {
                props.setProperty(value);
            }}
            value={props.value}
        />
    </Container>;
};
MorphSlider.defaultProps = { enabled: true };

export const Select = (props: { label: string, value:any, setProperty: (value: any) => void, type: 'string' | 'number' | 'boolean', options: Array<Option>, enabled?: boolean }) => {
    return <Container class='panel-option'>
        <Label class='panel-label' text={props.label} />
        <SelectInput class='panel-value' type={props.type} options={props.options} enabled={props.enabled} value={props.value}
            onChange={(value: any) => {
                props.setProperty(value);
            }}
        />
    </Container>;
};
Select.defaultProps = { enabled: true };

// naked versions
export const NakedSelect = (props: { value: any, setProperty: any, width: number, type: 'string' | 'number' | 'boolean', options: Array<Option>, enabled?: boolean, id?: string, class?: string }) => {
    return <SelectInput id={props.id} class={props.class} width={props.width} type={props.type} options={props.options} enabled={props.enabled} value={props.value}
        onChange={(value: any) => {
            props.setProperty(value);
        }}
    />;
};
NakedSelect.defaultProps = { enabled: true };

export const NakedSlider = (props: { value: any, setProperty: any, width: number, precision: number, min: number, max: number, enabled?: boolean, id?: string, class?: string }) => {
    return <SliderInput id={props.id} class={props.class} width={props.width} min={props.min} max={props.max} sliderMin={props.min} sliderMax={props.max} precision={props.precision} step={0.01} enabled={props.enabled} value={props.value}
        onChange={(value: any) => {
            props.setProperty(value);
        }}
    />;
};
NakedSlider.defaultProps = { enabled: true };
