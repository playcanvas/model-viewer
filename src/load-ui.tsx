// @ts-ignore: library file import
import { Container, Label, Button } from '@playcanvas/pcui/pcui-react';
import React, { useRef, useContext } from 'react';
import { Observer, URL } from './types';

const ObserverContext = React.createContext(null);
const ObserverProvider = ObserverContext.Provider;

const LoadButton = () => {
    const inputFile = useRef(null);

    const onLoadButtonClick = () => {
        // `current` points to the mounted file input element
        inputFile.current.click();
    };

    const onFileSelected = (event: React.ChangeEvent<any>) => {
        // `event` points to the selected file
        const viewer = (window as any).viewer;
        if (viewer && event.target.files.length) {
            const urls: Array<URL> = [];
            urls.push({
                url: URL.createObjectURL(event.target.files[0]),
                filename: event.target.files[0].name
            });
            viewer.load(urls);
        }
    };

    return (
        <>
            <input type='file' id='file' onChange={onFileSelected} ref={inputFile} style={{ display: 'none' }} />
            <Button onClick={onLoadButtonClick} text='Choose a file' width="calc(100% - 15px)" font-size="14px" />
        </>
    );
};

const LoadPanel = () => {
    return (
        <Container class="load-button-panel" enabled flex>
            <Label text="Drag glTF or GLB files here to view" />
            <Label text="or" class="centered-label" />
            <LoadButton />
        </Container>
    );
};

const LoadControls = (props: { observer: Observer }) => {
    return (
        <div id='load-controls'>
            <ObserverProvider value={props.observer}>
                <LoadPanel />
            </ObserverProvider>
        </div>
    );
};

export default LoadControls;
