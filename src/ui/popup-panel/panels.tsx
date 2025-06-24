import { Container, Button, Label, TextInput } from '@playcanvas/pcui/react';
// @ts-ignore no type defs included
import QRious from 'qrious';
import React from 'react';

import { extract } from '../../helpers';
import { SetProperty, ObserverData } from '../../types';
import { Slider, Toggle, Select, ColorPickerControl, ToggleColor, Numeric } from '../components';

const rgbToArr = (rgb: { r: number, g: number, b: number }) => [rgb.r, rgb.g, rgb.b, 1];
const arrToRgb = (arr: number[]) => {
    return { r: arr[0], g: arr[1], b: arr[2] };
};

class CameraPanel extends React.Component <{
    observerData: ObserverData,
    setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{
        observerData: ObserverData;
        setProperty: SetProperty; }>): boolean {

        const keys = ['ui', 'debug', 'animation.playing'];
        const a = extract(nextProps.observerData, keys);
        const b = extract(this.props.observerData, keys);
        return JSON.stringify(a) !== JSON.stringify(b);
    }

    render() {
        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.observerData.ui.active !== 'camera'}>
                    <Label text='Camera' class='popup-panel-heading' />
                    <Slider
                        label='Fov'
                        precision={0}
                        min={35}
                        max={150}
                        value={props.observerData.camera.fov}
                        setProperty={(value: number) => props.setProperty('camera.fov', value)} />
                    <Select
                        label='Tonemap'
                        type='string'
                        options={['None', 'Linear', 'Neutral', 'Filmic', 'Hejl', 'ACES', 'ACES2'].map(v => ({ v, t: v }))}
                        value={props.observerData.camera.tonemapping}
                        setProperty={(value: number) => props.setProperty('camera.tonemapping', value)} />
                    <Select
                        label='Pixel Scale'
                        value={props.observerData.camera.pixelScale}
                        type='number'
                        options={[1, 2, 4, 8, 16].map(v => ({ v: v, t: Number(v).toString() }))}
                        setProperty={(value: number) => props.setProperty('camera.pixelScale', value)} />
                    <Toggle
                        label='Multisample'
                        value={props.observerData.camera.multisample}
                        enabled={props.observerData.camera.multisampleSupported}
                        setProperty={(value: boolean) => props.setProperty('camera.multisample', value)}
                    />
                    <Toggle
                        label='High Quality'
                        value={props.observerData.camera.hq}
                        enabled={!props.observerData.animation.playing && !props.observerData.debug.stats }
                        setProperty={(value: boolean) => props.setProperty('camera.hq', value)}
                    />
                </Container>
            </div>
        );
    }
}

class SkyboxPanel extends React.Component <{
    skyboxData: ObserverData['skybox'],
    uiData: ObserverData['ui'],
    setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{
        skyboxData: ObserverData['skybox'];
        uiData: ObserverData['ui'];
        setProperty: SetProperty; }>): boolean {

        return JSON.stringify(nextProps.skyboxData) !== JSON.stringify(this.props.skyboxData) ||
                JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData);
    }

    render() {
        const props = this.props;

        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.uiData.active !== 'skybox'}>
                    <Label text='Sky' class='popup-panel-heading' />
                    <Select
                        label='Environment'
                        type='string'
                        options={JSON.parse(props.skyboxData.options)}
                        value={props.skyboxData.value}
                        setProperty={(value: string) => props.setProperty('skybox.value', value)} />
                    <Slider
                        label='Exposure'
                        value={props.skyboxData.exposure}
                        setProperty={(value: number) => props.setProperty('skybox.exposure', value)}
                        precision={2}
                        min={-6}
                        max={6}
                        enabled={props.skyboxData.value !== 'None'} />
                    <Slider
                        label='Rotation'
                        precision={0}
                        min={-180}
                        max={180}
                        value={props.skyboxData.rotation}
                        setProperty={(value: number) => props.setProperty('skybox.rotation', value)}
                        enabled={props.skyboxData.value !== 'None'} />
                    <Select
                        label='Background'
                        type='string'
                        options={['Solid Color', 'Infinite Sphere', 'Projective Dome', 'Projective Box'].map(v => ({ v, t: v }))}
                        value={props.skyboxData.background}
                        setProperty={(value: string) => props.setProperty('skybox.background', value)}
                        enabled={props.skyboxData.value !== 'None'} />
                    <ColorPickerControl
                        label='Background Color'
                        value={rgbToArr(props.skyboxData.backgroundColor)}
                        setProperty={(value: number[]) => props.setProperty('skybox.backgroundColor', arrToRgb(value))}
                        enabled={props.skyboxData.value === 'None' || props.skyboxData.background === 'Solid Color'} />
                    <Slider
                        label='Blur'
                        // type='number'
                        // options={[0, 1, 2, 3, 4, 5].map(v => ({ v: v, t: v === 0 ? 'Disabled' : `Mip ${v}` }))}
                        value={props.skyboxData.blur}
                        setProperty={(value: number) => props.setProperty('skybox.blur', value)}
                        enabled={props.skyboxData.value !== 'None' && props.skyboxData.background === 'Infinite Sphere'}
                        min={0}
                        max={5}
                        precision={0}
                        step={1}/>
                    <Numeric
                        label='Scale'
                        value={props.skyboxData.domeProjection.domeRadius}
                        setProperty={(value: number) => props.setProperty('skybox.domeProjection.domeRadius', value)}
                        min={0}
                        max={1000}
                        enabled={props.skyboxData.value !== 'None' && ['Projective Dome', 'Projective Box'].indexOf(props.skyboxData.background) !== -1} />
                    <Slider
                        label='Tripod Offset'
                        value={props.skyboxData.domeProjection.tripodOffset}
                        setProperty={(value: number) => props.setProperty('skybox.domeProjection.tripodOffset', value)}
                        min={0}
                        max={1}
                        precision={2}
                        enabled={props.skyboxData.value !== 'None' && ['Projective Dome', 'Projective Box'].indexOf(props.skyboxData.background) !== -1} />
                </Container>
            </div>
        );
    }
}

class LightPanel extends React.Component <{
    lightData: ObserverData['light'],
    uiData: ObserverData['ui'],
    shadowCatcherData: ObserverData['shadowCatcher'],
    setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{
        lightData: ObserverData['light'];
        uiData: ObserverData['ui'];
        setProperty: SetProperty; }>): boolean {

        return JSON.stringify(nextProps.lightData) !== JSON.stringify(this.props.lightData) ||
               JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData);
    }

    render() {
        const props = this.props;

        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.uiData.active !== 'light'}>
                    <Label text='Light' class='popup-panel-heading' />
                    <Toggle
                        label='Enabled'
                        value={props.lightData.enabled}
                        setProperty={(value: boolean) => props.setProperty('light.enabled', value)} />
                    <Toggle label='Follow Camera'
                        value={props.lightData.follow}
                        setProperty={(value: boolean) => props.setProperty('light.follow', value)} />
                    <ColorPickerControl
                        label='Color'
                        value={rgbToArr(props.lightData.color)}
                        setProperty={(value: number[]) => props.setProperty('light.color', arrToRgb(value))} />
                    <Slider
                        label='Intensity'
                        precision={2} min={0} max={6}
                        value={props.lightData.intensity}
                        setProperty={(value: number) => props.setProperty('light.intensity', value)} />
                    <Toggle
                        label='Cast Shadow'
                        value={props.lightData.shadow}
                        setProperty={(value: boolean) => props.setProperty('light.shadow', value)} />
                    <Toggle
                        label='Shadow Catcher'
                        value={props.shadowCatcherData.enabled}
                        setProperty={(value: boolean) => props.setProperty('shadowCatcher.enabled', value)} />
                    <Slider
                        label='Catcher Intensity'
                        precision={2} min={0} max={1}
                        value={props.shadowCatcherData.intensity}
                        setProperty={(value: number) => props.setProperty('shadowCatcher.intensity', value)} />
                </Container>
            </div>
        );
    }
}

class DebugPanel extends React.Component <{
    debugData: ObserverData['debug'],
    uiData: ObserverData['ui'],
    setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{
        debugData: ObserverData['debug'];
        uiData: ObserverData['ui'];
        setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.debugData) !== JSON.stringify(this.props.debugData) ||
               JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData);
    }

    render() {
        const renderModeOptions = [
            { t: 'Default', v: 'default' },
            { t: 'Lighting', v: 'lighting' },
            { t: 'Albedo', v: 'albedo' },
            { t: 'Emissive', v: 'emission' },
            { t: 'WorldNormal', v: 'world_normal' },
            { t: 'Metalness', v: 'metalness' },
            { t: 'Gloss', v: 'gloss' },
            { t: 'Ao', v: 'ao' },
            { t: 'Specularity', v: 'specularity' },
            { t: 'Opacity', v: 'opacity' },
            { t: 'Uv0', v: 'uv0' }
        ];

        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.uiData.active !== 'debug'}>
                    <Label text='Debug' class='popup-panel-heading' />
                    <Select
                        label='Render Mode'
                        type='string'
                        options={renderModeOptions}
                        value={props.debugData.renderMode}
                        setProperty={(value: string) => props.setProperty('debug.renderMode', value)} />
                    <ToggleColor
                        label='Wireframe'
                        booleanValue={props.debugData.wireframe}
                        setBooleanProperty={(value: boolean) => props.setProperty('debug.wireframe', value)}
                        colorValue={rgbToArr(props.debugData.wireframeColor)}
                        setColorProperty={(value: number[]) => props.setProperty('debug.wireframeColor', arrToRgb(value))} />
                    <Toggle
                        label='Grid'
                        value={props.debugData.grid}
                        setProperty={(value: boolean) => props.setProperty('debug.grid', value)}/>
                    <Toggle
                        label='Axes'
                        value={props.debugData.axes}
                        setProperty={(value: boolean) => props.setProperty('debug.axes', value)} />
                    <Toggle
                        label='Skeleton'
                        value={props.debugData.skeleton}
                        setProperty={(value: boolean) => props.setProperty('debug.skeleton', value)} />
                    <Toggle
                        label='Bounds'
                        value={props.debugData.bounds}
                        setProperty={(value: boolean) => props.setProperty('debug.bounds', value)} />
                    <Slider
                        label='Normals'
                        precision={2}
                        min={0}
                        max={1}
                        setProperty={(value: number) => props.setProperty('debug.normals', value)}
                        value={props.debugData.normals} />
                    <Toggle
                        label='Stats'
                        value={props.debugData.stats}
                        setProperty={(value: boolean) => props.setProperty('debug.stats', value)}
                    />
                </Container>
            </div>
        );
    }
}

class ViewPanel extends React.Component <{
    sceneData: ObserverData['scene'],
    uiData: ObserverData['ui'],
    runtimeData: ObserverData['runtime'],
    setProperty: SetProperty }> {
    isMobile: boolean;

    get shareUrl() {
        return `${location.origin}${location.pathname}?${this.props.sceneData.urls.map((url: string) => `load=${url}`).join('&')}`;
    }

    constructor(props: any) {
        super(props);
        this.isMobile = (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    }

    shouldComponentUpdate(nextProps: Readonly<{
        sceneData: ObserverData['scene'];
        uiData: ObserverData['ui'];
        setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.sceneData) !== JSON.stringify(this.props.sceneData) ||
               JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData);
    }

    get hasQRCode() {
        return this.props.sceneData.urls.length > 0 && !this.isMobile;
    }

    updateQRCode() {
        const canvas = document.getElementById('share-qr') as HTMLCanvasElement;
        const qr = new QRious({
            element: canvas,
            value: this.shareUrl,
            size: canvas.getBoundingClientRect().width * window.devicePixelRatio
        });
    }

    componentDidMount() {
        if (this.hasQRCode) {
            this.updateQRCode();
        }
    }

    componentDidUpdate(): void {
        if (this.hasQRCode) {
            this.updateQRCode();
        }
    }

    render() {
        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container id='view-panel' class='popup-panel' flex hidden={props.uiData.active !== 'view'}>
                    { this.hasQRCode ?
                        <>
                            <Label text='View and share on mobile with QR code' />
                            <div id='qr-wrapper'>
                                <canvas id='share-qr' />
                            </div>
                            <Label text='View and share on mobile with URL' />
                            <div id='share-url-wrapper'>
                                <TextInput class='secondary' value={this.shareUrl} enabled={false} />
                                <Button id='copy-button' icon='E126' onClick={() => {
                                    if (navigator.clipboard && window.isSecureContext) {
                                        navigator.clipboard.writeText(this.shareUrl);
                                    }
                                }}/>
                            </div>
                        </> : null }
                    <Button
                        class='secondary'
                        text='TAKE A SNAPSHOT AS PNG'
                        onClick={() => {
                            if (window.viewer) window.viewer.downloadPngScreenshot();
                        }}
                    />
                </Container>
            </div>
        );
    }
}

export {
    CameraPanel,
    SkyboxPanel,
    LightPanel,
    DebugPanel,
    ViewPanel
};
