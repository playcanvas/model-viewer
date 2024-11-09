import { Button } from '@playcanvas/pcui/react';
import React from 'react';

import { SetProperty, ObserverData } from '../../types';
import { NakedSelect, NakedSlider } from '../components';

class AnimationTrackSelect extends React.Component <{ animationData: ObserverData['animation'], setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ animationData: ObserverData['animation']; setProperty: SetProperty; }>): boolean {
        return nextProps.animationData.list !== this.props.animationData.list ||
        nextProps.animationData.playing !== this.props.animationData.playing ||
        nextProps.animationData.selectedTrack !== this.props.animationData.selectedTrack;
    }

    render() {
        const props = this.props;

        const animationsList: Array<string> = JSON.parse(props.animationData.list);

        const selectTrackOptions: Array<{ v: string, t: string }> = animationsList.map((animation: string) => ({ v: animation, t: animation }));

        return (
            <NakedSelect
                id='anim-track-select'
                width={160} type='string'
                options={selectTrackOptions}
                setProperty={(value: string) => props.setProperty('animation.selectedTrack', value)}
                value={props.animationData.selectedTrack} />
        );
    }
}
class AnimationSpeedSelect extends React.Component <{ animationData: ObserverData['animation'], setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ animationData: ObserverData['animation']; setProperty: SetProperty; }>): boolean {
        return nextProps.animationData.speed !== this.props.animationData.speed;
    }

    render() {
        const props = this.props;

        const speedOptions: Array<{ v: string, t: string }> = [
            { v: '0.25', t: '0.25x' },
            { v: '0.5', t: '0.5x' },
            { v: '1', t: '1x' },
            { v: '1.5', t: '1.5x' },
            { v: '2', t: '2x' }
        ];

        return (
            <NakedSelect
                id='anim-speed-select'
                width={60} type='string'
                setProperty={(value: string) => props.setProperty('animation.speed', value)}
                value={props.animationData.speed}
                options={speedOptions} />
        );
    }
}


class AnimationControls extends React.Component <{ animationData: ObserverData['animation'], setProperty: SetProperty }> {
    animationState: ObserverData['animation'];

    shouldComponentUpdate(nextProps: Readonly<{ animationData: ObserverData['animation']; setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.animationData) !== JSON.stringify(this.props.animationData);
    }

    componentDidUpdate(): void {
        this.animationState = this.props.animationData;
    }

    render() {
        const props = this.props;

        const animationsList: Array<string> = JSON.parse(props.animationData.list);
        const enabled: boolean =  animationsList.length > 0;

        return enabled ? (
            <div className='animation-controls-panel-parent'>
                <Button class='anim-control-button' width={30} height={30} icon={ props.animationData.playing ? 'E376' : 'E286' } text='' onClick={() => {
                    props.setProperty('animation.playing', !this.animationState.playing);
                }} />
                <AnimationTrackSelect animationData={this.props.animationData} setProperty={this.props.setProperty} />
                <NakedSlider
                    id='anim-scrub-slider'
                    width={240} precision={2} min={0} max={1}
                    setProperty={(value: number) => {
                        const animationState = this.animationState;
                        animationState.playing = false;
                        animationState.progress = value;
                        props.setProperty('animation', animationState);
                    }}
                    value={props.animationData.progress}/>
                <AnimationSpeedSelect animationData={this.props.animationData} setProperty={this.props.setProperty} />
            </div>
        ) : <div></div>;
    }
}

export default AnimationControls;
