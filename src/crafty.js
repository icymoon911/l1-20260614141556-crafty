var Crafty = require('./crafty-common.js')();

function loadModules(modules) {
    modules.forEach(function(modulePath) {
        require(modulePath);
    });
}

Crafty.extend(require('./core/loader'));
Crafty.extend(require('./inputs/dom-events'));

loadModules([
    './graphics/layers',
    './graphics/canvas',
    './graphics/canvas-layer',
    './graphics/webgl',
    './graphics/webgl-layer'
]);

loadModules([
    './graphics/color',
    './graphics/dom',
    './graphics/dom-helper',
    './graphics/dom-layer',
    './graphics/drawing',
    './graphics/gl-textures',
    './graphics/renderable',
    './graphics/html',
    './graphics/image',
    './graphics/particles',
    './graphics/sprite-animation',
    './graphics/sprite',
    './graphics/text',
    './graphics/viewport'
]);

loadModules([
    './isometric/diamond-iso',
    './isometric/isometric'
]);

loadModules([
    './inputs/util',
    './inputs/device',
    './inputs/keyboard',
    './inputs/lifecycle',
    './inputs/mouse',
    './inputs/pointer',
    './inputs/touch'
]);

loadModules([
    './sound/sound',
    './debug/debug-layer'
]);

require('./aliases').defineAliases(Crafty);

if (window) window.Crafty = Crafty;

module.exports = Crafty;
