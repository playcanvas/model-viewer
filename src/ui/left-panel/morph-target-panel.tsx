import { Panel } from '@playcanvas/pcui/react';
import React from 'react';
import VisibilitySensor from 'react-visibility-sensor';

import { MorphTargetData, SetProperty, ObserverData } from '../../types';
import { MorphSlider } from '../components';

class MorphTargetPanel extends React.Component <{ morphs: ObserverData['morphs'], progress: number, setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ morphs: ObserverData['morphs']; progress: number; setProperty: SetProperty; }>): boolean {
        return (
            JSON.stringify(nextProps.morphs) !== JSON.stringify(this.props.morphs)
        );
    }

    render() {
        const morphs: any = this.props.morphs;
        return morphs ? (
            <Panel headerText='MORPH TARGETS' class='scene-morph-panel' collapsible={false}>
                {Object.keys(morphs).map((morphIndex) => {
                    const morph = morphs[morphIndex];
                    return (
                        <div key={`${morphIndex}.${morph.name}`}>
                            <Panel headerText={morph.name} collapsible class='morph-target-panel'>
                                {Object.keys(morph.targets).map((targetIndex: string) => {
                                    const morphTarget: MorphTargetData = morph.targets[targetIndex];
                                    return <div key={targetIndex}>
                                        <VisibilitySensor offset={{ top: -750, bottom: -750 }}>
                                            {({ isVisible }: any) => {
                                                return <div>{
                                                    isVisible ?
                                                        <MorphSlider name={`${morphTarget.name}`} precision={2} min={0} max={1}
                                                            value={morphTarget.weight}
                                                            setProperty={(value: number) => this.props.setProperty(`morphs.${morphIndex}.targets.${targetIndex}.weight`, value)}
                                                        /> :
                                                        <div style={{ width: 30, height: 30 }}></div>
                                                }</div>;
                                            }}
                                        </VisibilitySensor>
                                    </div>;
                                })}
                            </Panel>
                        </div>
                    );
                })}
            </Panel>
        ) : null;
    }
}

export default MorphTargetPanel;
