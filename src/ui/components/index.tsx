import {
    BooleanInput,
    ColorPicker,
    Container,
    Label,
    SelectInput,
    SliderInput,
    VectorInput,
    NumericInput
} from '@playcanvas/pcui/react';
import React from 'react';

import type { Option } from '../../types';

export const Detail = (props: { label: string; value: string | number }) => {
    return (
        <Container class="panel-option">
            <Label class="panel-label" text={props.label} />
            <Label class="panel-value" text={String(props.value)} />
        </Container>
    );
};

export const Vector = (props: {
    label: string;
    value: number[] | string | Record<number, number>;
    dimensions: 2 | 3 | 4;
    enabled?: boolean;
}) => {
    return (
        <Container class="panel-option" enabled={props.enabled ?? true}>
            <Label class="panel-label" text={props.label} />
            <VectorInput class="panel-value" dimensions={props.dimensions} value={props.value} precision={7} />
        </Container>
    );
};

export const Toggle = (props: {
    label: string;
    enabled?: boolean;
    setProperty: (value: boolean) => void;
    value: boolean;
}) => {
    return (
        <Container class="panel-option" enabled={props.enabled ?? true}>
            <Label class="panel-label" text={props.label} />
            <BooleanInput
                class="panel-value-boolean"
                type="toggle"
                value={props.value}
                onChange={(value: boolean) => props.setProperty(value)}
            />
        </Container>
    );
};

export const ToggleColor = (props: {
    label: string;
    booleanValue: boolean;
    setBooleanProperty: (value: boolean) => void;
    colorValue: number[];
    setColorProperty: (value: number[]) => void;
}) => {
    return (
        <Container class="panel-option">
            <Label class="panel-label" text={props.label} />
            <Container class="panel-value">
                <BooleanInput
                    type="toggle"
                    value={props.booleanValue}
                    onChange={(value: boolean) => props.setBooleanProperty(value)}
                />
                <ColorPicker
                    class="panel-value-toggle-color"
                    value={props.colorValue}
                    onChange={(value: number[]) => props.setColorProperty(value)}
                />
            </Container>
        </Container>
    );
};

export const SelectColor = (props: {
    label: string;
    selectType: 'string' | 'number' | 'boolean';
    selectOptions: Option[];
    selectValue: Option['v'];
    setSelectProperty: (value: Option['v']) => void;
    colorValue: number[];
    setColorProperty: (value: number[]) => void;
}) => {
    return (
        <Container class="panel-option">
            <Label class="panel-label" text={props.label} />
            <Container class="panel-value">
                <SelectInput
                    class="panel-value-select"
                    type={props.selectType}
                    options={props.selectOptions}
                    value={props.selectValue}
                    onChange={(value: Option['v']) => props.setSelectProperty(value)}
                />
                <ColorPicker
                    class="panel-value-color"
                    value={props.colorValue}
                    onChange={(value: number[]) => props.setColorProperty(value)}
                />
            </Container>
        </Container>
    );
};

export const Slider = (props: {
    label: string;
    value: number;
    setProperty: (value: number) => void;
    precision: number;
    min: number;
    max: number;
    enabled?: boolean;
    step?: number;
}) => {
    return (
        <Container class="panel-option" enabled={props.enabled ?? true}>
            <Label class="panel-label" text={props.label} />
            <SliderInput
                class="panel-value"
                min={props.min}
                max={props.max}
                sliderMin={props.min}
                sliderMax={props.max}
                precision={props.precision}
                step={props.step ?? 0.01}
                onChange={(value: number) => {
                    props.setProperty(value);
                }}
                value={props.value}
            />
        </Container>
    );
};

export const Numeric = (props: {
    label: string;
    value: number;
    setProperty: (value: number) => void;
    min: number;
    max: number;
    enabled?: boolean;
}) => {
    return (
        <Container class="panel-option" enabled={props.enabled ?? true}>
            <Label class="panel-label" text={props.label} />
            <NumericInput
                class="panel-value"
                min={props.min}
                max={props.max}
                onChange={(value: number) => {
                    props.setProperty(value);
                }}
                value={props.value}
            />
        </Container>
    );
};

export const ColorPickerControl = (props: {
    label: string;
    value: number[];
    setProperty: (value: number[]) => void;
    enabled?: boolean;
    hidden?: boolean;
}) => {
    return (
        <Container class="panel-option" hidden={props.hidden} enabled={props.enabled ?? true}>
            <Label class="panel-label" text={props.label} />
            <ColorPicker
                class="panel-value"
                value={props.value}
                onChange={(value: number[]) => props.setProperty(value)}
            />
        </Container>
    );
};

export const MorphSlider = (props: {
    value: number;
    setProperty: (value: number) => void;
    name: string;
    precision: number;
    min: number;
    max: number;
    label?: string;
    enabled?: boolean;
}) => {
    return (
        <Container class="panel-option" enabled={props.enabled ?? true}>
            <Label
                class="morph-label"
                flexGrow={'1'}
                flexShrink={'1'}
                text={
                    props.label
                        ? props.label
                        : props.name.substring(0, 1).toUpperCase() + props.name.substring(1, props.name.length)
                }
                flex
            />
            <SliderInput
                class="morph-value"
                flexGrow={'0'}
                flexShrink={'0'}
                min={props.min}
                max={props.max}
                sliderMin={props.min}
                sliderMax={props.max}
                precision={props.precision}
                step={0.01}
                onChange={(value: number) => {
                    props.setProperty(value);
                }}
                value={props.value}
            />
        </Container>
    );
};

export const Select = (props: {
    label: string;
    value: Option['v'];
    setProperty: (value: Option['v']) => void;
    type: 'string' | 'number' | 'boolean';
    options: Option[];
    enabled?: boolean;
    selectKey?: string;
}) => {
    return (
        <Container class="panel-option" enabled={props.enabled ?? true}>
            <Label class="panel-label" text={props.label} />
            <SelectInput
                key={props.selectKey}
                class="panel-value"
                type={props.type}
                options={props.options}
                value={props.value}
                onChange={(value: Option['v']) => {
                    props.setProperty(value);
                }}
            />
        </Container>
    );
};

// naked versions

export const NakedSelect = (props: {
    value: Option['v'];
    setProperty: (value: Option['v']) => void;
    width: number;
    type: 'string' | 'number' | 'boolean';
    options: Option[];
    enabled?: boolean;
    id?: string;
    class?: string;
}) => {
    return (
        <SelectInput
            id={props.id}
            class={props.class}
            width={props.width}
            type={props.type}
            options={props.options}
            enabled={props.enabled ?? true}
            value={props.value}
            onChange={(value: Option['v']) => {
                props.setProperty(value);
            }}
        />
    );
};

export const NakedSlider = (props: {
    value: number;
    setProperty: (value: number) => void;
    width: number;
    precision: number;
    min: number;
    max: number;
    enabled?: boolean;
    id?: string;
    class?: string;
}) => {
    return (
        <SliderInput
            id={props.id}
            class={props.class}
            width={props.width}
            min={props.min}
            max={props.max}
            sliderMin={props.min}
            sliderMax={props.max}
            precision={props.precision}
            step={0.01}
            enabled={props.enabled ?? true}
            value={props.value}
            onChange={(value: number) => {
                props.setProperty(value);
            }}
        />
    );
};
