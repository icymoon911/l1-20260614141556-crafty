/**
 * Entity Prototype Setup
 * ======================
 *
 * Assigns `Crafty.fn` (= `Crafty.prototype`) with the full set of methods
 * every entity inherits: selector logic, component management, attribute
 * access, event binding, lifecycle (destroy / freeze / unfreeze), etc.
 *
 * Also sets `Crafty.fn.extend` so both Crafty and entities can use it.
 *
 * Called once per Crafty instance by the composition root (`core.js`).
 *
 * @param {Object} Crafty      – the Crafty instance being configured
 * @param {Object} state       – shared mutable registries:
 *        { entities, compEntities, GUID, frame }
 * @param {Object} components  – the component definition registry
 * @param {Object} eventBus    – the event bus created by `event-bus.js`
 */

module.exports = function setupEntityPrototype(Crafty, state, components, eventBus) {
    var slice = Array.prototype.slice;
    var rlist = /\s*,\s*/;
    var rspace = /\s+/;

    /**@
     * #Crafty Core
     * @category Core
     * @kind CoreObject
     *
     * @trigger NewEntityName - After setting new name for entity - String - entity name
     * @trigger NewComponent - when a new component is added to the entity - String - Component
     * @trigger RemoveComponent - when a component is removed from the entity - String - Component
     * @trigger Remove - when the entity is removed by calling .destroy()
     *
     * A set of methods added to every single entity.
     */
    Crafty.fn = Crafty.prototype = {
        init: function(selector) {
            // ── String selector → query by component(s) ─────────────
            if (typeof selector === "string") {
                var elem = 0,
                    e,
                    and = false,
                    or = false,
                    del,
                    comps,
                    filteredCompEnts,
                    compEnts,
                    compEnts2,
                    compEnt,
                    i,
                    l;

                if (selector === "*") {
                    i = 0;
                    for (e in state.entities) {
                        this[i] = +e;
                        i++;
                    }
                    this.length = i;
                    if (i === 1) {
                        return state.entities[this[0]];
                    }
                    return this;
                }

                // Multiple components OR
                if (selector.indexOf(",") !== -1) {
                    or = true;
                    del = rlist;
                // Multiple components AND
                } else if (selector.indexOf(" ") !== -1) {
                    and = true;
                    del = rspace;
                }

                if (or) {
                    comps = selector.split(del);
                    filteredCompEnts = {};
                    for (i = 0, l = comps.length; i < l; i++) {
                        compEnts = state.compEntities[comps[i]];
                        for (compEnt in compEnts) {
                            filteredCompEnts[compEnt] = +compEnt;
                        }
                    }
                    for (compEnt in filteredCompEnts) {
                        this[elem++] = filteredCompEnts[compEnt];
                    }
                } else if (and) {
                    comps = selector.split(del);
                    filteredCompEnts = {};
                    compEnts = state.compEntities[comps[0]];
                    compEnts2 = state.compEntities[comps[1]];
                    for (compEnt in compEnts) {
                        if (compEnts2[compEnt] !== undefined)
                            filteredCompEnts[compEnt] = +compEnt;
                    }
                    for (i = 2, l = comps.length; i < l; i++) {
                        compEnts = state.compEntities[comps[i]];
                        for (compEnt in filteredCompEnts) {
                            if (compEnts[compEnt] === undefined)
                                filteredCompEnts[compEnt] = -1;
                        }
                    }
                    for (compEnt in filteredCompEnts) {
                        i = filteredCompEnts[compEnt];
                        if (i >= 0) this[elem++] = i;
                    }
                } else {
                    compEnts = state.compEntities[selector];
                    for (compEnt in compEnts) {
                        this[elem++] = +compEnt;
                    }
                }

                this.length = elem;

                // If exactly one match, return the entity directly
                if (elem === 1) {
                    return state.entities[this[elem - 1]];
                }
            } else {
                // ── Numeric / falsy selector → pick single entity ────
                if (!selector) {
                    // No argument → "God" entity (id 0)
                    selector = 0;
                    if (!(selector in state.entities))
                        state.entities[selector] = this;
                }

                if (!(selector in state.entities)) {
                    this.length = 0;
                    return this;
                }

                this[0] = selector;
                this.length = 1;

                if (!this.__c) this.__c = {};
                if (!this._callbacks) eventBus.addCallbackMethods(this);

                if (!state.entities[selector])
                    state.entities[selector] = this;
                return state.entities[selector];
            }

            eventBus.addCallbackMethods(this);
            return this;
        },

        /**@
         * #.setName
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .setName(String name)
         * @param name - A human readable name for debugging purposes.
         *
         * Set a human readable name for debugging purposes.
         *
         * @example
         * ~~~
         * var ent = Crafty.e().setName("Player");
         * ~~~
         *
         * @see Crafty Core#.getName
         */
        setName: function(name) {
            var entityName = String(name);
            this._entityName = entityName;
            this.trigger("NewEntityName", entityName);
            return this;
        },

        /**@
         * #.getName
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .getName(String name)
         * @returns A human readable name for debugging purposes.
         *
         * Get the human readable name for debugging purposes.
         *
         * @example
         * ~~~
         * var ent = Crafty.e().setName("Player");
         * var name = ent.getName();
         * ~~~
         *
         * @see Crafty Core#.setName
         */
        getName: function() {
            return this._entityName;
        },

        /**@
         * #.addComponent
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .addComponent(String componentList)
         * @param componentList - A string of components to add separated by a comma `,`
         * @sign public this .addComponent(String Component1[, .., String ComponentN])
         * @param Component# - Component ID to add.
         *
         * Adds a component to the selected entities or entity.
         *
         * Components are used to extend the functionality of entities.
         * This means it will copy properties and assign methods to
         * augment the functionality of the entity.
         *
         * If the component has a function named `init` it will be called.
         *
         * If the entity already has the component, the component is skipped (nothing happens).
         *
         * @example
         * ~~~
         * this.addComponent("2D, Canvas");
         * this.addComponent("2D", "Canvas");
         * ~~~
         */
        addComponent: function(id) {
            var comps,
                compName,
                comp,
                c = 0;

            if (arguments.length === 1 && id.indexOf(",") !== -1) {
                comps = id.split(rlist);
            } else {
                comps = arguments;
            }

            for (; c < comps.length; c++) {
                compName = comps[c];

                if (this.__c[compName] === true) {
                    continue;
                }
                this.__c[compName] = true;
                (state.compEntities[compName] =
                    state.compEntities[compName] || {})[this[0]] = this;

                comp = components[compName];
                this.extend(comp);
                if (comp && "required" in comp) {
                    this.requires(comp.required);
                }
                if (comp && "properties" in comp) {
                    var props = comp.properties;
                    for (var propertyName in props) {
                        Object.defineProperty(
                            this,
                            propertyName,
                            props[propertyName]
                        );
                    }
                }
                if (comp && "events" in comp) {
                    var auto = comp.events;
                    for (var eventName in auto) {
                        var fn =
                            typeof auto[eventName] === "function"
                                ? auto[eventName]
                                : comp[auto[eventName]];
                        this.bind(eventName, fn);
                    }
                }
                if (comp && "init" in comp) {
                    comp.init.call(this);
                }
            }

            this.trigger("NewComponent", comps);
            return this;
        },

        /**@
         * #.toggleComponent
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .toggleComponent(String ComponentList)
         * @param ComponentList - A string of components to add or remove separated by a comma `,`
         * @sign public this .toggleComponent(String Component1[, .., String componentN])
         * @param Component# - Component ID to add or remove.
         *
         * Add or Remove Components from an entity.
         *
         * @example
         * ~~~
         * var e = Crafty.e("2D,DOM,Test");
         * e.toggleComponent("Test,Test2"); //Remove Test, add Test2
         * e.toggleComponent("Test,Test2"); //Add Test, remove Test2
         * ~~~
         *
         * ~~~
         * var e = Crafty.e("2D,DOM,Test");
         * e.toggleComponent("Test","Test2"); //Remove Test, add Test2
         * e.toggleComponent("Test","Test2"); //Add Test, remove Test2
         * e.toggleComponent("Test");         //Remove Test
         * ~~~
         */
        toggleComponent: function(toggle) {
            var i = 0,
                l,
                comps;
            if (arguments.length > 1) {
                l = arguments.length;
                for (; i < l; i++) {
                    if (this.has(arguments[i])) {
                        this.removeComponent(arguments[i]);
                    } else {
                        this.addComponent(arguments[i]);
                    }
                }
            } else if (toggle.indexOf(",") !== -1) {
                comps = toggle.split(rlist);
                l = comps.length;
                for (; i < l; i++) {
                    if (this.has(comps[i])) {
                        this.removeComponent(comps[i]);
                    } else {
                        this.addComponent(comps[i]);
                    }
                }
            } else {
                if (this.has(toggle)) {
                    this.removeComponent(toggle);
                } else {
                    this.addComponent(toggle);
                }
            }
            return this;
        },

        /**@
         * #.requires
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .requires(String componentList)
         * @param componentList - List of components that must be added
         *
         * @sign public this .addComponent(String component1, String component2[, .. , ComponentN])
         * @param Component# - A component to add
         *
         * Makes sure the entity has the components listed. If the entity does not
         * have the component, it will add it.
         *
         * (In the current version of Crafty, this function behaves exactly the same
         * as `addComponent`. By convention, developers have used `requires` for
         * component dependencies -- i.e. to indicate specifically that one component
         * will only work properly if another component is present -- and used
         * `addComponent` in all other situations.)
         *
         * @see .addComponent
         */
        requires: function() {
            return this.addComponent.apply(this, arguments);
        },

        /**@
         * #.removeComponent
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .removeComponent(String Component[, soft])
         * @param component - Component to remove
         * @param soft - Whether to soft remove it (defaults to `true`)
         *
         * Removes a component from an entity. A soft remove (the default) will only
         * refrain `.has()` from returning true. Hard will remove all
         * associated properties and methods.
         *
         * @example
         * ~~~
         * var e = Crafty.e("2D,DOM,Test");
         * e.removeComponent("Test");        //Soft remove Test component
         * e.removeComponent("Test", false); //Hard remove Test component
         * ~~~
         */
        removeComponent: function(id, soft) {
            var comp = components[id];
            this.trigger("RemoveComponent", id);
            if (comp && "events" in comp) {
                var auto = comp.events;
                for (var eventName in auto) {
                    var fn =
                        typeof auto[eventName] === "function"
                            ? auto[eventName]
                            : comp[auto[eventName]];
                    this.unbind(eventName, fn);
                }
            }
            if (comp && "remove" in comp) {
                comp.remove.call(this, false);
            }
            if (soft === false && comp) {
                for (var prop in comp) {
                    delete this[prop];
                }
            }
            delete this.__c[id];
            if (state.compEntities[id]) {
                delete state.compEntities[id][this[0]];
            }
            return this;
        },

        /**@
         * #.getId
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public Number .getId(void)
         * @returns the ID of this entity.
         *
         * For better performance, simply use the this[0] property.
         *
         * @example
         * Finding out the `ID` of an entity can be done by returning the property `0`.
         * ~~~
         *    var ent = Crafty.e("2D");
         *    ent[0]; //ID
         *    ent.getId(); //also ID
         * ~~~
         */
        getId: function() {
            return this[0];
        },

        /**@
         * #.has
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public Boolean .has(String component)
         * @param component - The name of the component to check
         * @returns `true` or `false` depending on if the
         * entity has the given component.
         *
         * For better performance, simply use the `.__c` object
         * which will be `true` if the entity has the component or
         * will not exist (or be `false`).
         */
        has: function(id) {
            return !!this.__c[id];
        },

        /**@
         * #.attr
         * @comp Crafty Core
         * @kind Method
         *
         * @trigger Change - when properties change - {key: value}
         *
         * @sign public this .attr(String property, Any value[, Boolean silent[, Boolean recursive]])
         * @param property - Property of the entity to modify
         * @param value - Value to set the property to
         * @param silent - If you would like to supress events
         * @param recursive - If you would like merge recursively
         *
         * Use this method to set any property of the entity.
         *
         * @sign public this .attr(Object map[, Boolean silent[, Boolean recursive]])
         * @param map - Object where each key is the property to modify and the value as the property value
         * @param silent - If you would like to supress events
         * @param recursive - If you would like merge recursively
         *
         * Use this method to set multiple properties of the entity.
         *
         * Setter options:
         * - `silent`: If you want to prevent it from firing events.
         * - `recursive`: If you pass in an object you could overwrite sibling keys, this recursively merges instead of just merging it. This is `false` by default, unless you are using dot notation `name.first`.
         *
         * @sign public Any .attr(String property)
         * @param property - Property of the entity to modify
         * @returns Value - the value of the property
         *
         * Use this method to get any property of the entity. You can also retrieve the property using `this.property`.
         *
         *
         * @example
         * ~~~
         * this.attr({key: "value", prop: 5});
         * this.attr("key"); // returns "value"
         * this.attr("prop"); // returns 5
         * this.key; // "value"
         * this.prop; // 5
         *
         * this.attr("key", "newvalue");
         * this.attr("key"); // returns "newvalue"
         * this.key; // "newvalue"
         *
         * this.attr("parent.child", "newvalue");
         * this.parent; // {child: "newvalue"};
         * this.attr('parent.child'); // "newvalue"
         * ~~~
         */
        attr: function(key, value, silent, recursive) {
            if (arguments.length === 1 && typeof arguments[0] === "string") {
                return this._attr_get(key);
            } else {
                return this._attr_set(key, value, silent, recursive);
            }
        },

        /**
         * Internal getter for entity data.  Called by `.attr`.
         */
        _attr_get: function(key, context) {
            var first, keys, subkey;
            if (typeof context === "undefined" || context === null) {
                context = this;
            }
            if (key.indexOf(".") > -1) {
                keys = key.split(".");
                first = keys.shift();
                subkey = keys.join(".");
                return this._attr_get(keys.join("."), context[first]);
            } else {
                return context[key];
            }
        },

        /**
         * Internal setter for entity data.  Called by `.attr`.
         */
        _attr_set: function() {
            var data, silent, recursive;
            if (typeof arguments[0] === "string") {
                data = this._set_create_object(arguments[0], arguments[1]);
                silent = !!arguments[2];
                recursive = arguments[3] || arguments[0].indexOf(".") > -1;
            } else {
                data = arguments[0];
                silent = !!arguments[1];
                recursive = !!arguments[2];
            }

            if (!silent) {
                this.trigger("Change", data);
            }

            if (recursive) {
                this._recursive_extend(data, this);
            } else {
                this.extend.call(this, data);
            }
            return this;
        },

        /**
         * Build the nested object structure for dot-notation `.attr` calls.
         */
        _set_create_object: function(key, value) {
            var data = {},
                keys,
                first,
                subkey;
            if (key.indexOf(".") > -1) {
                keys = key.split(".");
                first = keys.shift();
                subkey = keys.join(".");
                data[first] = this._set_create_object(subkey, value);
            } else {
                data[key] = value;
            }
            return data;
        },

        /**
         * Recursively merge `new_data` into `original_data`.
         */
        _recursive_extend: function(new_data, original_data) {
            var key;
            for (key in new_data) {
                if (new_data[key].constructor === Object) {
                    original_data[key] = this._recursive_extend(
                        new_data[key],
                        original_data[key]
                    );
                } else {
                    original_data[key] = new_data[key];
                }
            }
            return original_data;
        },

        /**@
         * #.toArray
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .toArray(void)
         *
         * This method will simply return the found entities as an array of ids.  To get an array of the actual entities, use `get()`.
         * @see .get
         */
        toArray: function() {
            return slice.call(this, 0);
        },

        /**@
        * #.timeout
        * @comp Crafty Core
        * @kind Method

        * @sign public this .timeout(Function callback, Number delay)
        * @param callback - Method to execute after given amount of milliseconds
        * @param delay - Amount of milliseconds to execute the method
        *
        * The delay method will execute a function after a given amount of time in milliseconds.
        *
        * Essentially a wrapper for `setTimeout`.
        *
        * @example
        * Destroy itself after 100 milliseconds
        * ~~~
        * this.timeout(function() {
             this.destroy();
        * }, 100);
        * ~~~
        */
        timeout: function(callback, duration) {
            this.each(function() {
                var self = this;
                setTimeout(function() {
                    callback.call(self);
                }, duration);
            });
            return this;
        },

        /**@
         * #.bind
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .bind(String eventName, Function callback)
         * @param eventName - Name of the event to bind to
         * @param callback - Method to execute when the event is triggered
         *
         * Attach the current entity (or entities) to listen for an event.
         *
         * Callback will be invoked when an event with the event name passed
         * is triggered. Depending on the event, some data may be passed
         * via an argument to the callback function.
         *
         * The first argument is the event name (can be anything) whilst the
         * second argument is the callback. If the event has data, the
         * callback should have an argument.
         *
         * Events are arbitrary and provide communication between components.
         * You can trigger or bind an event even if it doesn't exist yet.
         *
         * Unlike DOM events, Crafty events are executed synchronously.
         *
         * @example
         * ~~~
         * this.attr("triggers", 0); //set a trigger count
         * this.bind("myevent", function() {
         *     this.triggers++; //whenever myevent is triggered, increment
         * });
         * this.bind("UpdateFrame", function() {
         *     this.trigger("myevent"); //trigger myevent on every frame
         * });
         * ~~~
         *
         * @see .trigger, .unbind
         */
        bind: function(event, callback) {
            if (this.length === 1) {
                this._bindCallback(event, callback);
            } else {
                for (var i = 0; i < this.length; i++) {
                    var e = state.entities[this[i]];
                    if (e) {
                        e._bindCallback(event, callback);
                    }
                }
            }
            return this;
        },

        /**@
         * #.uniqueBind
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public Number .uniqueBind(String eventName, Function callback)
         * @param eventName - Name of the event to bind to
         * @param callback - Method to execute upon event triggered
         * @returns ID of the current callback used to unbind
         *
         * Works like Crafty.bind, but prevents a callback from being bound multiple times.
         *
         * @see .bind
         */
        uniqueBind: function(event, callback) {
            this.unbind(event, callback);
            this.bind(event, callback);
        },

        /**@
         * #.one
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public Number one(String eventName, Function callback)
         * @param eventName - Name of the event to bind to
         * @param callback - Method to execute upon event triggered
         * @returns ID of the current callback used to unbind
         *
         * Works like Crafty.bind, but will be unbound once the event triggers.
         *
         * @see .bind
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
         * #.unbind
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .unbind(String eventName[, Function callback])
         * @param eventName - Name of the event to unbind
         * @param callback - Function to unbind
         *
         * Removes binding with an event from current entity.
         *
         * Passing an event name will remove all events bound to
         * that event. Passing a reference to the callback will
         * unbind only that callback.
         * @see .bind, .trigger
         */
        unbind: function(event, callback) {
            var i, e;
            for (i = 0; i < this.length; i++) {
                e = state.entities[this[i]];
                if (e) {
                    e._unbindCallbacks(event, callback);
                }
            }
            return this;
        },

        /**@
         * #.trigger
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .trigger(String eventName[, Object data])
         * @param eventName - Event to trigger
         * @param data - Arbitrary data that will be passed into every callback as an argument
         *
         * Trigger an event with arbitrary data. Will invoke all callbacks with
         * the context (value of `this`) of the current entity object.
         *
         * *Note: This will only execute callbacks within the current entity, no other entity.*
         *
         * The first argument is the event name to trigger and the optional
         * second argument is the arbitrary event data. This can be absolutely anything.
         *
         * Unlike DOM events, Crafty events are executed synchronously.
         */
        trigger: function(event, data) {
            if (this.length === 1) {
                this._runCallbacks(event, data);
            } else {
                for (var i = 0; i < this.length; i++) {
                    var e = state.entities[this[i]];
                    if (e) {
                        e._runCallbacks(event, data);
                    }
                }
            }
            return this;
        },

        /**@
         * #.each
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .each(Function method)
         * @param method - Method to call on each iteration
         *
         * Iterates over found entities, calling a function for every entity.
         *
         * The function will be called for every entity and will pass the index
         * in the iteration as an argument. The context (value of `this`) of the
         * function will be the current entity in the iteration.
         *
         * @example
         * Destroy every second 2D entity
         * ~~~
         * Crafty("2D").each(function(i) {
         *     if(i % 2 === 0) {
         *         this.destroy();
         *     }
         * });
         * ~~~
         */
        each: function(func) {
            var i = 0,
                l = this.length;
            for (; i < l; i++) {
                if (!state.entities[this[i]]) continue;
                func.call(state.entities[this[i]], i);
            }
            return this;
        },

        /**@
         * #.get
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public Array .get()
         * @returns An array of entities corresponding to the active selector
         *
         * @sign public Entity .get(Number index)
         * @returns an entity belonging to the current selection
         * @param index - The index of the entity to return.  If negative, counts back from the end of the array.
         *
         *
         * @example
         * Get an array containing every "2D" entity
         * ~~~
         * var arr = Crafty("2D").get()
         * ~~~
         * Get the first entity matching the selector
         * ~~~
         * // equivalent to Crafty("2D").get()[0], but doesn't create a new array
         * var e = Crafty("2D").get(0)
         * ~~~
         * Get the last "2D" entity matching the selector
         * ~~~
         * var e = Crafty("2D").get(-1)
         * ~~~
         *
         */
        get: function(index) {
            var l = this.length;
            if (typeof index !== "undefined") {
                if (index >= l || index + l < 0) return undefined;
                if (index >= 0) return state.entities[this[index]];
                else return state.entities[this[index + l]];
            } else {
                var i = 0,
                    result = [];
                for (; i < l; i++) {
                    if (!state.entities[this[i]]) continue;
                    result.push(state.entities[this[i]]);
                }
                return result;
            }
        },

        /**@
         * #.clone
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public Entity .clone(void)
         * @returns Cloned entity of the current entity
         *
         * Method will create another entity with the exact same
         * properties, components and methods as the current entity.
         */
        clone: function() {
            var comps = this.__c,
                comp,
                prop,
                clone = Crafty.e();

            for (comp in comps) {
                clone.addComponent(comp);
            }
            for (prop in this) {
                if (
                    prop !== "0" &&
                    prop !== "_global" &&
                    prop !== "_changed" &&
                    typeof this[prop] !== "function" &&
                    typeof this[prop] !== "object"
                ) {
                    clone[prop] = this[prop];
                }
            }

            return clone;
        },

        /**@
         * #.setter
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .setter(String property, Function callback)
         * @param property - Property to watch for modification
         * @param callback - Method to execute if the property is modified
         *
         * Will watch a property waiting for modification and will then invoke the
         * given callback when attempting to modify.
         *
         * This feature is deprecated; use .defineField() instead.
         * @see .defineField
         */
        setter: function(prop, callback) {
            return this.defineField(prop, function() {}, callback);
        },

        /**@
         * #.defineField
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .defineField(String property, Function getCallback, Function setCallback)
         * @param property - Property name to assign getter & setter to
         * @param getCallback - Method to execute if the property is accessed
         * @param setCallback - Method to execute if the property is mutated
         *
         * Assigns getters and setters to the property.
         * A getter will watch a property waiting for access and will then invoke the
         * given getCallback when attempting to retrieve.
         * A setter will watch a property waiting for mutation and will then invoke the
         * given setCallback when attempting to modify.
         *
         * @example
         * ~~~
         * var ent = Crafty.e("2D");
         * ent.defineField("customData", function() {
         *    return this._customData;
         * }, function(newValue) {
         *    this._customData = newValue;
         * });
         *
         * ent.customData = "2" // set customData to 2
         * Crafty.log(ent.customData) // prints 2
         * ~~~
         */
        defineField: function(prop, getCallback, setCallback) {
            Crafty.defineField(this, prop, getCallback, setCallback);
            return this;
        },

        /**@
         * #.destroy
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .destroy(void)
         * Will remove all event listeners and delete all properties as well as removing from the stage
         */
        destroy: function() {
            this.each(function() {
                var comp;
                this.trigger("Remove");
                for (var compName in this.__c) {
                    comp = components[compName];
                    if (comp && "remove" in comp)
                        comp.remove.call(this, true);
                    delete state.compEntities[compName][this[0]];
                }
                this._unbindAll();
                delete state.entities[this[0]];
            });
        },

        /**@
         * #.freeze
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .freeze()
         *
         * @triggers Freeze - Directly before the entity is frozen
         *
         * Freezes the entity.  A frozen entity will not receive events or be displayed by graphics systems.
         * It is also removed from the spatial map, which means it will not be found by collisions,
         * raycasting, or similar functions.
         *
         * This method may be called upon a collection of entities.
         *
         * @note Because the entity no longer listens to events, modifying its properties can result in an inconsistent state.
         *
         * If custom components need to handle frozen entities, they can listen to the "Freeze" event, which will be triggered before the event system is disabled.
         *
         * @example
         *
         * ```
         * // Freeze all entities with the Dead component
         * Crafty("Dead").freeze();
         * ```
         *
         * @see .unfreeze
         */
        freeze: function() {
            if (this.length === 1 && !this.__frozen) {
                this.trigger("Freeze", this);
                this._freezeCallbacks();
                this.__frozen = true;
            } else {
                for (var i = 0; i < this.length; i++) {
                    var e = state.entities[this[i]];
                    if (e && !e.__frozen) {
                        e.trigger("Freeze", e);
                        e._freezeCallbacks();
                        e.__frozen = true;
                    }
                }
            }
            return this;
        },

        /**#
         * #.unfreeze
         * @comp Crafty Core
         * @kind Method
         *
         * @sign public this .unfreeze()
         *
         * @triggers Unfreeze - While the entity is being unfrozen
         *
         * Unfreezes the entity, allowing it to receive events, inserting it back into the spatial map,
         * and restoring it to its previous visibility.
         *
         * This method may be called upon a collection of entities.
         *
         * If a custom component needs to know when an entity is unfrozen, they can listen to the "Unfreeze"" event.
         *
         * @example
         * ```
         * // Bring the dead back to life!
         * Crafty("Dead").unfreeze().addComponent("Undead");
         * ```
         */
        unfreeze: function() {
            if (this.length === 1 && this.__frozen) {
                this.__frozen = false;
                this._unfreezeCallbacks();
                this.trigger("Unfreeze", this);
            } else {
                for (var i = 0; i < this.length; i++) {
                    var e = state.entities[this[i]];
                    if (e && e.__frozen) {
                        e.__frozen = false;
                        e._unfreezeCallbacks();
                        e.trigger("Unfreeze", e);
                    }
                }
            }
            return this;
        }
    };

    // ── Wire up the prototype chain ──────────────────────────────────
    Crafty.fn.init.prototype = Crafty.fn;

    // Share `extend` between Crafty (static) and entities (instance).
    // `Crafty.extend` was already defined in core.js before calling this function.
    Crafty.fn.extend = Crafty.extend;
};
