/**
 * Crafty — Composition Root
 * =========================
 *
 * This module is the single entry point that every other file in the project
 * `require`s to obtain the `Crafty` object.  It no longer contains all logic
 * inline; instead it **wires together** focused sub-modules:
 *
 *   - `event-bus`   — global event handler table + callback mix-in methods
 *   - `settings`    — named-settings registry with change callbacks
 *   - `game-loop`   — the tick / update / render cycle
 *   - `entity`      — entity prototype (selector, components, lifecycle …)
 *
 * Each stateful sub-module is a **factory**, so calling `require("crafty-headless")()`
 * produces a fully isolated Crafty instance — critical for tests and server-side use.
 *
 * ## Shared mutable state
 *
 * The registries below (`entities`, `compEntities`, `components`) and the
 * `frameState` counter are the *only* module-level mutable values owned here.
 * They are passed by reference to the sub-modules that need them, making the
 * dependency graph explicit and easy to reason about.
 */

var version = require("./version");

// ── Stateful sub-modules (factories) ────────────────────────────────
var createEventBus  = require("./event-bus");
var createSettings  = require("./settings");
var createGameLoop  = require("./game-loop");
var setupEntity     = require("./entity");

// ── Internal registries ─────────────────────────────────────────────
var components   = {};    // componentName → component definition
var state        = {      // mutable state shared with entity / selector code
    GUID:         1,
    frame:        0,
    entities:     {},     // entityId → entity object
    compEntities: {},     // componentName → { entityId → entity }
    onloads:      []
};
// frameState is the bridge between core.js and the game-loop module.
// Both read/write `value` through the same object reference.
var frameState   = { value: 0 };

// ── Instantiate per-instance services ───────────────────────────────
var eventBus = createEventBus();

// ── The Crafty function / selector entry point ──────────────────────

/**@
 * #Crafty
 * @category Core
 * @kind CoreObject
 *
 * `Crafty` is both an object, and a function for selecting entities.
 * Its many methods and properties are discussed individually.
 * Below is the documentation for use as a selector.
 *
 * @sign public EntitySelection Crafty( String selector)
 * @param selector - A string representing which entities to select
 *
 * @sign public Entity Crafty( Number selector )
 * @param selector - An entity's id
 *
 * Select a set of or single entities by components or an entity's ID.
 *
 * Crafty uses syntax similar to jQuery by having a selector engine to select entities by their components.
 *
 * If there is more than one match, the return value is an Array-like object listing the ID numbers of each matching entity. If there is exactly one match, the entity itself is returned. If you're not sure how many matches to expect, check the number of matches via Crafty(...).length. Alternatively, use Crafty(...).each(...), which works in all cases.
 *
 * @note You can treat an entity as if it was a selection of length 1 -- it implements all the same methods.
 *
 * @example
 * ~~~
 *    Crafty("MyComponent")
 *    Crafty("Hello 2D Component")
 *    Crafty("Hello, 2D, Component")
 * ~~~
 *
 * The first selector will return all entities that have the component `MyComponent`. The second will return all entities that have `Hello` and `2D` and `Component` whereas the last will return all entities that have at least one of those components (or).
 *
 * ~~~
 *   Crafty("*")
 * ~~~
 * Passing `*` will select all entities.
 *
 * ~~~
 *   Crafty(1)
 * ~~~
 * Passing an integer will select the entity with that `ID`.
 *
 * To work directly with an array of entities, use the `get()` method on a selection.
 * To call a function in the context of each entity, use the `.each()` method.
 *
 * The event related methods such as `bind` and `trigger` will work on selections of entities.
 *
 * @see Crafty Core#.get
 * @see Crafty Core#.each
 */
var Crafty = function(selector) {
    return new Crafty.fn.init(selector);
};

// ── Crafty.extend (shallow copy onto target) ────────────────────────
// Defined early so it is available before entity prototype setup and
// before the large `Crafty.extend({ … })` block below.

/**@
 * #Crafty.extend
 * @category Core
 * @kind Method
 *
 * @sign public this Crafty.extend(Object obj)
 * @param obj - An object whose fields will be copied onto Crafty.  This is a shallow copy.
 *
 * Used to extend the Crafty namespace by passing in an object of properties and methods to add.
 *
 * @example
 * ~~~ *
 * Crafty.extend({
 *   isArray: function(arg){
 *     return Object.prototype.toString.call(arg) === '[object Array]'
 *   }
 * });
 *
 * Crafty.isArray([4, 5, 6]);  // returns true
 * Crafty.isArray('hi');       // returns false
 * ~~~
 */
Crafty.extend = function(obj) {
    var target = this,
        key;

    // don't bother with nulls
    if (!obj) return target;

    for (key in obj) {
        if (target === obj[key]) continue; // handle circular reference
        target[key] = obj[key];
    }

    return target;
};

// ── Wire in the event bus ───────────────────────────────────────────
// Expose the low-level helpers so that external modules (e.g. systems.js)
// can continue to call `Crafty._addCallbackMethods(obj)`.
Crafty._callbackMethods    = eventBus.callbackMethods;
Crafty._addCallbackMethods = eventBus.addCallbackMethods;

// Give Crafty itself event-bus capabilities (bind, trigger, etc.)
eventBus.addCallbackMethods(Crafty);

// ── Wire in entity prototype ────────────────────────────────────────
// This sets Crafty.fn = Crafty.prototype and Crafty.fn.extend.
setupEntity(Crafty, state, components, eventBus);

// ── Wire in the game loop ───────────────────────────────────────────
Crafty.timer = createGameLoop(Crafty, frameState);

// ── Wire in settings ────────────────────────────────────────────────

// ── State reset helper ──────────────────────────────────────────────
// Called by `Crafty.stop(true)` to wipe all transient game state while
// preserving component *definitions* (they survive across restarts).
function initState() {
    state.GUID         = 1;
    state.entities     = {};
    state.compEntities = {};
    state.onloads      = [];
    frameState.value   = 0;
    eventBus.resetHandlers();
    // Re-attach Crafty's own callback methods after handler table is cleared
    eventBus.addCallbackMethods(Crafty);
}

// ── Unique-ID generator ─────────────────────────────────────────────
function UID() {
    var id = state.GUID++;
    if (id in state.entities) {
        return UID(); // recurse until unique
    }
    return id;
}

// ── Deep-clone utility ──────────────────────────────────────────────

/**@
 * #Crafty.clone
 * @category Core
 * @kind Method
 *
 * @sign public Object .clone(Object obj)
 * @param obj - an object
 *
 * Deep copy (a.k.a clone) of an object.
 * @note This function should be used for plain objects with no cyclic references. To clone an entity use its `.clone` method instead.
 *
 * @example
 * ~~~
 * // Null or Primitive types
 * Crafty.clone(null); // returns null
 * Crafty.clone(4);    // returns 4
 *
 * // Objects
 * var globalCount = 0;
 * var obj1 = {
 *   count: 0,
 *   inc: function(){
 *      this.count++;
 *      globalCount++;
 *   },
 *   log: function(){
 *     console.log(this.count + '/' + globalCount);
 *   }
 * };
 *
 * obj1.inc();
 * obj1.log(); // prints "1/1" to the log
 *
 * var obj2 = Crafty.clone(obj1);
 * obj2.log(); // prints "1/1" to the log
 *
 * obj1.inc();
 * obj1.log(); // prints "2/2" to the log
 * obj2.log(); // prints "1/2" to the log
 * ~~~
 *
 * @see Crafty Core#.clone
 */
function clone(obj) {
    if (obj === null || typeof obj !== "object") return obj;

    var temp = obj.constructor();

    for (var key in obj) temp[key] = clone(obj[key]);
    return temp;
}

// ── Crafty-level API methods ────────────────────────────────────────
Crafty.extend({
    // Define Crafty's id
    0: "global",

    /**@
     * #Crafty.init
     * @category Core
     * @kind Method
     *
     * @trigger Load - Just after the viewport is initialised. Before the UpdateFrame loops is started
     * @sign public this Crafty.init([Number width, Number height, String stage_elem])
     * @sign public this Crafty.init([Number width, Number height, HTMLElement stage_elem])
     * @param Number width - Width of the stage
     * @param Number height - Height of the stage
     * @param String or HTMLElement stage_elem - the element to use for the stage
     *
     * Sets the element to use as the stage, creating it if necessary.  By default a div with id 'cr-stage' is used, but if the 'stage_elem' argument is provided that will be used instead.  (see `Crafty.viewport.init`)
     *
     * Starts the `UpdateFrame` interval. This will call the `UpdateFrame` event for every frame.
     *
     * Can pass width and height values for the stage otherwise will default to window size.
     *
     * All `Load` events will be executed.
     *
     * Uses `requestAnimationFrame` to sync the drawing with the browser but will default to `setInterval` if the browser does not support it.
     * @see Crafty.stop,  Crafty.viewport
     */
    init: function(w, h, stage_elem) {
        // If necessary, attach any event handlers registered before Crafty started
        if (!this._preBindDone) {
            for (var i = 0; i < this._bindOnInit.length; i++) {
                var preBind = this._bindOnInit[i];
                Crafty.bind(preBind.event, preBind.handler);
            }
        }

        // The viewport will init things like the default graphics layers as well
        Crafty.viewport.init(w, h, stage_elem);

        //call all arbitrary functions attached to onload
        this.trigger("Load");
        this.timer.init();

        return this;
    },

    /**@
     * #Crafty.initAsync
     * @category Core
     * @kind Method
     *
     * @trigger Load - Just after the viewport is initialised. Before the UpdateFrame loops is started
     * @sign public this Crafty.initAsync([Array loaders], [Number width, Number height, String stage_elem])
     * @param Array loaders An array that can contain a mix of Promises, or functions that Promises
     * @param Number width - Width of the stage
     * @param Number height - Height of the stage
     * @param String or HTMLElement stage_elem - the element to use for the stage
     *
     * A version of Crafty.init that uses Promises to load any needed resources before initialization.
     *
     * The first argument is an array of either Promises, or functions that return promises.
     * In the second case, a Promise will be generated by invoking the function with the current Crafty instance as an argument.
     * (The array can be a mixture of the two types.)
     *
     * Once all promises are ready, and the document itself has loaded, Crafty.init will be invoked with the `w`, `h`, and `stage_elem` arguments.
     *
     * The method returns a Promise whose fufillment is an array of each passed in promises fufillment,
     * and whose rejection is the rejection of the first promise to fail.  (Essentially the same as Promise.all)
     *
     * @see Crafty.init
     */
    initAsync: function(loaders, w, h, stage_elem) {
        // first argument is optional
        if (typeof loaders !== "object") {
            stage_elem = h;
            h = w;
            w = loaders;
            loaders = [];
        }

        var promises = [];
        for (var i in loaders) {
            if (typeof loaders[i] === "function") {
                promises.push(loaders[i](Crafty));
            } else {
                promises.push(loaders[i]);
            }
        }

        // wait for document loading if necessary
        if (document.readyState !== "complete") {
            var window_load = new Promise(function(resolve, reject) {
                window.onload = resolve;
                promises.push(window_load);
            });
        }

        return Promise.all(promises).then(function(values) {
            Crafty.init(w, h, stage_elem);
            // Return results only for promises passed in with the loaders array
            return values.slice(0, loaders.length);
        });
    },

    // There are some events that need to be bound to Crafty when it's started/restarted, so store them here
    // Switching Crafty's internals to use the new system idiom should allow removing this hack
    _bindOnInit: [],
    _preBindDone: false,
    _preBind: function(event, handler) {
        this._bindOnInit.push({
            event: event,
            handler: handler
        });
    },

    /**@
     * #Crafty.getVersion
     * @category Core
     * @kind Method
     *
     * @sign public String Crafty.getVersion()
     * @returns Current version of Crafty as a string
     *
     * Return current version of crafty
     *
     * @example
     * ~~~
     * Crafty.getVersion(); //'0.5.2'
     * ~~~
     */
    getVersion: function() {
        return version;
    },

    /**@
     * #Crafty.stop
     * @category Core
     * @kind Method
     *
     * @trigger CraftyStop - when the game is stopped  - {bool clearState}
     * @sign public this Crafty.stop([bool clearState])
     * @param clearState - if true the stage and all game state is cleared.
     *
     * Stops the `UpdateFrame` interval and removes the stage element.
     *
     * To restart, use `Crafty.init()`.
     * @see Crafty.init
     */

    stop: function(clearState) {
        Crafty.trigger("CraftyStop", clearState);

        this.timer.stop();
        if (clearState) {
            // Remove audio
            Crafty.audio.remove();

            //Destroy all systems
            for (var s in Crafty._systems) {
                Crafty._systems[s].destroy();
            }

            // Remove the stage element, and re-add a div with the same id
            if (Crafty.stage && Crafty.stage.elem.parentNode) {
                var newCrStage = document.createElement("div");
                newCrStage.id = Crafty.stage.elem.id;
                Crafty.stage.elem.parentNode.replaceChild(
                    newCrStage,
                    Crafty.stage.elem
                );
            }

            // Reset all transient state
            initState();

            // Indicate that prebound functions need to be bound on init again
            this._preBindDone = false;
        }
        return this;
    },

    /**@
     * #Crafty.pause
     * @category Core
     * @kind Method
     *
     * @trigger Pause - when the game is paused
     * @trigger Unpause - when the game is unpaused
     * @sign public this Crafty.pause(void)
     *
     * Pauses the game by stopping the `UpdateFrame` event from firing. If the game is already paused it is unpaused.
     * You can pass a boolean parameter if you want to pause or unpause no matter what the current state is.
     * Modern browsers pauses the game when the page is not visible to the user. If you want the Pause event
     * to be triggered when that happens you can enable autoPause in `Crafty.settings`.
     *
     * @example
     * Have an entity pause the game when it is clicked.
     * ~~~
     * button.bind("click", function() {
     *     Crafty.pause();
     * });
     * ~~~
     */
    pause: function(toggle) {
        if (arguments.length === 1 ? toggle : !this._paused) {
            this.trigger("Pause");
            this._paused = true;
            setTimeout(function() {
                Crafty.timer.stop();
            }, 0);
        } else {
            this.trigger("Unpause");
            this._paused = false;
            setTimeout(function() {
                Crafty.timer.init();
            }, 0);
        }
        return this;
    },

    /**@
     * #Crafty.isPaused
     * @category Core
     * @kind Method
     *
     * @sign public Boolean Crafty.isPaused()
     * @returns Whether the game is currently paused.
     *
     * @example
     * ~~~
     * Crafty.isPaused();
     * ~~~
     */
    isPaused: function() {
        return this._paused;
    },

    /**@
     * #Crafty.e
     * @category Core
     * @kind Method
     *
     * @trigger NewEntity - When the entity is created and all components are added - { id:Number }
     * @sign public Entity Crafty.e(String componentList)
     * @param componentList - List of components to assign to new entity
     * @sign public Entity Crafty.e(String component1[, .., String componentN])
     * @param Component# - Component to add
     *
     * Creates an entity. Any arguments will be applied in the same
     * way `.addComponent()` is applied as a quick way to add components.
     *
     * Any component added will augment the functionality of
     * the created entity by assigning the properties and methods from the component to the entity.
     *
     * @example
     * ~~~
     * var myEntity = Crafty.e("2D, DOM, Color");
     * ~~~
     *
     * @see Crafty.c
     */
    e: function() {
        var id = UID();
        state.entities[id] = null;
        state.entities[id] = Crafty(id);

        if (arguments.length > 0) {
            state.entities[id].addComponent.apply(state.entities[id], arguments);
        }
        state.entities[id].setName("Entity #" + id);
        state.entities[id].addComponent("obj");

        Crafty.trigger("NewEntity", { id: id });

        return state.entities[id];
    },

    /**@
     * #Crafty.c
     * @category Core
     * @kind Method
     *
     * @sign public void Crafty.c(String name, Object component)
     * @param name - Name of the component
     * @param component - Object with the component's properties and methods
     *
     * Creates a component where the first argument is the ID and the second
     * is the object that will be inherited by entities.
     *
     * Specifically, each time a component is added to an entity, the component properties are copied over to the entity.
     * * In the case of primitive datatypes (booleans, numbers, strings) the property is copied by value.
     * * In the case of complex datatypes (objects, arrays, functions) the property is copied by reference and will thus reference the components' original property.
     * * (See the two examples below for further explanation)
     * Note that when a component method gets called, the `this` keyword will refer to the current entity the component was added to.
     *
     * A handful of methods or properties are treated specially. They are invoked in partiular contexts, and (in those contexts) cannot be overridden by other components.
     *
     * - `required`: A string listing required components, which will be added to the component before `init()` runs.
     * - `init`: A function to be called when the component is added to an entity
     * - `remove`: A function which will be called just before a component is removed, or before an entity is destroyed. It is passed a single boolean parameter that is `true` if the entity is being destroyed.
     * - `events`: An object whose properties represent functions bound to events equivalent to the property names.  (See the example below.)  The binding occurs directly after the call to `init`, and will be removed directly before `remove` is called.
     * - `properties`: A dictionary of properties which will be defined using Object.defineProperty.  Typically used to add setters and getters.
     *
     * In addition to these hardcoded special methods, there are some conventions for writing components.
     *
     * - Properties or methods that start with an underscore are considered private.
     * - A method with the same name as the component is considered to be a constructor
     * and is generally used when you need to pass configuration data to the component on a per entity basis.
     *
     * @example
     * ~~~
     * Crafty.c("Annoying", {
     *     _message: "HiHi",
     *     init: function() {
     *         this.bind("UpdateFrame", function() { alert(this.message); });
     *     },
     *     annoying: function(message) { this.message = message; }
     * });
     *
     * Crafty.e("Annoying").annoying("I'm an orange...");
     * ~~~
     * To attach to the "UpdateFrame" event using the `events` property instead:
     * ~~~
     * Crafty.c("Annoying", {
     *     _message: "HiHi",
     *     events: {
     *         "UpdateFrame": function(){alert(this.message);}
     *     }
     *     annoying: function(message) { this.message = message; }
     * });
     * ~~~
     *
     *
     * @warning In the examples above the field _message is local to the entity.
     * That is, if you create many entities with the Annoying component, they can all have different values for _message.
     * That is because it is a simple value, and simple values are copied by value.
     * If however the field had been an object or array,
     * the value would have been shared by all entities with the component,
     * because complex types are copied by reference in javascript.
     * This is probably not what you want and the following example demonstrates how to work around it.
     *
     * ~~~
     * Crafty.c("MyComponent", {
     *     _iAmShared: { a: 3, b: 4 },
     *     init: function() {
     *         this._iAmNotShared = { a: 3, b: 4 };
     *     },
     * });
     * ~~~
     *
     * @see Crafty.e
     */
    c: function(compName, component) {
        components[compName] = component;
    },

    /**@
     * #Crafty.trigger
     * @category Core, Events
     * @kind Method
     *
     * @sign public void Crafty.trigger(String eventName, * data)
     * @param eventName - Name of the event to trigger
     * @param data - Arbitrary data to pass into the callback as an argument
     *
     * This method will trigger every single callback attached to the event name. This means
     * every global event and every entity that has a callback.
     *
     * @see Crafty.bind
     */
    trigger: function(event, data) {
        eventBus.triggerGlobal(event, data);
    },

    /**@
     * #Crafty.bind
     * @category Core, Events
     * @kind Method
     *
     * @sign public Function bind(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns callback function which can be used for unbind
     *
     * Binds to a global event. Method will be executed when `Crafty.trigger` is used
     * with the event name.
     *
     * @see Crafty.trigger, Crafty.unbind
     */
    bind: function(event, callback) {
        this._bindCallback(event, callback);
        return callback;
    },

    /**@
     * #Crafty.uniqueBind
     * @category Core, Events
     * @kind Method
     *
     * @sign public Function uniqueBind(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns callback function which can be used for unbind
     *
     * Works like Crafty.bind, but prevents a callback from being bound multiple times.
     *
     * @see Crafty.bind
     */
    uniqueBind: function(event, callback) {
        this.unbind(event, callback);
        return this.bind(event, callback);
    },

    /**@
     * #Crafty.one
     * @category Core, Events
     * @kind Method
     *
     * @sign public Function one(String eventName, Function callback)
     * @param eventName - Name of the event to bind to
     * @param callback - Method to execute upon event triggered
     * @returns callback function which can be used for unbind
     *
     * Works like Crafty.bind, but will be unbound once the event triggers.
     *
     * @see Crafty.bind
     */
    one: function(event, callback) {
        var self = this;
        var oneHandler = function(data) {
            callback.call(self, data);
            self.unbind(event, oneHandler);
        };
        return self.bind(event, oneHandler);
    },

    /**@
     * #Crafty.unbind
     * @category Core, Events
     * @kind Method
     *
     * @sign public Boolean Crafty.unbind(String eventName, Function callback)
     * @param eventName - Name of the event to unbind
     * @param callback - Function to unbind
     * @example
     * ~~~
     *    var play_gameover_sound = function () {...};
     *    Crafty.bind('GameOver', play_gameover_sound);
     *    ...
     *    Crafty.unbind('GameOver', play_gameover_sound);
     * ~~~
     *
     * The first line defines a callback function. The second line binds that
     * function so that `Crafty.trigger('GameOver')` causes that function to
     * run. The third line unbinds that function.
     *
     * ~~~
     *    Crafty.unbind('GameOver');
     * ~~~
     *
     * This unbinds ALL global callbacks for the event 'GameOver'. That
     * includes all callbacks attached by `Crafty.bind('GameOver', ...)`, but
     * none of the callbacks attached by `some_entity.bind('GameOver', ...)`.
     */
    unbind: function(event, callback) {
        this._unbindCallbacks(event, callback);
    },

    /**@
     * #Crafty.frame
     * @category Core
     * @kind Method
     *
     * @sign public Number Crafty.frame(void)
     * @returns the current frame number
     */
    frame: function() {
        return frameState.value;
    },

    entities: function() {
        return state.entities;
    },

    components: function() {
        return components;
    },

    isComp: function(comp) {
        return comp in components;
    },

    debug: function(str) {
        // access internal variables - handlers or entities
        if (str === "handlers") {
            return eventBus.handlers;
        }
        return state.entities;
    },

    /**@
     * #Crafty.settings
     * @category Core
     * @kind CoreObject
     *
     * Modify the inner workings of Crafty through the settings.
     */
    settings: createSettings(),

    /**@
     * #Crafty.defineField
     * @category Core
     * @kind Method
     *
     * @sign public void Crafty.defineField(Object object, String property, Function getCallback, Function setCallback)
     * @param object - Object to define property on
     * @param property - Property name to assign getter & setter to
     * @param getCallback - Method to execute if the property is accessed
     * @param setCallback - Method to execute if the property is mutated
     *
     * Assigns getters and setters to the property in the given object.
     * A getter will watch a property waiting for access and will then invoke the
     * given getCallback when attempting to retrieve.
     * A setter will watch a property waiting for mutation and will then invoke the
     * given setCallback when attempting to modify.
     *
     * @example
     * ~~~
     * var ent = Crafty.e("2D");
     * Crafty.defineField(ent, "customData", function() {
     *    return this._customData;
     * }, function(newValue) {
     *    this._customData = newValue;
     * });
     *
     * ent.customData = "2" // set customData to 2
     * Crafty.log(ent.customData) // prints 2
     * ~~~
     * @see Crafty Core#.defineField
     */
    defineField: function(obj, prop, getCallback, setCallback) {
        Object.defineProperty(obj, prop, {
            get: getCallback,
            set: setCallback,
            configurable: false,
            enumerable: true
        });
    },

    clone: clone
});

// ── AMD / module export ─────────────────────────────────────────────
if (typeof define === "function") {
    // AMD
    // jshint ignore:start
    define("crafty", [], function() {
        return Crafty;
    });
    // jshint ignore:end
}

module.exports = Crafty;
