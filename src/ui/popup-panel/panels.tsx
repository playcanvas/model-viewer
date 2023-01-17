import React from 'react';
import { Container, Button, Label, TextInput } from 'pcui';
import { SetProperty, ObserverData } from '../../types';
import { extract } from '../../helpers';
// @ts-ignore no type defs included
import QRious from 'qrious';

import { Slider, Toggle, Select } from '../components';

class CameraPanel extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ observerData: ObserverData; setProperty: SetProperty; }>): boolean {
        const keys = [ 'ui', 'show', 'render', 'lighting', 'animation.playing' ];
        const a = extract(nextProps.observerData, keys);
        const b = extract(this.props.observerData, keys);
        return JSON.stringify(a) !== JSON.stringify(b);
    }

    render() {
        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.observerData.ui.active !== 'camera'}>
                    <Slider label='Fov' precision={0} min={35} max={150} value={props.observerData.show.fov} setProperty={(value: number) => props.setProperty('show.fov', value)} />
                    <Select label='Tonemap' type='string' options={['Linear', 'Filmic', 'Hejl', 'ACES'].map(v => ({ v, t: v }))} value={props.observerData.lighting.tonemapping} setProperty={(value: number) => props.setProperty('lighting.tonemapping', value)} />
                    <Select label='Pixel Scale' value={props.observerData.render.pixelScale} type='number' options={[1, 2, 4, 8, 16].map(v => ({ v: v, t: Number(v).toString() }))} setProperty={(value: number) => props.setProperty('render.pixelScale', value)} />
                    <Toggle label='Multisample' value={props.observerData.render.multisample} enabled={props.observerData.render.multisampleSupported}
                        setProperty={(value: boolean) => props.setProperty('render.multisample', value)}
                    />
                    <Toggle label='High Quality' value={props.observerData.render.hq} enabled={!props.observerData.animation.playing && !props.observerData.show.stats}
                        setProperty={(value: boolean) => props.setProperty('render.hq', value)}
                    />
                    <Toggle label='Stats' value={props.observerData.show.stats}
                        setProperty={(value: boolean) => props.setProperty('show.stats', value)}
                    />
                </Container>
            </div>
        );
    }
}

class ShowPanel extends React.Component <{ showData: ObserverData['show'], uiData: ObserverData['ui'], setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ showData: ObserverData['show']; uiData: ObserverData['ui']; setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.showData) !== JSON.stringify(this.props.showData) || JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData);
    }

    render() {
        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.uiData.active !== 'show'}>
                    <Toggle label='Grid' value={props.showData.grid} setProperty={(value: boolean) => props.setProperty('show.grid', value)}/>
                    <Toggle label='Wireframe' value={props.showData.wireframe} setProperty={(value: boolean) => props.setProperty('show.wireframe', value)} />
                    <Toggle label='Axes' value={props.showData.axes} setProperty={(value: boolean) => props.setProperty('show.axes', value)} />
                    <Toggle label='Skeleton' value={props.showData.skeleton} setProperty={(value: boolean) => props.setProperty('show.skeleton', value)} />
                    <Toggle label='Bounds' value={props.showData.bounds} setProperty={(value: boolean) => props.setProperty('show.bounds', value)} />
                    <Slider label='Normals' precision={2} min={0} max={1} setProperty={(value: number) => props.setProperty('show.normals', value)} value={props.showData.normals} />
                </Container>
            </div>
        );
    }
}

class LightingPanel extends React.Component <{ lightingData: ObserverData['lighting'], uiData: ObserverData['ui'], setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ lightingData: ObserverData['lighting']; uiData: ObserverData['ui']; setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.lightingData) !== JSON.stringify(this.props.lightingData) || JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData);
    }

    render() {
        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container class='popup-panel' flex hidden={props.uiData.active !== 'lighting'}>
                    <Select label='Environment' type='string' options={JSON.parse(props.lightingData.env.options)} value={props.lightingData.env.value} setProperty={(value: string) => props.setProperty('lighting.env.value', value)} />
                    <Select label='Skybox Level' type='number' options={[0, 1, 2, 3, 4, 5, 6].map(v => ({ v: v, t: v === 0 ? 'Disable' : Number(v - 1).toString() }))} value={props.lightingData.env.skyboxMip} setProperty={(value: number) => props.setProperty('lighting.env.skyboxMip', value)} />
                    <Slider label='Exposure' precision={2} min={-6} max={6} value={props.lightingData.env.exposure} setProperty={(value: number) => props.setProperty('lighting.env.exposure', value)} />
                    <Slider label='Rotation' precision={0} min={-180} max={180} value={props.lightingData.rotation} setProperty={(value: number) => props.setProperty('lighting.rotation', value)} />
                    <Slider label='Direct' precision={2} min={0} max={6} value={props.lightingData.direct} setProperty={(value: number) => props.setProperty('lighting.direct', value)} />
                    <Toggle label='Shadow' value={props.lightingData.shadow} setProperty={(value: boolean) => props.setProperty('lighting.shadow', value)} />
                </Container>
            </div>
        );
    }
}

class ViewPanel extends React.Component <{ uiData: ObserverData['ui'], glbUrl: string, setProperty: SetProperty }> {
    isMobile: boolean;

    get shareUrl() {
        return `${location.origin}${location.pathname}/?load=${this.props.glbUrl}`;
    }

    constructor(props: any) {
        super(props);
        this.isMobile = (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    }

    shouldComponentUpdate(nextProps: Readonly<{ uiData: ObserverData['ui']; glbUrl: string, setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.uiData) !== JSON.stringify(this.props.uiData) ||
        nextProps.glbUrl !== this.props.glbUrl;
    }

    updateQRCode() {
        const canvas = document.getElementById('share-qr');
        const qr = new QRious({
            element: canvas,
            value: this.shareUrl
        });
    }

    componentDidMount() {
        if (this.props.glbUrl) {
            this.updateQRCode();
        }
    }

    componentDidUpdate(): void {
        if (this.props.glbUrl) {
            this.updateQRCode();
        }
    }

    render() {
        const props = this.props;
        return (
            <div className='popup-panel-parent'>
                <Container id='view-panel' class='popup-panel' flex hidden={props.uiData.active !== 'view'}>
                    { this.props.glbUrl && !this.isMobile ?
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
                    <Button class='secondary' text='TAKE A SNAPSHOT AS PNG' onClick={() => {
                        if (window.viewer) window.viewer.downloadPngScreenshot();
                    }}/>
                </Container>
            </div>
        );
    }
}

export {
    CameraPanel,
    LightingPanel,
    ShowPanel,
    ViewPanel
};
