var Crafty = require("../core/core.js");

/**
 * #RenderState
 * @category Graphics
 * @kind Module
 * @private
 *
 * Centralized helpers for render state management: dirty flag tracking,
 * property change invalidation, and layer state synchronization.
 *
 * These are shared across Renderable, the various layer types
 * (Canvas / DOM / WebGL), and the viewport to ensure consistent
 * naming, entry points, and behavior for state transitions that
 * trigger redraws.
 */
var RenderState = {

    // ----------------------------------------------------------------
    // Entity-level dirty flag helpers
    // ----------------------------------------------------------------

    /**
     * Mark an entity as needing a redraw.
     * Sets `_changed = true` and notifies the draw layer (if attached).
     *
     * Guarded: calling this on an already-dirty entity is a cheap no-op
     * so callers never need their own `_changed` check.
     */
    markDirty: function markDirty(entity) {
        if (entity._changed) return;
        entity._changed = true;
        if (entity._drawLayer) {
            entity._drawLayer.dirty(entity);
        }
    },

    /**
     * Clear the dirty flag after an entity has been rendered.
     */
    clearDirty: function clearDirty(entity) {
        entity._changed = false;
    },

    // ----------------------------------------------------------------
    // Property setter factory
    // ----------------------------------------------------------------

    /**
     * Build an ES5 property descriptor for a renderable property whose
     * changes should trigger an "Invalidate" event (and thus a redraw).
     *
     * @param {string} backingField  The internal property name, e.g. "_alpha"
     *
     * Usage inside a component's `properties` block:
     *
     *     alpha: RenderState.defineRenderableProp("_alpha"),
     *     _alpha: { enumerable: false }
     *
     * The setter is guarded: assigning the same value is a no-op and
     * will NOT fire Invalidate, avoiding redundant layer-dirty calls.
     */
    defineRenderableProp: function defineRenderableProp(backingField) {
        return {
            set: function (v) {
                if (this[backingField] === v) return;
                this[backingField] = v;
                this.trigger("Invalidate");
            },
            get: function () {
                return this[backingField];
            },
            configurable: true,
            enumerable: true
        };
    },

    // ----------------------------------------------------------------
    // Layer-level state helpers
    // ----------------------------------------------------------------

    /**
     * Mark a layer's viewport transform as needing recalculation.
     *
     * Called whenever the global viewport changes (scroll, scale, resize)
     * so the layer knows to recompute its camera transforms on the next
     * render pass.
     *
     * Guarded: redundant calls are cheap.
     */
    invalidateLayer: function invalidateLayer(layer) {
        if (layer._dirtyViewport) return;
        layer._dirtyViewport = true;
    },

    /**
     * Consume the layer's dirty-viewport flag.
     *
     * Returns the current value and resets it in one step.
     * Render backends call this at the start of a render pass so
     * they know whether to recompute camera transforms.
     */
    consumeViewportDirty: function consumeViewportDirty(layer) {
        var dirty = layer._dirtyViewport;
        layer._dirtyViewport = false;
        return dirty;
    },

    /**
     * Set up the common layer state that every draw layer needs.
     *
     * Initializes the cached viewport rect, wires the InvalidateViewport
     * event, fires LayerInit and PixelartSet, and registers the layer
     * instance in the global draw layer list.
     *
     * Called from the layer template's `init` method.
     */
    initLayer: function initLayer(layer) {
        layer._cachedViewportRect = {};

        layer.uniqueBind("InvalidateViewport",
            RenderState._onInvalidateViewport);

        layer.trigger("LayerInit");
        layer.trigger("PixelartSet", Crafty._pixelartEnabled);

        Crafty._addDrawLayerInstance(layer);
    },

    /**
     * Tear down common layer state.
     * Fires LayerRemove and unregisters from the global list.
     */
    removeLayer: function removeLayer(layer) {
        layer.trigger("LayerRemove");
        Crafty._removeDrawLayerInstance(layer);
    },

    /**
     * Shared event handler for InvalidateViewport.
     * Using a single named function avoids creating a new closure
     * per layer instance and makes unbinding straightforward.
     * @private
     */
    _onInvalidateViewport: function () {
        RenderState.invalidateLayer(this);
    }
};

Crafty.RenderState = RenderState;

module.exports = RenderState;
