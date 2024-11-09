import { Container, Label, Button, TextInput } from '@playcanvas/pcui/react';
import React, { useRef, useState } from 'react';

import { version as appVersion } from '../../package.json';
import { File, SetProperty } from '../types';

const validUrl = (url: string) => {
    try {
        /* eslint-disable-next-line no-new */
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const LoadControls = (props: { setProperty: SetProperty }) => {
    const [urlInputValid, setUrlInputValid] = useState(false);
    const inputFile = useRef(null);

    const onLoadButtonClick = () => {
        // `current` points to the mounted file input element
        inputFile.current.click();
    };

    const onFileSelected = (event: React.ChangeEvent<any>) => {
        // `event` points to the selected file
        const viewer = (window as any).viewer;
        const files = event.target.files;
        if (viewer && files.length) {
            const loadList: Array<File> = [];
            for (let i = 0; i < files.length; ++i) {
                const file = files[i];
                loadList.push({
                    url: URL.createObjectURL(file),
                    filename: file.name
                });
            }
            viewer.loadFiles(loadList);
        }
    };

    const onUrlSelected = () => {
        const viewer = (window as any).viewer;
        // @ts-ignore
        const value = document.getElementById('glb-url-input').ui.value;
        const url = new URL(value);
        const filename = url.pathname.split('/').pop();
        const hasExtension = !!filename.split('.').splice(1).pop();
        viewer.loadFiles([{
            url: value,
            filename: filename + (hasExtension ? '' : '.glb')
        }]);
    };

    return (
        <div id='load-controls'>
            <Container class="load-button-panel" enabled flex>
                <div className='header'>
                    <img src={'static/playcanvas-logo.png'}/>
                    <div>
                        <Label text={`MODEL VIEWER v${appVersion}`} />
                    </div>
                    <Button onClick={() => {
                        window.open('https://github.com/playcanvas/model-viewer', '_blank').focus();
                    }} icon='E259'/>
                </div>
                <input type='file' id='file' accept='.glb,.gltf,.ply' multiple onChange={onFileSelected} ref={inputFile} style={{ display: 'none' }} />
                <div id="drag-drop" onClick={onLoadButtonClick}>
                    <Button id="drag-drop-search-icon" icon='E129' />
                    <Label class='desktop' text="Drag & drop .glb, .gltf, or .ply files, or click to open files" />
                    <Label class='mobile' text="Click to open files" />
                </div>
                <Label id='or-text' text="OR" class="centered-label" />
                <TextInput class='secondary' id='glb-url-input' placeholder='Enter .glb, .gltf, or .ply URL' keyChange onValidate={(value: string) => {
                    const isValid = validUrl(value);
                    setUrlInputValid(isValid);
                    return isValid;
                }}/>
                <Button class='secondary' id='glb-url-button' text='LOAD MODEL FROM URL' onClick={onUrlSelected} enabled={urlInputValid}></Button>
            </Container>
        </div>
    );
};

export default LoadControls;
