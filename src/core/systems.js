var Crafty = require("../core/core.js");

// ═══════════════════════════════════════════════════════════════════
// System Registry
// ═══════════════════════════════════════════════════════════════════
// All registered systems live here, keyed by name.
// This is the single source of truth for "what systems exist".
Crafty._systems = {};

// ═══════════════════════════════════════════════════════════════════
// Internal helpers (module-local, NOT exposed on Crafty)
// ═══════════════════════════════════════════════════════════════════
// These encapsulate the mechanics of lazy registration, system creation,
// and safe teardown so that the public `Crafty.s()` API stays simple and
// all paths funnel through the same creation code.

var systemID = 1;

/**
 * Instantiate the system from its template, store it on `Crafty._systems`,
 * and announce it with `SystemLoaded`.
 *
 * This is the single place a system is actually created: both eager
 * registration and the lazy getter funnel through here, so the storage
 * slot and the event are always handled the same way and SystemLoaded
 * fires exactly once per instantiation.
 *
 * We install the instance with `defineProperty` (rather than a plain
 * assignment) so it cleanly replaces a pending lazy getter, and so the
 * system is in place before any SystemLoaded handler runs and looks it up.
 */
function _instantiateSystem(name, template, options) {
    var system = new Crafty.CraftySystem(name, template, options);
    Object.defineProperty(Crafty._systems, name, {
        value: system,
        writable: true,
        enumerable: true,
        configurable: true
    });
    Crafty.trigger("SystemLoaded", name);
    return system;
}

/**
 * Defer creation until the system is first referenced.
 *
 * Installs a getter on `Crafty._systems` that, on first access, replaces
 * itself with the real system via `_instantiateSystem` – so a system that
 * is never used is never built.
 */
function _registerLazySystem(name, template, options) {
    Object.defineProperty(Crafty._systems, name, {
        get: function() {
            return _instantiateSystem(name, template, options);
        },
        configurable: true
    });
}

/**
 * Check whether a system (or lazy placeholder) is already registered
 * under the given name.
 */
function _hasSystem(name) {
    return (
        Object.getOwnPropertyDescriptor(Crafty._systems, name) !== undefined
    );
}

/**
 * Safely tear down whatever currently occupies `name` in the registry.
 *
 * Handles three cases:
 *   1. Nothing registered → no-op.
 *   2. A lazy getter that was never materialised → just delete the getter.
 *   3. A fully-initialised system → call its destroy() so that
 *      SystemDestroyed fires, remove() runs, and callbacks are cleaned up.
 *
 * Called automatically when a system is re-registered under a name that
 * is already in use, preventing leaked listeners and zombie state.
 */
function _teardownExistingSystem(name) {
    var descriptor = Object.getOwnPropertyDescriptor(Crafty._systems, name);
    if (!descriptor) return;

    // Lazy getter that was never accessed – just remove the placeholder
    if (typeof descriptor.get === "function") {
        delete Crafty._systems[name];
        return;
    }

    // Materialised system – destroy it properly
    var system = Crafty._systems[name];
    if (system && typeof system.destroy === "function") {
        system.destroy();
    } else {
        // Degenerate case: just clean up the slot
        delete Crafty._systems[name];
    }
}

/**
 * Single entry point for registering a system.
 *
 * Builds it right away only when explicitly non-lazy (`lazy === false`);
 * anything else (including the omitted default) stays lazy, preserving
 * the historical behaviour.
 */
function _registerSystem(name, template, options, lazy) {
    // If something already occupies this name, clean it up first
    _teardownExistingSystem(name);

    if (lazy === false) {
        _instantiateSystem(name, template, options);
    } else {
        _registerLazySystem(name, template, options);
    }
}

// ═══════════════════════════════════════════════════════════════════
// Internal API exposed on Crafty (used by Crafty.stop, etc.)
// ═══════════════════════════════════════════════════════════════════

/**
 * Destroy every registered system.
 *
 * Collects the current systems into a snapshot array first, then destroys
 * them one by one.  This avoids the iteration hazard where `destroy()`
 * deletes a key from `_systems` while we are still looping over it.
 *
 * Called internally by `Crafty.stop(clearState)`.
 */
Crafty._destroyAllSystems = function() {
    var snapshot = [];
    for (var name in Crafty._systems) {
        var system = Crafty._systems[name];
        if (system && typeof system.destroy === "function") {
            snapshot.push(system);
        }
    }
    for (var i = 0; i < snapshot.length; i++) {
        snapshot[i].destroy();
    }
};

// ═══════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════

/**@
 * #Crafty.s
 * @category Core
 * @kind Method
 *
 * Registers a system, or retrieves an existing one.
 *
 * @trigger SystemLoaded - After the system has been fully initialised - String - system name
 * @trigger SystemDestroyed - Right before the system is destroyed - obj - system object
 *
 * @sign void Crafty.s(String name, Obj template[, Obj options][, Boolean lazy])
 * Register a system.
 * @param name - The name of the system.
 * @param template - An object whose methods and properties will be copied to the new system.
 * @param options - An object whose properties will be deep copied to the new system's `options` property.
 * @param lazy - When `false` the system is initialised immediately.
 *               When `true` (or omitted) the system is initialised on first access via `Crafty.s(name)`.
 *
 * @sign System Crafty.s(String name)
 * Access the named system.
 * @param name - The system to return.
 * @returns The referenced system.  If the system was registered as lazy and
 *          has not yet been initialised, it will be initialised before being returned.
 *
 * Objects which handle entities might want to subscribe to the event system without being entities themselves.
 * When you declare a system with a template object, all the methods and properties of that template are copied to a new object.
 * This new system will automatically have the following event related methods, which function like those of components:
 * `.bind()`, `unbind()`, `trigger()`, `one()`, `uniqueBind()`, `destroy()`.
 * Much like components, you can also provide `init()` and `remove()` methods,
 * a `properties` dictionary which will be used to define properties with Object.defineProperty,
 * as well as an `events` parameter for automatically binding to events.
 *
 * If a system with the same name already exists it is destroyed first
 * (firing `SystemDestroyed` and running its `remove()` hook) before the
 * new system is registered.
 *
 * @note The `init()` method is for setting up the internal state of the system.
 * If you create entities in it that then reference the system, that'll create an infinite loop.
 */
Crafty.s = function(name, obj, options, lazy) {
    // ── Getter form ─────────────────────────────────────────────
    // With no template object this is an access, not a registration.
    if (!obj) {
        return Crafty._systems[name];
    }

    // ── Registration form ───────────────────────────────────────
    // The lazy flag may be supplied in place of the options argument.
    if (typeof options === "boolean") {
        lazy = options;
        options = null;
    }

    _registerSystem(name, obj, options, lazy);
};

// ═══════════════════════════════════════════════════════════════════
// CraftySystem – the per-system object type
// ═══════════════════════════════════════════════════════════════════
//
// Construction order (important for event timing):
//   1. Copy template members onto `this`           (extend)
//   2. Merge options                               (_mergeOptions)
//   3. Attach callback infrastructure               (_addCallbackMethods)
//   4. Assign a unique system ID
//   5. Apply declarative members                    (_applySpecialMembers:
//      properties, auto-bound events)
//   6. Run init(name)                               (_runInit)
//
// Destruction order:
//   1. Trigger `SystemDestroyed`                    (external listeners)
//   2. Run remove()                                 (user teardown)
//   3. Unbind all callbacks                         (event cleanup)
//   4. Delete from `Crafty._systems`                (registry cleanup)
//
// This mirrors the entity lifecycle in core.js:
//   trigger("Remove") → component.remove() → _unbindAll() → delete entity
//

Crafty.CraftySystem = (function() {
    return function(name, template, options) {
        this.name = name;
        if (!template) return this;
        this._systemTemplate = template;

        // 1. Copy all methods and properties from the template
        this.extend(template);

        // 2. Merge options: template defaults overridden by caller-supplied values
        //    (null is treated as an intentional value, not "missing")
        this.options = Crafty._mergeOptions(this.options, options);

        // 3. Attach the low-level callback methods (_bindCallback, etc.)
        Crafty._addCallbackMethods(this);

        // 4. Assign a unique ID used for event handler lookup
        this[0] = "system" + systemID++;

        // 5. Apply properties and auto-bind events from the template
        Crafty._applySpecialMembers(this, template);

        // 6. Run the init hook (receives system name for convenience)
        Crafty._runInit(this, [name]);
    };
})();

Crafty.CraftySystem.prototype = {
    extend: function(obj) {
        // Copy properties and methods, but do not overwrite existing ones.
        // This protects core methods (bind, trigger, etc.) from being
        // clobbered by template members with the same name.
        for (var key in obj) {
            if (typeof this[key] === "undefined") {
                this[key] = obj[key];
            }
        }
    },

    // ─── Event methods ─────────────────────────────────────────────
    // These mirror the methods available on entities, giving systems
    // the same event-driven programming model.

    bind: function(event, callback) {
        this._bindCallback(event, callback);
        return this;
    },

    trigger: function(event, data) {
        this._runCallbacks(event, data);
        return this;
    },

    unbind: function(event, callback) {
        this._unbindCallbacks(event, callback);
        return this;
    },

    one: function(event, callback) {
        var self = this;
        var oneHandler = function(data) {
            callback.call(self, data);
            self.unbind(event, oneHandler);
        };
        return self.bind(event, oneHandler);
    },

    uniqueBind: function(event, callback) {
        this.unbind(event, callback);
        return this.bind(event, callback);
    },

    // ─── Destruction ───────────────────────────────────────────────
    // See construction/destruction order comment block above.
    destroy: function() {
        // 1. Let external observers react before we tear down
        Crafty.trigger("SystemDestroyed", this);
        // 2. Run user-supplied cleanup
        Crafty._runRemove(this);
        // 3. Detach from the event system
        this._unbindAll();
        // 4. Remove from the registry
        delete Crafty._systems[this.name];
    }
};
