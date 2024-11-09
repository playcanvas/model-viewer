import { Container } from '@playcanvas/pcui/react';
import React from 'react';

import { SetProperty, ObserverData } from '../types';
import { Vector, Detail } from './components';

class SelectedNode extends React.Component < { sceneData: ObserverData['scene'] } > {
    shouldComponentUpdate(nextProps: Readonly<{ sceneData: ObserverData['scene']; setProperty: SetProperty; }>): boolean {
        return (
            nextProps.sceneData.nodes !== this.props.sceneData.nodes ||
            nextProps.sceneData.selectedNode.path !== this.props.sceneData.selectedNode.path ||
            nextProps.sceneData.selectedNode.name !== this.props.sceneData.selectedNode.name ||
            nextProps.sceneData.selectedNode.position !== this.props.sceneData.selectedNode.position ||
            nextProps.sceneData.selectedNode.rotation !== this.props.sceneData.selectedNode.rotation ||
            nextProps.sceneData.selectedNode.scale !== this.props.sceneData.selectedNode.scale
        );
    }

    render() {
        const scene = this.props.sceneData;
        const hasHierarchy = scene.nodes !== '[]';
        const nodeSelected = scene.selectedNode.path;
        return hasHierarchy && nodeSelected ? (
            <div className='selected-node-panel-parent'>
                <Container class='selected-node-panel' flex>
                    <Detail label='Name' value={scene.selectedNode.name} />
                    <Vector label='Position' dimensions={3} value={scene.selectedNode.position} enabled={false}/>
                    <Vector label='Rotation' dimensions={3} value={scene.selectedNode.rotation} enabled={false}/>
                    <Vector label='Scale' dimensions={3} value={scene.selectedNode.scale} enabled={false}/>
                </Container>
            </div>
        ) : null;
    }
}

export default SelectedNode;
