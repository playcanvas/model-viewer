import { Panel, Container, TreeViewItem, TreeView } from '@playcanvas/pcui/react';
import React from 'react';

import { addEventListenerOnClickOnly } from '../../helpers';
import { HierarchyNode, SetProperty, ObserverData } from '../../types';
import { Detail, Select, Toggle, Vector } from '../components';
import MorphTargetPanel from './morph-target-panel';

declare global {
    interface Navigator {
      readonly gpu: any;
    }
}

const toggleCollapsed = () => {
    const leftPanel = document.getElementById('panel-left');
    if (leftPanel) {
        leftPanel.classList.toggle('collapsed');
    }
};

let leftPanel: any;
const openPanel = () => {
    if (!leftPanel) {
        leftPanel = document.getElementById('panel-left');
    }
    if (leftPanel && leftPanel.classList.contains('collapsed')) {
        leftPanel.classList.remove('collapsed');
    }
};

const bytesToSizeString = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return 'n/a';
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return (i === 0) ? `${bytes} ${sizes[i]}` : `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}`;
};

class ScenePanel extends React.Component <{ sceneData: ObserverData['scene'], setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ sceneData: ObserverData['scene']; setProperty: SetProperty; }>): boolean {
        return (
            JSON.stringify(nextProps.sceneData.filenames) !== JSON.stringify(this.props.sceneData.filenames) ||
            nextProps.sceneData.loadTime !== this.props.sceneData.loadTime ||
            nextProps.sceneData.meshCount !== this.props.sceneData.meshCount ||
            nextProps.sceneData.vertexCount !== this.props.sceneData.vertexCount ||
            nextProps.sceneData.primitiveCount !== this.props.sceneData.primitiveCount ||
            nextProps.sceneData.materialCount !== this.props.sceneData.materialCount ||
            nextProps.sceneData.textureVRAM !== this.props.sceneData.textureVRAM ||
            nextProps.sceneData.meshVRAM !== this.props.sceneData.meshVRAM ||
            nextProps.sceneData.bounds !== this.props.sceneData.bounds ||
            nextProps.sceneData.variant.selected !== this.props.sceneData.variant.selected ||
            nextProps.sceneData.variants.list !== this.props.sceneData.variants.list
        );
    }

    render() {
        const scene = this.props.sceneData;
        const variantListOptions: Array<{ v:string, t:string }> = JSON.parse(scene.variants.list).map((variant: string) => ({ v: variant, t: variant }));
        return (
            <Panel headerText='SCENE' id='scene-panel' flexShrink={'0'} flexGrow={'0'} collapsible={false} >
                <Detail label='Filename' value={scene.filenames.join(', ')} />
                <Detail label='Meshes' value={scene.meshCount} />
                <Detail label='Materials' value={scene.materialCount} />
                <Detail label='Textures' value={scene.textureCount} />
                <Detail label='Primitives' value={scene.primitiveCount} />
                <Detail label='Verts' value={scene.vertexCount} />
                <Detail label='Mesh VRAM' value={bytesToSizeString(scene.meshVRAM)} />
                <Detail label='Texture VRAM' value={bytesToSizeString(scene.textureVRAM)} />
                <Detail label='Load time' value={scene.loadTime} />
                <Vector label='Bounds' dimensions={3} value={scene.bounds} enabled={false}/>
                <Select label='Variant' type='string' options={variantListOptions} value={scene.variant.selected}
                    setProperty={(value: string) => {
                        this.props.setProperty('scene.variant.selected', value);
                    }}
                    enabled={ variantListOptions.length > 0 }
                />
            </Panel>
        );
    }
}

class HierarchyPanel extends React.Component <{ sceneData: ObserverData['scene'], setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ sceneData: ObserverData['scene']; setProperty: SetProperty; }>): boolean {
        return (
            nextProps.sceneData.nodes !== this.props.sceneData.nodes
        );
    }

    render() {
        const scene = this.props.sceneData;
        const modelHierarchy: Array<HierarchyNode> = JSON.parse(scene.nodes);
        const mapNodes = (nodes: Array<HierarchyNode>) => {
            return nodes.map((node:HierarchyNode) => <TreeViewItem text={`${node.name}`} key={node.path}
                onSelect={(TreeViewItem: any) => {
                    this.props.setProperty('scene.selectedNode.path', node.path);
                    const removeEventListener = addEventListenerOnClickOnly(document.body, () => {
                        TreeViewItem.selected = false;
                        removeEventListener();
                    }, 4);
                }}
                onDeselect={() => this.props.setProperty('scene.selectedNode.path', '')}
            >
                { mapNodes(node.children) }
            </TreeViewItem>);
        };
        return (
            <Panel headerText='HIERARCHY' class='scene-hierarchy-panel' enabled={modelHierarchy.length > 0} collapsible={false}>
                { modelHierarchy.length > 0 &&
                    <TreeView allowReordering={false} allowDrag={false}>
                        { mapNodes(modelHierarchy) }
                    </TreeView>
                }
            </Panel>
        );
    }
}

class DevicePanel extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    shouldComponentUpdate(nextProps: Readonly<{ observerData: ObserverData, setProperty: SetProperty}>): boolean {
        return JSON.stringify(nextProps.observerData.runtime) !== JSON.stringify(this.props.observerData.runtime) ||
               nextProps.observerData.enableWebGPU !== this.props.observerData.enableWebGPU;
    }

    render() {
        const runtime = this.props.observerData.runtime;
        return (
            <Panel headerText='DEVICE' id='device-panel' collapsible={false}>
                <Toggle
                    label="Use WebGPU"
                    value={this.props.observerData.enableWebGPU}
                    enabled={navigator.gpu !== undefined}
                    setProperty={(value: boolean) => this.props.setProperty('enableWebGPU', value)}
                />
                <Detail label='Active Device' value={runtime.activeDeviceType === 'webgpu' ? 'webgpu (beta)' : runtime.activeDeviceType} />
                <Detail label='Viewport' value={`${runtime.viewportWidth} x ${runtime.viewportHeight}`} />
            </Panel>
        );
    }
}

class LeftPanel extends React.Component <{ observerData: ObserverData, setProperty: SetProperty }> {
    isMobile: boolean;

    constructor(props: any) {
        super(props);
        this.isMobile = (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    }

    shouldComponentUpdate(nextProps: Readonly<{ observerData: ObserverData; setProperty: SetProperty; }>): boolean {
        return JSON.stringify(nextProps.observerData.scene) !== JSON.stringify(this.props.observerData.scene) ||
               JSON.stringify(nextProps.observerData.runtime) !== JSON.stringify(this.props.observerData.runtime);
    }

    componentDidMount(): void {
        // set up the control panel toggle button
        document.getElementById('panel-toggle').addEventListener('click', () => {
            toggleCollapsed();
        });
        document.getElementById('title').addEventListener('click', () => {
            toggleCollapsed();
        });
        // we require this setTimeout because panel isn't yet created and so fails
        // otherwise.
        setTimeout(() => toggleCollapsed());
    }

    componentDidUpdate(prevProps: Readonly<{ observerData: ObserverData; setProperty: SetProperty; }>): void {
        if (!this.isMobile &&
            !this.props.observerData.ui.fullscreen &&
             this.props.observerData.scene.nodes !== '[]' &&
             prevProps.observerData.scene.nodes === '[]') {
            openPanel();
        }
    }

    render() {
        const scene = this.props.observerData.scene;
        const morphs = this.props.observerData.morphs;
        return (
            <Container id='scene-container' flex>
                <ScenePanel sceneData={scene} setProperty={this.props.setProperty} />
                <div id='scene-scrolly-bits'>
                    <HierarchyPanel sceneData={scene} setProperty={this.props.setProperty} />
                    <MorphTargetPanel progress={this.props.observerData.animation.progress} morphs={morphs} setProperty={this.props.setProperty} />
                </div>
                <DevicePanel observerData={this.props.observerData} setProperty={this.props.setProperty} />
            </Container>
        );
    }
}

export default LeftPanel;
