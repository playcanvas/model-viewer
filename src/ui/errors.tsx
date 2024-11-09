import { InfoBox } from '@playcanvas/pcui/react';
import React from 'react';

import { ObserverData } from '../types';

// InfoBox that shows an error
const ErrorBox = (props: { observerData: ObserverData }) => {
    return <InfoBox class="pcui-error" title='Error' hidden={!props.observerData.ui.error} text={props.observerData.ui.error} icon='E218'/>;
};

export default ErrorBox;
