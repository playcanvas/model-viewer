import React, { useState } from 'react';
import { Observer } from '@playcanvas/observer';
import { InfoBox } from '@playcanvas/pcui/react';

const useObserverState = (observer: Observer, path: string) => {
    const parseFunc = (observerValue: any) => observerValue;
    const [value, setValue] = useState(parseFunc(observer.get(path)));
    observer.on(`${path}:set`, value => setValue(parseFunc(value)));
    return value;
};

// InfoBox that shows an error
const ErrorBox = (props: { observer: Observer, path: string }) => {
    const error: string = useObserverState(props.observer, props.path);
    return <InfoBox class="pcui-error" title='Error' hidden={!error} text={error} icon='E218'/>;
};

export default ErrorBox;
