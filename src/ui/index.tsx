// import * as pc from 'playcanvas';
import { Observer } from '@playcanvas/observer';
import React from 'react';
import ReactDOM from 'react-dom';

import { Container, Spinner } from '@playcanvas/pcui/react';

import { getAssetPath, getRootPath } from '../helpers';
import { ObserverData } from '../types';
import LeftPanel from './left-panel';
import SelectedNode from './selected-node';
import PopupPanel from './popup-panel';
import LoadControls from './load-controls';
import ErrorBox from './errors';

class App extends React.Component<{ observer: Observer }> {
    state: ObserverData;

    constructor(props: any) {
        super(props);

        this.state = this._retrieveState();

        props.observer.on('*:set', () => {
            this.setState(this._retrieveState());
        });
    }

    _retrieveState = () => {
        const state: any = {};
        (this.props.observer as any)._keys.forEach((key: string) => {
            state[key] = this.props.observer.get(key);
        });
        return state;
    };

    _setStateProperty = (path: string, value: string) => {
        this.props.observer.set(path, value);
    };

    render() {
        return <div id="application-container">
            <Container id="panel-left" flex resizable='right' resizeMin={220} resizeMax={800} onResize={() => this.props.observer.emit('canvasResized')}>
                <div className="header" style={{ display: 'none' }}>
                    <a href={getRootPath()}>
                        <img src={getAssetPath('playcanvas-logo.png')}/>
                        <div><b>PLAY</b>CANVAS <span>viewer</span></div>
                    </a>
                </div>
                <div id="panel-toggle"></div>
                <LeftPanel observerData={this.state} setProperty={this._setStateProperty} />
            </Container>
            <div id='canvas-wrapper'>
                <canvas id="application-canvas" />
                <LoadControls />
                <SelectedNode sceneData={this.state.scene} />
                <PopupPanel observerData={this.state} setProperty={this._setStateProperty} />
                <ErrorBox observerData={this.state} />
                <Spinner id="spinner" size={30} hidden={true} />
            </div>
        </div>;
    }
}

export default (observer: Observer) => {
    // render out the app
    ReactDOM.render(
        <App observer={observer}/>,
        document.getElementById('app')
    );
};
