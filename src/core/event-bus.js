/**
 * Event Bus — manages the global event handler table and provides
 * low-level callback methods that are mixed into every event-aware object
 * (Crafty itself, entities, systems).
 *
 * ## How the event system works
 *
 * `handlers` is a map from event names to per-object callback arrays:
 *
 *     handlers[eventName][objectId] === Array<callbackFn>
 *
 * Each participating object also carries a `_callbacks` property that
 * mirrors the same information from the object's own perspective:
 *
 *     obj._callbacks[eventName] === Array<callbackFn>
 *
 * The two structures are kept in sync by the methods below.
 *
 * Exported as a **factory** so that every Crafty instance gets its own,
 * fully-isolated event bus (important for headless / multi-instance use).
 */

module.exports = function createEventBus() {
    // ── private state ────────────────────────────────────────────────
    var handlers = {};

    // ── callback methods (mixed into every event-aware object) ───────
    var callbackMethods = {
        /**
         * Add `fn` to the callback list for `event` on this object.
         */
        _bindCallback: function(event, fn) {
            var callbacks = this._callbacks[event];
            if (!callbacks) {
                callbacks = this._callbacks[event] =
                    (handlers[event] || (handlers[event] = {}))[this[0]] = [];
                callbacks.context = this;
                callbacks.depth = 0;
            }
            callbacks.push(fn);
        },

        /**
         * Execute every callback registered for `event` on this object.
         *
         * Safe to call while callbacks are running — deletions are deferred
         * until the outermost iteration completes (tracked via `depth`).
         */
        _runCallbacks: function(event, data) {
            if (!this._callbacks[event] || this.__callbacksFrozen) {
                return;
            }
            var callbacks = this._callbacks[event];
            var i,
                l = callbacks.length;
            callbacks.depth++;
            for (i = 0; i < l; i++) {
                if (typeof callbacks[i] === "undefined") {
                    if (callbacks.depth <= 1) {
                        callbacks.splice(i, 1);
                        i--;
                        l--;
                        if (callbacks.length === 0) {
                            delete this._callbacks[event];
                            delete handlers[event][this[0]];
                        }
                    }
                } else {
                    callbacks[i].call(this, data);
                }
            }
            callbacks.depth--;
        },

        /**
         * Mark callbacks for `event` as deleted.
         * Actual splicing is deferred to `_runCallbacks` to avoid
         * corruption when unbind is called from inside a running callback.
         */
        _unbindCallbacks: function(event, fn) {
            if (!this._callbacks[event]) {
                return;
            }
            var callbacks = this._callbacks[event];
            for (var i = 0; i < callbacks.length; i++) {
                if (!fn || callbacks[i] === fn) {
                    delete callbacks[i];
                }
            }
        },

        /**
         * Remove ALL callbacks for every event on this object.
         * Typically called on entity destruction.
         */
        _unbindAll: function() {
            if (!this._callbacks) return;
            this.__callbacksFrozen = false;
            for (var event in this._callbacks) {
                if (this._callbacks[event]) {
                    this._unbindCallbacks(event);
                    delete handlers[event][this[0]];
                }
            }
        },

        /**
         * Detach this object's callbacks from the global `handlers` table
         * so they will no longer fire on global `Crafty.trigger()`.
         * The local `_callbacks` arrays are kept so they can be restored.
         */
        _freezeCallbacks: function() {
            if (!this._callbacks) return;
            for (var event in this._callbacks) {
                if (this._callbacks[event]) {
                    delete handlers[event][this[0]];
                }
            }
            this.__callbacksFrozen = true;
        },

        /**
         * Re-attach previously frozen callbacks to the global `handlers` table.
         */
        _unfreezeCallbacks: function() {
            if (!this._callbacks) return;
            this.__callbacksFrozen = false;
            for (var event in this._callbacks) {
                if (this._callbacks[event]) {
                    handlers[event][this[0]] = this._callbacks[event];
                }
            }
        }
    };

    // ── public helpers ───────────────────────────────────────────────

    /**
     * Mix callback methods into `context` and initialise its `_callbacks` map.
     * This replaces the old pattern of calling `context.extend(...)` so that
     * the event bus has zero dependency on the entity/extend system.
     */
    function addCallbackMethods(context) {
        for (var key in callbackMethods) {
            context[key] = callbackMethods[key];
        }
        context._callbacks = {};
    }

    /**
     * Clear the entire `handlers` table.
     * Called when Crafty is stopped with `clearState = true`.
     */
    function resetHandlers() {
        for (var key in handlers) {
            delete handlers[key];
        }
    }

    /**
     * Trigger an event globally — fires on every object that has registered
     * callbacks for `event`, including Crafty itself.
     */
    function triggerGlobal(event, data) {
        var hdl = handlers[event] || (handlers[event] = {}),
            h,
            callbacks;
        for (h in hdl) {
            if (!hdl.hasOwnProperty(h)) continue;
            callbacks = hdl[h];
            if (!callbacks || callbacks.length === 0) continue;
            callbacks.context._runCallbacks(event, data);
        }
    }

    // ── exports ──────────────────────────────────────────────────────
    return {
        handlers: handlers,
        callbackMethods: callbackMethods,
        addCallbackMethods: addCallbackMethods,
        resetHandlers: resetHandlers,
        triggerGlobal: triggerGlobal
    };
};
