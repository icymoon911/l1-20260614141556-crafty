var Crafty = require("../core/core.js");

// ═══════════════════════════════════════════════════════════════════
// Scene lifecycle helpers (module-private)
// ═══════════════════════════════════════════════════════════════════
// These deliberately live outside the exported object so they are not
// copied onto Crafty by Crafty.extend(): only the documented scene API
// below is public, while the step-by-step lifecycle stays an internal
// detail.

/**
 * Tear down the scene that is currently running, in preparation for
 * entering `nextScene`.
 *
 * This is the whole "leave" phase, in order:
 *   1. Trigger `SceneDestroy`           – announce the upcoming teardown
 *   2. Reset the viewport               – clear camera transforms
 *   3. Destroy non-Persist 2D entities  – clear the stage
 *   4. Run outgoing scene's uninitialize hook (if one was defined)
 *
 * `Crafty._current` is intentionally left unchanged here so the
 * uninitialize hook still runs in the context of its own scene.
 */
function teardownCurrentScene(nextScene) {
    // 1. Announce that the current scene is about to be destroyed
    Crafty.trigger("SceneDestroy", { newScene: nextScene });

    // 2. Reset the viewport (scroll, scale, etc.)
    Crafty.viewport.reset();

    // 3. Destroy every 2D entity that doesn't have the Persist component
    Crafty("2D").each(function() {
        if (!this.has("Persist")) this.destroy();
    });

    // 4. Run the outgoing scene's uninitialize hook
    var current = Crafty._current;
    if (
        current !== null &&
        Crafty._scenes.hasOwnProperty(current) &&
        "uninitialize" in Crafty._scenes[current]
    ) {
        Crafty._scenes[current].uninitialize.call(Crafty);
    }
}

/**
 * Bring up `name` as the new current scene.
 *
 * By the time this runs `Crafty._current` has already been advanced to
 * `name`; we announce the change (reporting the scene we came from) and
 * then run the incoming scene's initialize hook – or report an error if
 * no such scene was ever defined.
 */
function startScene(name, data, oldScene) {
    Crafty.trigger("SceneChange", {
        oldScene: oldScene,
        newScene: name
    });

    if (Crafty._scenes.hasOwnProperty(name)) {
        Crafty._scenes[name].initialize.call(Crafty, data);
    } else {
        Crafty.error('The scene "' + name + '" does not exist');
    }
}

// ═══════════════════════════════════════════════════════════════════
// Public scene API
// ═══════════════════════════════════════════════════════════════════
// These are the methods that get mixed onto Crafty via Crafty.extend().
//
// Scene transition order (important for event timing):
//
//   enterScene(name, data)
//     │
//     ├── 1. trigger SceneDestroy({ newScene })      ← "about to tear down"
//     ├── 2. viewport.reset()
//     ├── 3. destroy non-Persist 2D entities
//     ├── 4. oldScene.uninitialize()                  ← user teardown hook
//     ├── 5. _current = name                          ← advance reference
//     ├── 6. trigger SceneChange({ oldScene, newScene }) ← "about to init"
//     └── 7. newScene.initialize(data)                ← user init hook
//
// `SceneDestroy` always fires before any teardown work begins.
// `SceneChange` always fires after teardown completes but before the
// new scene's init runs.  Each fires exactly once per transition.
//

module.exports = {
    _scenes: {},
    _current: null,

    /**@
     * #Crafty.scene
     * @category Scenes, Stage
     * @kind Method
     *
     * @trigger SceneChange - just before a new scene is initialized - { oldScene:String, newScene:String }
     * @trigger SceneDestroy - just before the current scene is destroyed - { newScene:String  }
     *
     * @sign public void Crafty.scene(String sceneName, Function init[, Function uninit])
     * @param sceneName - Name of the scene to add
     * @param init - Function to execute when scene is played
     * @param uninit - Function to execute before next scene is played, after entities with `2D` are destroyed
     *
     * This is equivalent to calling `Crafty.defineScene`.
     *
     * @sign public void Crafty.scene(String sceneName[, Data])
     * @param sceneName - Name of scene to play
     * @param Data - The init function of the scene will be called with this data as its parameter.  Can be of any type other than a function.
     *
     * This is equivalent to calling `Crafty.enterScene`.
     *
     * Method to create scenes on the stage. Pass an ID and function to register a scene.
     *
     * To play a scene, just pass the ID. When a scene is played, all
     * previously-created entities with the `2D` component are destroyed. The
     * viewport is also reset.
     *
     * You can optionally specify an arugment that will be passed to the scene's init function.
     *
     * If you want some entities to persist over scenes (as in, not be destroyed)
     * simply add the component `Persist`.
     *
     * @example
     * ~~~
     * Crafty.defineScene("loading", function() {
     *     Crafty.background("#000");
     *     Crafty.e("2D, DOM, Text")
     *           .attr({ w: 100, h: 20, x: 150, y: 120 })
     *           .text("Loading")
     *           .textAlign("center")
     *           .textColor("#FFFFFF");
     * });
     *
     * Crafty.defineScene("UFO_dance",
     *              function() {Crafty.background("#444"); Crafty.e("UFO");},
     *              function() {...send message to server...});
     *
     * // An example of an init function which accepts arguments, in this case an object.
     * Crafty.defineScene("square", function(attributes) {
     *     Crafty.background("#000");
     *     Crafty.e("2D, DOM, Color")
     *           .attr(attributes)
     *           .color("red");
     *
     * });
     *
     * ~~~
     * This defines (but does not play) two scenes as discussed below.
     * ~~~
     * Crafty.enterScene("loading");
     * ~~~
     * This command will clear the stage by destroying all `2D` entities (except
     * those with the `Persist` component). Then it will set the background to
     * black and display the text "Loading".
     * ~~~
     * Crafty.enterScene("UFO_dance");
     * ~~~
     * This command will clear the stage by destroying all `2D` entities (except
     * those with the `Persist` component). Then it will set the background to
     * gray and create a UFO entity. Finally, the next time the game encounters
     * another command of the form `Crafty.scene(scene_name)` (if ever), then the
     * game will send a message to the server.
     * ~~~
     * Crafty.enterScene("square", {x:10, y:10, w:20, h:20});
     * ~~~
     * This will clear the stage, set the background black, and create a red square with the specified position and dimensions.
     * ~~~
     */
    scene: function(name, intro, outro) {
        // If there's one argument, or the second argument isn't a function,
        // this is a "play scene" call.
        if (arguments.length === 1 || typeof arguments[1] !== "function") {
            Crafty.enterScene(name, arguments[1]);
            return;
        }
        // Otherwise, this is a "define scene" call.
        Crafty.defineScene(name, intro, outro);
    },

    /**
     * #Crafty.defineScene
     * @category Scenes, Stage
     * @kind Method
     *
     * @sign public void Crafty.defineScene(String name, Function init[, Function uninit])
     * @param name - Name of the scene to define.
     * @param init - Function to execute when scene is played.
     * @param uninit - Function to execute before the next scene is played.
     *
     * @see Crafty.enterScene
     * @see Crafty.scene
     */
    defineScene: function(name, init, uninit) {
        if (typeof init !== "function")
            throw "Init function is the wrong type.";
        Crafty._scenes[name] = {
            initialize: init
        };
        if (typeof uninit !== "undefined") {
            Crafty._scenes[name].uninitialize = uninit;
        }
    },

    /**
     * #Crafty.enterScene
     * @category Scenes, Stage
     * @kind Method
     *
     * @trigger SceneChange - just before a new scene is initialized - { oldScene:String, newScene:String }
     * @trigger SceneDestroy - just before the current scene is destroyed - { newScene:String  }
     *
     * @sign public void Crafty.enterScene(String name[, Data])
     * @param name - Name of the scene to run.
     * @param Data - The init function of the scene will be called with this data as its parameter.  Can be of any type other than a function.
     *
     * @see Crafty.defineScene
     * @see Crafty.scene
     */
    enterScene: function(name, data) {
        if (typeof data === "function") throw "Scene data cannot be a function";

        // A scene change is always tear-down-then-bring-up: the outgoing
        // scene is fully torn down before _current advances, and the incoming
        // scene is only initialized afterwards.  Keeping the two phases as
        // distinct, ordered steps ensures they can never interleave (no init
        // before teardown completes) and that each lifecycle event fires
        // exactly once.

        // Phase 1: tear down the current scene
        teardownCurrentScene(name);

        // Advance the current-scene pointer
        var oldScene = Crafty._current;
        Crafty._current = name;

        // Phase 2: start the new scene
        startScene(name, data, oldScene);
    },

    /**
     * #Crafty.currentScene
     * @category Scenes, Stage
     * @kind Method
     *
     * @sign public String Crafty.currentScene()
     * @returns The name of the currently active scene, or null if no scene has been entered.
     */
    currentScene: function() {
        return this._current;
    },

    /**
     * #Crafty.isScene
     * @category Scenes, Stage
     * @kind Method
     *
     * @sign public Boolean Crafty.isScene(String name)
     * @param name - The scene name to check.
     * @returns True if a scene with the given name has been defined.
     */
    isScene: function(name) {
        return this._scenes.hasOwnProperty(name);
    }
};
