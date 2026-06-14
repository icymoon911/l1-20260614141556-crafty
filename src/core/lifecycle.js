var Crafty = require("../core/core.js");

/**
 * Internal lifecycle helpers shared across Crafty systems and scenes.
 *
 * These utilities centralize the common patterns that appear in both
 * the system and component lifecycles:
 *
 *   - Merging user-provided options with template defaults
 *   - Applying "special" template members (properties, auto-bound events)
 *   - Running init / remove hooks
 *
 * By sharing a single implementation we avoid the drift that happens when
 * the same logic is copy-pasted across modules, and we make it obvious
 * which steps are part of the public contract versus internal plumbing.
 *
 * NOTE: These helpers are internal (underscore-prefixed).  External code
 * should continue to use `Crafty.s()`, `Crafty.scene()`, `Crafty.c()`, etc.
 */

/**
 * Merge user-provided options with template defaults.
 *
 * Keys present in `specific` always win, even when their value is `null`
 * (null is treated as an intentional value, not a "missing" one).
 * Keys that only appear in `defaults` are filled in afterwards.
 *
 * @param {Object} defaults - The template's default options.
 * @param {Object|null} specific - Caller-supplied overrides (may be null).
 * @returns {Object} A new plain object with the merged result.
 */
Crafty._mergeOptions = function(defaults, specific) {
    var options = {};
    var key;
    // Copy all specified keys first (they take priority)
    for (key in specific) {
        options[key] = specific[key];
    }
    // Then fill in defaults for any keys not already set
    for (key in defaults) {
        if (!(key in specific)) {
            options[key] = defaults[key];
        }
    }
    return options;
};

/**
 * Apply the "special" declarative members of a template to a target object.
 *
 * Currently handles:
 *   1. `properties`  - defined via Object.defineProperty
 *   2. `events`      - auto-bound to matching methods on the target
 *
 * This is the single source of truth for how these members are processed.
 * It is called by both the CraftySystem constructor (systems.js) and
 * addComponent (core.js) so that components and systems behave identically
 * with respect to declarative configuration.
 *
 * @param {Object} target - The object receiving the members (system or entity).
 * @param {Object} template - The template / component definition object.
 */
Crafty._applySpecialMembers = function(target, template) {
    if (!template) return;

    // --- properties ---
    if ("properties" in template) {
        var props = template.properties;
        for (var propertyName in props) {
            Object.defineProperty(target, propertyName, props[propertyName]);
        }
    }

    // --- events ---
    if ("events" in template) {
        var auto = template.events;
        for (var eventName in auto) {
            var fn =
                typeof auto[eventName] === "function"
                    ? auto[eventName]
                    : template[auto[eventName]];
            target.bind(eventName, fn);
        }
    }
};

/**
 * Run the `init()` hook on a target if one is defined.
 *
 * @param {Object} target - The object whose init() should be called.
 * @param {Array}  [args] - Optional arguments to forward to init().
 */
Crafty._runInit = function(target, args) {
    if (typeof target.init === "function") {
        target.init.apply(target, args || []);
    }
};

/**
 * Run the `remove()` hook on a target if one is defined.
 *
 * @param {Object} target - The object whose remove() should be called.
 */
Crafty._runRemove = function(target) {
    if (typeof target.remove === "function") {
        target.remove();
    }
};
