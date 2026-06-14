module.exports = function(requireNew) {
    if (requireNew) {
        require = requireNew; // jshint ignore:line
    }

    function loadModules(modules) {
        modules.forEach(function(modulePath) {
            require(modulePath);
        });
    }

    function loadCoreModules(Crafty) {
        require('./core/extensions');

        Crafty.easing = require('./core/animation');
        Crafty.c('Model', require('./core/model'));
        Crafty.extend(require('./core/scenes'));
        Crafty.storage = require('./core/storage');
        Crafty.c('Delay', require('./core/time'));
        Crafty.c('Tween', require('./core/tween'));

        loadModules(['./core/systems']);
    }

    function loadSpatialModules(Crafty) {
        var HashMap = require('./spatial/spatial-grid');
        Crafty.HashMap = HashMap;
        Crafty.map = new HashMap();

        loadModules([
            './spatial/2d',
            './spatial/motion',
            './spatial/platform',
            './spatial/collision',
            './spatial/rect-manager',
            './spatial/math'
        ]);
    }

    function loadControlModules() {
        loadModules([
            './controls/controls-system',
            './controls/controls',
            './controls/keyboard',
            './controls/keycodes',
            './controls/mouse',
            './controls/touch'
        ]);
    }

    var Crafty = require('./core/core');

    loadCoreModules(Crafty);
    loadSpatialModules(Crafty);
    loadControlModules();
    loadModules(['./debug/logging']);

    return Crafty;
};
