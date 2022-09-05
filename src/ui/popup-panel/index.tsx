import React from 'react';
import { Observer } from '@playcanvas/observer';
import { Button } from '@playcanvas/pcui/react';
import { SetProperty, ObserverData } from '../../types';
import AnimationControls from './animation-controls';
import { CameraPanel, LightingPanel, ShowPanel } from './panels';

const PopupPanelControls = (props: { observerData: ObserverData, setProperty: SetProperty }) => {
    return (<>
        <CameraPanel setProperty={props.setProperty} observerData={props.observerData} />
        <ShowPanel setProperty={props.setProperty} showData={props.observerData.show} uiData={props.observerData.ui} />
        <LightingPanel setProperty={props.setProperty} lightingData={props.observerData.lighting} uiData={props.observerData.ui} />
    </>);
};

class PopupButtonControls extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    render() {
        const handleClick = (value: string) => {
            this.props.setProperty('ui.active', this.props.observerData.ui.active === value ? null : value);
        };

        const buildClass = (value: string) => {
            return (this.props.observerData.ui.active === value) ? ['popup-button', 'selected'] : 'popup-button';
        };

        return (
            <div id='popup-buttons-parent'>
                <AnimationControls animationData={this.props.observerData.animation} setProperty={this.props.setProperty} />
                <Button class={buildClass('camera')} icon='E212' width={40} height={40} onClick={() => handleClick('camera')} />
                <Button class={buildClass('show')} icon='E188' width={40} height={40} onClick={() => handleClick('show')} />
                <Button class={buildClass('lighting')} icon='E192' width={40} height={40} onClick={() => handleClick('lighting')} />
            </div>
        );
    }
}

const toggleCollapsed = () => {
    document.getElementById('panel-left').classList.toggle('collapsed');
    const observer: Observer = (window.observer as any);
    if (observer) observer.emit('canvasResized');
};

const FullscreenButton = () => {
    return (
        <div id='fullscreen-button-parent'>
            <Button class='fullscreen-button' icon='E127' width={40} height={40} onClick={() => {
                toggleCollapsed();
            } } />
        </div>
    );
};
const DownloadButton = () => {
    return (
        <div id='download-button-parent'>
            <Button class='download-button' icon='E228' width={40} height={40} onClick={() => {
                if (window.viewer) window.viewer.downloadPngScreenshot();
            } } />
        </div>
    );
};

class PopupPanel extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    render() {
        return (<>
            <PopupPanelControls observerData={this.props.observerData} setProperty={this.props.setProperty} />
            <PopupButtonControls observerData={this.props.observerData} setProperty={this.props.setProperty} />
            <DownloadButton />
            <FullscreenButton />
        </>);
    }
};

export default PopupPanel;
