import { Button, InfoBox } from '@playcanvas/pcui/react';
import React from 'react';

import { ObserverData, SetProperty } from '../types';

// InfoBox that shows an error
const ErrorBox = (props: { observerData: ObserverData, setProperty: SetProperty }) => {
    const error = props.observerData.ui.error;

    const handleDismiss = () => {
        props.setProperty('ui.error', null);
    };

    if (!error) {
        return null;
    }

    return <div className="pcui-error-container">
        <InfoBox
            class="pcui-error"
            title='Error'
            text={error}
            icon='E218'
        />
        <Button text="OK" onClick={handleDismiss} />
    </div>;
};

// InfoBox that shows warnings (e.g., missing textures)
const WarningsBox = (props: { observerData: ObserverData, setProperty: SetProperty }) => {
    const warnings = props.observerData.ui.warnings;
    const hasWarnings = warnings && warnings.length > 0;

    // Limit displayed warnings to avoid overwhelming the UI
    const maxDisplayed = 5;
    let warningText = '';
    if (hasWarnings) {
        const displayed = warnings.slice(0, maxDisplayed);
        warningText = displayed.join('\n');
        if (warnings.length > maxDisplayed) {
            warningText += `\n...and ${warnings.length - maxDisplayed} more`;
        }
    }

    const title = hasWarnings && warnings.length > 1 ? `Warnings (${warnings.length})` : 'Warning';

    const handleDismiss = () => {
        props.setProperty('ui.warnings', []);
    };

    if (!hasWarnings) {
        return null;
    }

    return <div className="pcui-warning-container">
        <InfoBox
            class="pcui-warning"
            title={title}
            text={warningText}
            icon='E218'
        />
        <Button text="OK" onClick={handleDismiss} />
    </div>;
};

export { ErrorBox, WarningsBox };
export default ErrorBox;
