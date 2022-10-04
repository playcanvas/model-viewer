import React from 'react';
import { InfoBox } from '@playcanvas/pcui/react/unstyled';
import { ObserverData } from '../types';

// InfoBox that shows an error
const ErrorBox = (props: { observerData: ObserverData }) => {
    return <InfoBox class="pcui-error" title='Error' hidden={!props.observerData.error} text={props.observerData.error} icon='E218'/>;
};

export default ErrorBox;
