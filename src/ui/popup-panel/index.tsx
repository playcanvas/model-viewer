import { Button } from '@playcanvas/pcui/react';
import { UsdzExporter } from 'playcanvas';
import React from 'react';

import AnimationControls from './animation-controls';
import { CameraPanel, SkyboxPanel, LightPanel, DebugPanel, ViewPanel } from './panels';
import { addEventListenerOnClickOnly } from '../../helpers';
import { SetProperty, ObserverData } from '../../types';

const PopupPanelControls = (props: { observerData: ObserverData, setProperty: SetProperty }) => {
    return (<>
        <CameraPanel setProperty={props.setProperty} observerData={props.observerData} />
        <SkyboxPanel setProperty={props.setProperty} skyboxData={props.observerData.skybox} uiData={props.observerData.ui} />
        <LightPanel setProperty={props.setProperty} lightData={props.observerData.light} uiData={props.observerData.ui} shadowCatcherData={props.observerData.shadowCatcher}/>
        <DebugPanel setProperty={props.setProperty} debugData={props.observerData.debug} uiData={props.observerData.ui} />
        <ViewPanel setProperty={props.setProperty} sceneData={props.observerData.scene} uiData={props.observerData.ui} runtimeData={props.observerData.runtime}/>
    </>);
};

class PopupButtonControls extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    popupPanelElement: any;

    render() {
        let removeDeselectEvents: any;
        const handleClick = (value: string) => {
            this.props.setProperty('ui.active', this.props.observerData.ui.active === value ? null : value);

            // after a popup button is set active, listen for another click outside the panel to deactivate it
            if (!this.popupPanelElement) this.popupPanelElement = document.getElementById('popup');
            // add the event listener after the current click is complete
            setTimeout(() => {
                if (removeDeselectEvents) removeDeselectEvents();
                const deactivateUi = (e: any) => {
                    if (this.popupPanelElement.contains(e.target)) {
                        return;
                    }
                    this.props.setProperty('ui.active', null);
                    removeDeselectEvents();
                    removeDeselectEvents = null;
                };
                removeDeselectEvents = addEventListenerOnClickOnly(document.body, deactivateUi, 4);
            });
        };

        const buildClass = (value: string) => {
            return (this.props.observerData.ui.active === value) ? ['popup-button', 'selected'] : ['popup-button'];
        };

        return (
            <div id='popup-buttons-parent'>
                <AnimationControls animationData={this.props.observerData.animation} setProperty={this.props.setProperty} />
                <Button class={buildClass('camera')} icon='E212' width={40} height={40} onClick={() => handleClick('camera')} />
                <Button class={buildClass('skybox')} icon='E200' width={40} height={40} onClick={() => handleClick('skybox')} />
                <Button class={buildClass('light')} icon='E194' width={40} height={40} onClick={() => handleClick('light')} />
                <Button class={buildClass('debug')} icon='E134' width={40} height={40} onClick={() => handleClick('debug')} />
                <Button class={buildClass('view')} icon='E301' width={40} height={40} onClick={() => handleClick('view')} />
            </div>
        );
    }
}

const toggleCollapsed = () => {
    document.getElementById('panel-left').classList.toggle('collapsed');
};

class PopupPanel extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    link: HTMLAnchorElement;

    usdzExporter: any;

    get hasArSupport() {
        return this.props.observerData.runtime.xrSupported || this.usdzExporter;
    }

    constructor(props: any) {
        super(props);
        this.link = (document.getElementById('ar-link') as HTMLAnchorElement);
        if (this.link.relList.supports('ar') || (Boolean(window.webkit?.messageHandlers) && Boolean(/CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(navigator.userAgent)))) {
            this.usdzExporter = new UsdzExporter();
        }
    }

    render() {
        return (<div id='popup' className={this.props.observerData.scene.nodes === '[]' ? 'empty' : null}>
            <PopupPanelControls observerData={this.props.observerData} setProperty={this.props.setProperty} />
            <PopupButtonControls observerData={this.props.observerData} setProperty={this.props.setProperty} />
            <Button
                class='popup-button'
                id='launch-ar-button'
                icon='E189'
                hidden={!this.hasArSupport || this.props.observerData.scene.nodes === '[]'}
                width={40}
                height={40}
                onClick={() => {
                    if (this.usdzExporter) {
                        const sceneRoot = (window as any).viewer.app.root.findByName('sceneRoot');
                        // convert the loaded entity into asdz file
                        this.usdzExporter.build(sceneRoot).then((arrayBuffer: any) => {
                            const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
                            this.link.href = URL.createObjectURL(blob);
                            this.link.click();
                        }).catch(console.error);
                    } else {
                        if (window.viewer) window.viewer.xrMode.start();
                    }
                } }
            />
            <div id='floating-top-parent'>
                <Button
                    class='popup-button'
                    id='fullscreen-button'
                    icon='E127'
                    width={40}
                    height={40}
                    onClick={() => {
                        toggleCollapsed();
                    } }
                />
            </div>
            <div id='floating-bottom-parent'>
                <Button
                    class={['popup-button', 'camera-mode-button', this.props.observerData.camera.mode]}
                    id='camera-mode-button'
                    width={40}
                    height={40}
                    onClick={() => {
                        const mode = this.props.observerData.camera.mode === 'orbit' ? 'fly' : 'orbit';
                        this.props.setProperty('camera.mode', mode);
                    } }
                />
            </div>
        </div>);
    }
}

export default PopupPanel;
