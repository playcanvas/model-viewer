// @ts-ignore: library file import
import * as pcui from 'lib/pcui.js';

const cta = new pcui.InfoBox({
    text: 'Drag glTF or glb files here to view',
    class: 'initial-cta',
    icon: 'E400'
});


document.querySelector('body').appendChild(cta.dom);
