declare namespace pc {
    interface Entity {
        anim: AnimComponent;
    }
    
    // https://github.com/playcanvas/engine/blob/master/src/framework/components/anim/component-layer.js
    class AnimComponentLayer {
        constructor(name: string, controller: any, component: AnimComponent);
        /**
         * Start playing the animation in the current state.
         * @param [name] - If provided, will begin playing from the start of the state with this name.
         */
        play(name?: string): void;
        /**
         * Start playing the animation in the current state.
         */
        pause(): void;
        /**
         * Reset the animation component to it's initial state, including all parameters. The system will be paused.
         */
        reset(): void;
        /**
         * Rebind any animations in the layer to the currently present components and model of the anim components entity.
         */
        rebind(): void;
        update(dt: number): void;
        /**
         * Associates an animation with a state node in the loaded state graph. If all states nodes are linked and the {@link AnimComponent#activate} value was set to true then the component will begin playing.
         * @param nodeName - The name of the node that this animation should be associated with.
         * @param animTrack - The animation track that will be assigned to this state and played whenever this state is active.
         */
        assignAnimation(nodeName: string, animTrack: any): void;
        /**
         * Removes animations from a node in the loaded state graph.
         * @param nodeName - The name of the node that should have its animation tracks removed.
         */
        removeNodeAnimations(nodeName: string): void;
        /**
         * Returns the name of the layer
         */
        readonly name: string;
        /**
         * Whether this layer is currently playing
         */
        playing: string;
        /**
         * Returns true if a state graph has been loaded and all states in the graph have been assigned animation tracks.
         */
        readonly playable: string;
        /**
         * Returns the currently active state name.
         */
        readonly activeState: string;
        /**
         * Returns the previously active state name.
         */
        readonly previousState: string;
        /**
         * Returns the currently active states progress as a value normalised by the states animation duration. Looped animations will return values greater than 1.
         */
        readonly activeStateProgress: number;
        /**
         * Returns the currently active states duration.
         */
        readonly activeStateDuration: number;
        /**
         * The active states time in seconds
         */
        activeStateCurrentTime: number;
        /**
         * Returns whether the anim component layer is currently transitioning between states.
         */
        readonly transitioning: boolean;
        /**
         * If the anim component layer is currently transitioning between states, returns the progress. Otherwise returns null.
         */
        readonly transitionProgress: number;
        /**
         * Lists all available states in this layers state graph
         */
        readonly states: string[];
    }


    // https://github.com/playcanvas/engine/blob/master/src/framework/components/anim/component.js

    /**
     * Create a new AnimComponent.
     * @property speed - Speed multiplier for animation play back speed. 1.0 is playback at normal speed, 0.0 pauses the animation.
     * @property activate - If true the first animation will begin playing when the scene is loaded.
     * @param system - The {@link ComponentSystem} that created this Component.
     * @param entity - The Entity that this Component is attached to.
     */
    class AnimComponent extends Component {
        // Additional schema / properties from: https://github.com/playcanvas/engine/blob/master/src/framework/components/anim/system.js
        //activate: boolean; // Already in JSDoc
        enabled: boolean; // Missing in JSDoc
        //speed: number; // Already in JSDoc
        playing: boolean; // Missing in JSDoc

        system: AnimComponentSystem;

        constructor(system: AnimComponentSystem, entity: Entity);
        /**
         * Initialises component animation controllers using the provided state graph.
         * @param stateGraph - The state graph asset to load into the component. Contains the states, transitions and parameters used to define a complete animation controller.
         */
        loadStateGraph(stateGraph: any): void;
        /**
         * Removes all layers from the anim component.
         */
        removeStateGraph(): void;
        /**
         * Reset all of the components layers and parameters to their initial states. If a layer was playing before it will continue playing
         */
        reset(): void;
        /**
         * Rebind all of the components layers
         */
        rebind(): void;
        /**
         * Finds a {@link AnimComponentLayer} in this component.
         * @param layerName - The name of the anim component layer to find
         * @returns layer
         */
        findAnimationLayer(layerName: string): AnimComponentLayer;
        /**
         * Associates an animation with a state in the loaded state graph. If all states are linked and the {@link AnimComponent#activate} value was set to true then the component will begin playing.
         * @param nodeName - The name of the state node that this animation should be associated with.
         * @param animTrack - The animation track that will be assigned to this state and played whenever this state is active.
         * @param layerName - The name of the anim component layer to update. If omitted the default layer is used.
         */
        assignAnimation(nodeName: string, animTrack: any, layerName: string): void;
        /**
         * Removes animations from a node in the loaded state graph.
         * @param nodeName - The name of the node that should have its animation tracks removed.
         * @param layerName - The name of the anim component layer to update. If omitted the default layer is used.
         */
        removeNodeAnimations(nodeName: string, layerName: string): void;
        /**
         * Returns a float parameter value by name.
         * @param name - The name of the float to return the value of.
         * @returns A float
         */
        getFloat(name: string): number;
        /**
         * Sets the value of a float parameter that was defined in the animation components state graph.
         * @param name - The name of the parameter to set.
         * @param value - The new float value to set this parameter to.
         */
        setFloat(name: string, value: number): void;
        /**
         * Returns an integer parameter value by name.
         * @param name - The name of the integer to return the value of.
         * @returns An integer
         */
        getInteger(name: string): number;
        /**
         * Sets the value of an integer parameter that was defined in the animation components state graph.
         * @param name - The name of the parameter to set.
         * @param value - The new integer value to set this parameter to.
         */
        setInteger(name: string, value: number): void;
        /**
         * Returns a boolean parameter value by name.
         * @param name - The name of the boolean to return the value of.
         * @returns A boolean
         */
        getBoolean(name: string): boolean;
        /**
         * Sets the value of a boolean parameter that was defined in the animation components state graph.
         * @param name - The name of the parameter to set.
         * @param value - The new boolean value to set this parameter to.
         */
        setBoolean(name: string, value: boolean): void;
        /**
         * Returns a trigger parameter value by name.
         * @param name - The name of the trigger to return the value of.
         * @returns A boolean
         */
        getTrigger(name: string): boolean;
        /**
         * Sets the value of a trigger parameter that was defined in the animation components state graph to true.
         * @param name - The name of the parameter to set.
         */
        setTrigger(name: string): void;
        /**
         * Resets the value of a trigger parameter that was defined in the animation components state graph to false.
         * @param name - The name of the parameter to set.
         */
        resetTrigger(name: string): void;
        /**
         * The state graph asset this component should use to generate it's animation state graph
         */
        stateGraphAsset: number;
        /**
         * The animation assets used to load each states animation tracks
         */
        animationAssets: any;
        /**
         * Returns whether all component layers are currently playable
         */
        readonly playable: boolean;
        /**
         * Returns the base layer of the state graph
         */
        readonly baseLayer: AnimComponentLayer;
        /**
         * Speed multiplier for animation play back speed. 1.0 is playback at normal speed, 0.0 pauses the animation.
        */
        speed: number;
        /**
         * If true the first animation will begin playing when the scene is loaded.
        */
        activate: boolean;
    }

    // https://github.com/playcanvas/engine/blob/master/src/framework/components/anim/system.js

    /**
     * Create an AnimComponentSystem.
     * @param app - The application managing this system.
     */
    export class AnimComponentSystem extends ComponentSystem {
        constructor(app: Application);
        initializeComponentData(component: any, data: any, properties: any): void;
        onAnimationUpdate(dt: number): void;
    }

    // https://github.com/playcanvas/engine/blob/master/src/anim/state-graph/anim-state-graph.js
    
    interface AnimStateGraphDataState {
        name: string;
        speed?: number;
        loop?: boolean;
        defaultState?: boolean;
    }

    interface AnimStateGraphDataTransitionCondition {
        parameterName: string;
        predicate: string;
    }

    interface AnimStateGraphDataTransition {
        from: string;
        to: string;
        time?: number;
        priority?: number;
        conditions: AnimStateGraphDataTransitionCondition[];
        exitTime?: number;
        transitionOffset?: number;
        interruptionSource?: string;
    }

    interface AnimStateGraphDataParameter {
        name: string;
        type: string; // pc.ANIM_*
        value: any;
    }

    interface AnimStateGraphDataParameters {
        [key: string]: AnimStateGraphDataParameter
    }

    // FROM OBJECT:

    interface AnimStateGraphDataFromObjectLayer {
        name: string;
        states: number[];
        transitions: number[];
    }

    interface AnimStateGraphDataFromObject {
        layers: AnimStateGraphDataFromObjectLayer[];
        states: AnimStateGraphDataState[];
        transitions: AnimStateGraphDataTransition[];
        parameters: AnimStateGraphDataParameters;
    }

    // FROM ARRAY:

    interface AnimStateGraphDataFromArrayLayer {
        name: string;
        states: AnimStateGraphDataState[];
        transitions: AnimStateGraphDataTransition[];
    }
    
    interface AnimStateGraphDataFromArray {
        layers: AnimStateGraphDataFromArrayLayer[];
        parameters: AnimStateGraphDataParameters;
    }

    /**
     * Creates an AnimStateGraph asset resource from a blob of JSON data that represents an anim state graph.
     */
    export class AnimStateGraph {
        constructor(data: AnimStateGraphDataFromObject | AnimStateGraphDataFromArray);
        parameters: any;
        layers: any;
    }

    // https://github.com/playcanvas/engine/blob/master/src/anim/controller/constants.js
    const ANIM_INTERRUPTION_NONE: string;
    const ANIM_INTERRUPTION_PREV: string;
    const ANIM_INTERRUPTION_NEXT: string;
    const ANIM_INTERRUPTION_PREV_NEXT: string;
    const ANIM_INTERRUPTION_NEXT_PREV: string;
    const ANIM_GREATER_THAN: string;
    const ANIM_LESS_THAN: string;
    const ANIM_GREATER_THAN_EQUAL_TO: string;
    const ANIM_LESS_THAN_EQUAL_TO: string;
    const ANIM_EQUAL_TO: string;
    const ANIM_NOT_EQUAL_TO: string;
    const ANIM_PARAMETER_INTEGER: string;
    const ANIM_PARAMETER_FLOAT: string;
    const ANIM_PARAMETER_BOOLEAN: string;
    const ANIM_PARAMETER_TRIGGER: string;
    const ANIM_BLEND_1D: string;
    const ANIM_BLEND_2D_DIRECTIONAL: string;
    const ANIM_BLEND_2D_CARTESIAN: string;
    const ANIM_BLEND_DIRECT: string;
    const ANIM_STATE_START: string;
    const ANIM_STATE_END: string;
    const ANIM_STATE_ANY: string;
    const ANIM_CONTROL_STATES: string[];
}
