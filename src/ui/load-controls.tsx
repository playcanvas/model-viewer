import React, { useRef, useState } from 'react';
import { Container, Label, Button, TextInput } from 'pcui';
import { getAssetPath } from '../helpers';

import { File, SetProperty } from '../types';

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
        const url = document.getElementById('glb-url-input').ui.value;
        const loadList: Array<File> = [];
        let filename = url.split('/').pop();
        if (filename.indexOf('.glb') === -1) {
            if (filename.indexOf('?') === -1) {
                filename += '.glb';
            } else {
                filename = filename.split('?')[0] + '.glb';
            }
        }
        loadList.push({
            url,
            filename
        });
        viewer.loadFiles(loadList);
        props.setProperty('glbUrl', url);

    };

    return (
        <div id='load-controls'>
            <Container class="load-button-panel" enabled flex>
                <div className='header'>
                    <img src={getAssetPath('playcanvas-logo.png')}/>
                    <div>
                        <Label text='PLAYCANVAS MODEL VIEWER' />
                    </div>
                    <Button onClick={() => {
                        window.open('https://github.com/playcanvas/model-viewer', '_blank').focus();
                    }} icon='E259'/>
                </div>
                <input type='file' id='file' multiple onChange={onFileSelected} ref={inputFile} style={{ display: 'none' }} />
                <div id="drag-drop" onClick={onLoadButtonClick}>
                    <Button id="drag-drop-search-icon" icon='E129' />
                    <Label class='desktop' text="Drag & drop your files or click to open files" />
                    <Label class='mobile' text="Click to open files" />
                </div>
                <Label id='or-text' text="OR" class="centered-label" />
                <TextInput class='secondary' id='glb-url-input' placeholder='enter url' keyChange onValidate={(value: string) => {
                    const urlPattern = new RegExp('^(https?:\\/\\/)?' + // validate protocol
                    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // validate domain name
                    '((\\d{1,3}\\.){3}\\d{1,3}))' + // validate OR ip (v4) address
                    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // validate port and path
                    '(\\?[;&a-z\\d%_.~+=-]*)?' + // validate query string
                    '(\\#[-a-z\\d_]*)?$', 'i'); // validate fragment locator
                    const isValid = !!urlPattern.test(value);
                    setUrlInputValid(isValid);
                    return isValid;
                }}/>
                <Button class='secondary' id='glb-url-button' text='LOAD MODEL FROM URL' onClick={onUrlSelected} enabled={urlInputValid}></Button>
            </Container>
        </div>
    );
};

export default LoadControls;
