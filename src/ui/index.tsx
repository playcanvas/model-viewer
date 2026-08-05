import type { Observer } from '@playcanvas/observer';
import { Container, Spinner } from '@playcanvas/pcui/react';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { version as appVersion } from '../../package.json';
import type { ObserverData, PropertyValue } from '../types';

import { ErrorBox, WarningsBox } from './errors';
import LeftPanel from './left-panel';
import LoadControls from './load-controls';
import PopupPanel from './popup-panel';
import SelectedNode from './selected-node';

class App extends React.Component<{ observer: Observer }> {
    state: ObserverData = null;

    canvasRef: React.RefObject<HTMLCanvasElement | null>;

    constructor(props: { observer: Observer }) {
        super(props);

        this.canvasRef = React.createRef();
        this.state = this._retrieveState();

        props.observer.on('*:set', () => {
            // update the state
            this.setState(this._retrieveState());
        });
    }

    _retrieveState = () => {
        const state = {} as Record<keyof ObserverData, unknown>;
        (this.props.observer as unknown as { _keys: (keyof ObserverData)[] })._keys.forEach((key) => {
            state[key] = this.props.observer.get(key);
        });
        return state as unknown as ObserverData;
    };

    _setStateProperty = (path: string, value: PropertyValue) => {
        this.props.observer.set(path, value);
    };

    render() {
        const xrActive = this.state?.runtime?.xrActive;
        return (
            <div id="application-container">
                <Container id="panel-left" flex resizable="right" resizeMin={220} resizeMax={800} hidden={xrActive}>
                    <div className="header" style={{ display: 'none' }}>
                        <div id="title">
                            {/* eslint-disable-next-line jsx-a11y/alt-text -- preserve markup */}
                            <img src={'static/playcanvas-logo.png'} />
                            <div>{`MODEL VIEWER v${appVersion}`}</div>
                        </div>
                    </div>
                    <div id="panel-toggle">
                        {/* eslint-disable-next-line jsx-a11y/alt-text -- preserve markup */}
                        <img src={'static/playcanvas-logo.png'} />
                    </div>
                    <LeftPanel observerData={this.state} setProperty={this._setStateProperty} />
                </Container>
                <div id="canvas-wrapper">
                    <canvas id="application-canvas" ref={this.canvasRef} />
                    <LoadControls setProperty={this._setStateProperty} />
                    <SelectedNode sceneData={this.state.scene} />
                    <PopupPanel observerData={this.state} setProperty={this._setStateProperty} />
                    <ErrorBox observerData={this.state} setProperty={this._setStateProperty} />
                    <WarningsBox observerData={this.state} setProperty={this._setStateProperty} />
                    <Spinner id="spinner" size={30} hidden={true} />
                </div>
            </div>
        );
    }
}

export default (observer: Observer) => {
    const root = createRoot(document.getElementById('app'));
    root.render(<App observer={observer} />);

    // Commit the initial mount synchronously
    flushSync(() => {
        root.render(<App observer={observer} />);
    });
};
