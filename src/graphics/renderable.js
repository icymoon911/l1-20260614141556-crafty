var Crafty = require("../core/core.js");

/**@
 * #Renderable
 * @category Graphics
 * @kind Component
 *
 * Component for any entity that has a position on the stage.
 * @trigger Invalidate - when the entity needs to be redrawn
 */
Crafty.c("Renderable", {
    // Flag for tracking whether the entity is dirty or not.
    // Managed internally by _invalidateRenderable; external code should not modify this directly.
    _changed: false,

    /**@
     * #.alpha
     * @comp Renderable
     * @kind Property
     *
     * Transparency of an entity. Must be a decimal value between 0.0 being fully transparent to 1.0 being fully opaque.
     */
    _alpha: 1.0,

    /**@
     * #.visible
     * @comp Renderable
     * @kind Property
     *
     * If the entity is visible or not. Accepts a true or false value.
     * Can be used for optimization by setting an entities visibility to false when not needed to be drawn.
     *
     * The entity will still exist and can be collided with but just won't be drawn.
     */
    _visible: true,

    // Flip state along each axis. Declared explicitly so the equality
    // guard in _setProperty sees "not flipped" as false rather than
    // undefined; otherwise unflip() on a never-flipped entity would
    // assign false !== undefined and fire a redundant Invalidate.
    _flipX: false,
    _flipY: false,

    /**@
     * #._setProperty
     * @comp Renderable
     * @kind Method
     * @private
     *
     * @sign public void ._setProperty(String name, value)
     * @param name - The backing field name (e.g. "_alpha", "_visible", "_flipX")
     * @param value - The new value
     *
     * Standard setter for renderable properties.
     * Compares the current value with the new value, and if different,
     * assigns the new value and triggers "Invalidate".
     *
     * All Renderable properties that need to trigger a redraw on change
     * should use this method to ensure consistent invalidation behavior.
     */
    _setProperty: function(name, value) {
        if (this[name] === value) {
            return;
        }
        this[name] = value;
        this.trigger("Invalidate");
    },

    // Setup all the properties that we need to define
    properties: {
        alpha: {
            set: function(v) {
                this._setProperty("_alpha", v);
            },
            get: function() {
                return this._alpha;
            },
            configurable: true,
            enumerable: true
        },
        _alpha: { enumerable: false },

        visible: {
            set: function(v) {
                this._setProperty("_visible", v);
            },
            get: function() {
                return this._visible;
            },
            configurable: true,
            enumerable: true
        },
        _visible: { enumerable: false }
    },

    init: function() {},

    // Need to store visibility before being frozen
    _hideOnUnfreeze: false,
    events: {
        Freeze: function() {
            this._hideOnUnfreeze = !this._visible;
            this._setProperty("_visible", false);
        },
        Unfreeze: function() {
            this._setProperty("_visible", !this._hideOnUnfreeze);
        }
    },

    // Renderable assumes that a draw layer has 3 important methods: attach, detach, and dirty

    // Dirty the entity when it's invalidated
    _invalidateRenderable: function() {
        //flag if changed
        if (this._changed === false) {
            this._changed = true;
            this._drawLayer.dirty(this);
        }
    },

    // Attach the entity to a layer to be rendered
    _attachToLayer: function(layer) {
        if (this._drawLayer) {
            this._detachFromLayer();
        }
        this._drawLayer = layer;
        layer.attach(this);
        this.bind("Invalidate", this._invalidateRenderable);
        this.trigger("LayerAttached", layer);
        this.trigger("Invalidate");
    },

    // Detach the entity from a layer
    _detachFromLayer: function() {
        if (!this._drawLayer) {
            return;
        }
        this._drawLayer.detach(this);
        this.unbind("Invalidate", this._invalidateRenderable);
        this.trigger("LayerDetached", this._drawLayer);
        delete this._drawLayer;
    },

    /**@
     * #.flip
     * @comp Renderable
     * @kind Method
     *
     * @trigger Invalidate - when the entity has flipped
     * @sign public this .flip(String dir)
     * @param dir - Flip direction
     *
     * Flip entity on passed direction
     *
     * @example
     * ~~~
     * this.flip("X")
     * ~~~
     */
    flip: function(dir) {
        dir = dir || "X";
        this._setProperty("_flip" + dir, true);
        return this;
    },

    /**@
     * #.unflip
     * @comp Renderable
     * @kind Method
     *
     * @trigger Invalidate - when the entity has unflipped
     * @sign public this .unflip(String dir)
     * @param dir - Unflip direction
     *
     * Unflip entity on passed direction (if it's flipped)
     *
     * @example
     * ~~~
     * this.unflip("X")
     * ~~~
     */
    unflip: function(dir) {
        dir = dir || "X";
        this._setProperty("_flip" + dir, false);
        return this;
    }
});
