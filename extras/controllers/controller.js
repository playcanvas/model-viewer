import { Mat4 } from 'playcanvas';

class Controller {
    /**
     * @type {Mat4}
     * @protected
     */
    _transform = new Mat4();

    /**
     * @param {Mat4} transform - The transform.
     */
    attach(transform) {
    }

    detach() {
    }

    /**
     * @param {any[]} args - The arguments.
     * @returns {Mat4} - The camera transform.
     */
    update(...args) {
        return this._transform;
    }

    destroy() {
    }
}

export { Controller };
