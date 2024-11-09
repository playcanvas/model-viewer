import {
    XRSPACE_LOCAL,
    XRSPACE_VIEWER,
    XRTRACKABLE_POINT,
    XRTRACKABLE_PLANE,
    XRTRACKABLE_MESH,
    XRTYPE_AR,
    BoundingBox,
    Entity,
    EventHandler,
    Vec3,
    Mat4,
    XrHitTestSource,
    XrManager,
    MeshInstance,
    RenderComponent,
    GSplatComponent
} from 'playcanvas';

const vec = new Vec3();
const vec2 = new Vec3();
const translation = new Vec3();
const forward = new Vec3();
const mat = new Mat4();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

type TweenValue = {[key: string]: number};

// helper tween class
class Tween {
    value: TweenValue;

    source: TweenValue;

    target: TweenValue;

    timer = 0;

    transitionTime = 0;

    constructor(value: any) {
        this.value = value;
        this.source = { ...value };
        this.target = { ...value };
    }

    goto(target: any, transitionTime = 0.25) {
        if (transitionTime === 0) {
            Tween.copy(this.value, target);
        }
        Tween.copy(this.source, this.value);
        Tween.copy(this.target, target);
        this.timer = 0;
        this.transitionTime = transitionTime;
    }

    update(deltaTime: number) {
        if (this.timer < this.transitionTime) {
            this.timer = Math.min(this.timer + deltaTime, this.transitionTime);
            Tween.lerp(this.value, this.source, this.target, Tween.quintic(this.timer / this.transitionTime));
        } else {
            Tween.copy(this.value, this.target);
        }
    }

    static quintic(n: number) {
        return Math.pow(n - 1, 5) + 1;
    }

    static copy(target: any, source: any) {
        Object.keys(target).forEach((key: string) => {
            target[key] = source[key];
        });
    }

    static lerp(target: any, a: any, b: any, t: number) {
        Object.keys(target).forEach((key: string) => {
            target[key] = a[key] + t * (b[key] - a[key]);
        });
    }
}

interface XRObjectPlacementOptions {
    xr: XrManager;
    camera: Entity;
    content: Entity;
    showUI: boolean;
    startArImgSrc: any;
    stopArImgSrc: any;
}

class XRObjectPlacementController {
    options: XRObjectPlacementOptions;

    dom: HTMLDivElement;

    events = new EventHandler();

    active = false;

    rotating = false;

    constructor(options: XRObjectPlacementOptions) {
        this.options = options;

        const xr = options.xr;

        // create the rotation controller
        xr.domOverlay.root = this._createRotateInput();

        // create dom
        if (this.options.showUI) {
            this._createUI();
        }

        this._createModelHandler();

        // perform an asynchronous ray intersection test given a view-space ray
        // returns a handle used to cancel the hit test
        const hitTest = (resultCallback: (position: Vec3) => void) => {
            xr.hitTest.start({
                spaceType: XRSPACE_VIEWER,
                entityTypes: [XRTRACKABLE_POINT, XRTRACKABLE_PLANE, XRTRACKABLE_MESH],
                callback: (err: Error | null, hitTestSource: XrHitTestSource) => {
                    if (err) {
                        console.log(err);
                    } else {
                        hitTestSource.on('result', (position: Vec3) => {
                            resultCallback(position);
                            hitTestSource.remove();
                        });
                    }
                }
            });
        };

        // handle xr mode availability change
        xr.on(`available: ${XRTYPE_AR}`, (available: boolean) => {
            this.events.fire('xr:available', available);
        });

        // handle xr mode starting
        xr.on('start', () => {
            this.active = true;
            this.events.fire('xr:started');

            // initial placement hit test
            hitTest((position: Vec3) => {
                this.events.fire('xr:initial-place', position);

                // vibrate on initial placement
                navigator?.vibrate(10);

                // register for touchscreen hit test
                xr.hitTest.start({
                    profile: 'generic-touchscreen',
                    entityTypes: [XRTRACKABLE_POINT, XRTRACKABLE_PLANE, XRTRACKABLE_MESH],
                    callback: (err: Error | null, hitTestSource: XrHitTestSource) => {
                        if (err) {
                            console.log(err);
                        } else {
                            hitTestSource.on('result', (position: Vec3) => {
                                if (!this.rotating) {
                                    this.events.fire('xr:place', position);
                                }
                            });
                        }
                    }
                });
            });
        });

        // handle xr mode ending
        xr.on('end', () => {
            this.active = false;
            this.events.fire('xr:ended');
        });
    }

    get available() {
        return this.options.xr.isAvailable(XRTYPE_AR);
    }

    // create an invisible dom element for capturing pointer input
    // rotate the model with two finger tap and twist
    private _createRotateInput() {
        const touches: Map<
            number,
            {
                start: {x: number; y: number};
                previous: {x: number; y: number};
                current: {x: number; y: number};
            }
        > = new Map();
        let baseAngle = 0;
        let angle = 0;

        const eventDefault = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const onPointerDown = (e: PointerEvent) => {
            eventDefault(e);

            touches.set(e.pointerId, {
                start: { x: e.clientX, y: e.clientY },
                previous: { x: e.clientX, y: e.clientY },
                current: { x: e.clientX, y: e.clientY }
            });

            if (this.rotating) {
                if (touches.size === 1) {
                    this.rotating = false;
                }
            } else {
                this.rotating = touches.size > 1;
            }
        };

        const onPointerMove = (e: PointerEvent) => {
            eventDefault(e);

            const touch = touches.get(e.pointerId);
            if (touch) {
                touch.previous.x = touch.current.x;
                touch.previous.y = touch.current.y;
                touch.current.x = e.clientX;
                touch.current.y = e.clientY;
            }

            if (touches.size === 2) {
                const ids = Array.from(touches.keys());
                const a = touches.get(ids[0]);
                const b = touches.get(ids[1]);

                const initialAngle = Math.atan2(b.start.y - a.start.y, b.start.x - a.start.x);
                const currentAngle = Math.atan2(b.current.y - a.current.y, b.current.x - a.current.x);
                angle = currentAngle - initialAngle;

                this.events.fire('xr:rotate', ((baseAngle + angle) * -180) / Math.PI);
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            eventDefault(e);

            if (touches.size === 2) {
                baseAngle += angle;
            }

            touches.delete(e.pointerId);
        };

        const dom = document.createElement('div');
        dom.style.position = 'fixed';
        dom.style.top = '0';
        dom.style.left = '0';
        dom.style.width = '100%';
        dom.style.height = '100%';
        dom.style.touchAction = 'none';
        dom.style.display = 'none';
        document.body.appendChild(dom);

        this.events.on('xr:started', () => {
            dom.style.display = 'block';
            dom.addEventListener('pointerdown', onPointerDown);
            dom.addEventListener('pointermove', onPointerMove);
            dom.addEventListener('pointerup', onPointerUp);
        });

        this.events.on('xr:ended', () => {
            dom.style.display = 'none';
            dom.removeEventListener('pointerdown', onPointerDown);
            dom.removeEventListener('pointermove', onPointerMove);
            dom.removeEventListener('pointerup', onPointerUp);
        });

        return dom;
    }

    // create a dom element and controller for launching and exiting xr mode
    private _createUI() {
        const dom = document.createElement('img');
        dom.src = this.options.startArImgSrc;
        dom.style.position = 'fixed';
        dom.style.right = '20px';
        dom.style.top = '20px';
        dom.style.width = '36px';
        dom.style.height = '36px';
        dom.style.opacity = '100%';
        dom.style.display = 'none';
        document.body.appendChild(dom);

        // disable button during xr mode transitions
        let enabled = true;

        this.events.on('xr:available', (available: boolean) => {
            dom.style.display = available ? 'block' : 'none';
        });

        this.events.on('xr:started', () => {
            enabled = true;
            dom.src = this.options.stopArImgSrc;
            this.options.xr.domOverlay.root.appendChild(dom);
        });

        this.events.on('xr:ended', () => {
            enabled = true;
            dom.src = this.options.startArImgSrc;
            document.body.appendChild(dom);
        });

        dom.addEventListener('click', () => {
            if (enabled) {
                enabled = false;
                if (this.active) {
                    this.end();
                } else {
                    this.start();
                }
            }
        });
    }

    // register for callback events from the xr manager to smoothly transition and move the model
    private _createModelHandler() {
        const xr = this.options.xr;
        const events = this.events;

        const pos = new Tween({ x: 0, y: 0, z: 0 });
        const rot = new Tween({ x: 0, y: 0, z: 0 });
        const scale = new Tween({ scale: 1 });
        const lerpSpeed = 0.25;

        let hovering = true;
        const hoverPos = new Vec3();

        const bound = new BoundingBox();
        let meshInstances: MeshInstance[];

        const updateBound = () => {
            if (meshInstances.length) {
                bound.copy(meshInstances[0].aabb);
                for (let i = 1; i < meshInstances.length; ++i) {
                    bound.add(meshInstances[i].aabb);
                }
            }
        };

        events.on('xr:start', () => {
            hovering = true;

            meshInstances = this.options.content.findComponents('render')
            .map((render: RenderComponent) => {
                return render.meshInstances;
            })
            .flat()
            .concat(this.options.content.findComponents('gsplat')
            .map((gsplat: GSplatComponent) => {
                return gsplat.instance.meshInstance;
            })
            );

            updateBound();

            const halfExtents = bound.halfExtents;
            hoverPos.set(0, -halfExtents.y, -halfExtents.length() * 4);
        });

        events.on('xr:initial-place', (position: Vec3) => {
            mat.copy(xr.camera.camera.viewMatrix).invert();
            mat.transformPoint(hoverPos, vec);
            mat.getEulerAngles(vec2);
            pos.goto({ x: vec.x, y: vec.y, z: vec.z }, 0);
            rot.goto({ x: vec2.x, y: vec2.y, z: vec2.z }, 0);
            scale.goto({ scale: 0.55 }, 0);

            rot.goto({ x: 0, y: 0, z: 0 }, lerpSpeed);
            pos.goto({ x: position.x, y: position.y, z: position.z }, lerpSpeed);
            hovering = false;
        });

        events.on('xr:place', (position: Vec3) => {
            pos.goto({ x: position.x, y: position.y, z: position.z }, lerpSpeed);
        });

        events.on('xr:rotate', (angle: number) => {
            angle = mod(angle, 360);
            rot.goto({ x: 0, y: angle, z: 0 }, lerpSpeed);
            // wrap source rotation to be within -180...180 degrees of target
            rot.source.y = angle - 180 + mod(rot.source.y - angle + 180, 360);
        });

        events.on('xr:ended', () => {
            this.options.content.setLocalPosition(0, 0, 0);
            this.options.content.setLocalEulerAngles(0, 0, 0);
        });

        xr.app.on('frameupdate', (ms: number) => {
            const dt = ms / 1000;
            pos.update(dt);
            rot.update(dt);
            scale.update(dt);
        });

        xr.on('update', () => {
            const xr = this.options.xr;

            if (!xr.views.list.length) {
                return;
            }

            mat.copy(xr.camera.camera.viewMatrix).invert();
            const contentRoot = this.options.content;

            if (hovering) {
                mat.transformPoint(hoverPos, vec);
                mat.getEulerAngles(vec2);

                contentRoot.setLocalPosition(vec.x, vec.y, vec.z);
                contentRoot.setLocalEulerAngles(vec2.x, vec2.y, vec2.z);
                contentRoot.setLocalScale(1, 1, 1);
            } else {
                contentRoot.setLocalPosition(pos.value.x, pos.value.y, pos.value.z);
                contentRoot.setLocalEulerAngles(rot.value.x, rot.value.y, rot.value.z);
                contentRoot.setLocalScale(scale.value.scale, scale.value.scale, scale.value.scale);
            }

            // calculate scene bounds
            updateBound();

            // update clipping planes
            const boundCenter = bound.center;
            const boundRadius = bound.halfExtents.length();

            mat.getZ(forward);
            mat.getTranslation(translation);

            vec.sub2(boundCenter, translation);
            const dist = -vec.dot(forward);

            const far = dist + boundRadius;
            const near = Math.max(0.0001, dist < boundRadius ? far / 1024 : dist - boundRadius);

            // @ts-ignore
            xr._setClipPlanes(near / 1.5, far * 1.5);

            this.events.fire('xr:update');
        });
    }

    // request to start the xr session
    start() {
        if (!this.available || this.active) {
            return;
        }
        this.events.fire('xr:start');
        this.options.xr.start(this.options.camera.camera, XRTYPE_AR, XRSPACE_LOCAL, {
            callback: (err: Error | null) => {
                if (err) {
                    console.log(err);
                }
            }
        });
    }

    // end the ar session
    end() {
        this.options.xr.end();
    }
}

export { XRObjectPlacementController };
