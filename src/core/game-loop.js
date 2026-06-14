/**
 * Game Loop — drives the main tick/update/render cycle.
 *
 * Manages `requestAnimationFrame` / `setInterval`, supports fixed, variable,
 * and semi-fixed timestep modes, and triggers the following events each step:
 *
 *   Per-frame:  EnterFrame → UpdateFrame → ExitFrame
 *   Per-step:   PreRender  → RenderScene  → PostRender
 *
 * Exported as a **factory** so each Crafty instance gets its own loop.
 *
 * @param {Object} Crafty      – the Crafty instance (for trigger / timer access)
 * @param {Object} frameState  – shared mutable counter: `{ value: <Number> }`
 */

module.exports = function createGameLoop(Crafty, frameState) {
    /* requestAnimationFrame handle */
    var tick, requestID;

    /* Timestep-mode internals */
    var mode = "fixed",
        maxFramesPerStep = 5,
        maxTimestep = 40;

    /* Tracking variables */
    var endTime = 0,
        timeSlip = 0,
        gameTime;

    /* Target frame rate */
    var FPS = 50,
        milliSecPerFrame = 1000 / FPS;

    return {
        /**
         * Start the game loop.
         * Uses `requestAnimationFrame` when available, falls back to `setInterval`.
         */
        init: function() {
            // On first call, seed the game clock one frame in the past
            if (typeof gameTime === "undefined")
                gameTime = Date.now() - milliSecPerFrame;

            var onFrame =
                typeof window !== "undefined" &&
                (window.requestAnimationFrame ||
                    window.webkitRequestAnimationFrame ||
                    window.mozRequestAnimationFrame ||
                    window.oRequestAnimationFrame ||
                    window.msRequestAnimationFrame ||
                    null);

            if (onFrame) {
                tick = function() {
                    Crafty.timer.step();
                    if (tick !== null) {
                        requestID = onFrame(tick);
                    }
                };
                tick();
            } else {
                tick = setInterval(function() {
                    Crafty.timer.step();
                }, 1000 / FPS);
            }
        },

        /**
         * Stop the game loop and release the animation frame.
         */
        stop: function() {
            Crafty.trigger("CraftyStopTimer");

            if (typeof tick !== "function") clearInterval(tick);

            var onFrame =
                typeof window !== "undefined" &&
                (window.cancelAnimationFrame ||
                    window.cancelRequestAnimationFrame ||
                    window.webkitCancelRequestAnimationFrame ||
                    window.mozCancelRequestAnimationFrame ||
                    window.oCancelRequestAnimationFrame ||
                    window.msCancelRequestAnimationFrame ||
                    null);

            if (onFrame) onFrame(requestID);
            tick = null;
        },

        /**@
         * #Crafty.timer.steptype
         * @comp Crafty.timer
         * @kind Method
         *
         * @trigger NewSteptype - when the current steptype changes - { mode, maxTimeStep } - New steptype
         *
         * Can be called to set the type of timestep the game loop uses.
         * @sign public void Crafty.timer.steptype(mode [, maxTimeStep])
         * @param mode - the type of time loop.  Allowed values are "fixed", "semifixed", and "variable".  Crafty defaults to "fixed".
         * @param maxTimeStep - For "fixed", sets the max number of frames per step.   For "variable" and "semifixed", sets the maximum time step allowed.
         *
         * Can be called to get the type of timestep the game loop uses.
         * @sign public Object Crafty.timer.steptype(void)
         * @returns Object containing the current timestep's properties { mode, maxTimeStep }
         *
         * * In "fixed" mode, each frame is sent the same value of `dt`, and to achieve the target game speed, mulitiple frame events are triggered before each render.
         * * In "variable" mode, there is only one frame triggered per render.  This recieves a value of `dt` equal to the actual elapsed time since the last frame.
         * * In "semifixed" mode, multiple frames per render are processed, and the total time since the last frame is divided evenly between them.
         *
         * @see Crafty.timer.FPS
         */
        steptype: function(newmode, option) {
            if (newmode === "variable" || newmode === "semifixed") {
                mode = newmode;
                if (option) maxTimestep = option;
                Crafty.trigger("NewSteptype", {
                    mode: mode,
                    maxTimeStep: maxTimestep
                });
            } else if (newmode === "fixed") {
                mode = "fixed";
                if (option) maxFramesPerStep = option;
                Crafty.trigger("NewSteptype", {
                    mode: mode,
                    maxTimeStep: maxFramesPerStep
                });
            } else if (newmode !== undefined) {
                throw "Invalid step type specified";
            } else {
                return {
                    mode: mode,
                    maxTimeStep:
                        mode === "variable" || mode === "semifixed"
                            ? maxTimestep
                            : maxFramesPerStep
                };
            }
        },

        /**@
         * #Crafty.timer.step
         * @comp Crafty.timer
         * @kind Method
         *
         * @sign public void Crafty.timer.step()
         * @trigger EnterFrame - Triggered before each frame.  Passes the frame number, and the amount of time since the last frame.  If the time is greater than maxTimestep, that will be used instead.  (The default value of maxTimestep is 50 ms.) - { frame: Number, dt:Number }
         * @trigger UpdateFrame - Triggered on each frame.  Passes the frame number, and the amount of time since the last frame.  If the time is greater than maxTimestep, that will be used instead.  (The default value of maxTimestep is 50 ms.) - { frame: Number, dt:Number }
         * @trigger ExitFrame - Triggered after each frame.  Passes the frame number, and the amount of time since the last frame.  If the time is greater than maxTimestep, that will be used instead.  (The default value of maxTimestep is 50 ms.) - { frame: Number, dt:Number }
         * @trigger PreRender - Triggered every time immediately before a scene should be rendered
         * @trigger RenderScene - Triggered every time a scene should be rendered
         * @trigger PostRender - Triggered every time immediately after a scene should be rendered
         * @trigger MeasureWaitTime - Triggered at the beginning of each step after the first.  Passes the time the game loop waited between steps. - Number
         * @trigger MeasureFrameTime - Triggered after each frame.  Passes the time it took to advance one frame. - Number
         * @trigger MeasureRenderTime - Triggered after each render. Passes the time it took to render the scene - Number
         *
         * Advances the game by performing a step. A step consists of one/multiple frames followed by a render. The amount of frames depends on the timer's steptype.
         * Specifically it triggers `EnterFrame`, `UpdateFrame` & `ExitFrame` events for each frame and `PreRender`, `RenderScene` & `PostRender` events for each render.
         *
         * @see Crafty.timer.steptype
         * @see Crafty.timer.FPS
         */
        step: function() {
            var drawTimeStart,
                dt,
                lastFrameTime,
                loops = 0;

            var currentTime = Date.now();
            if (endTime > 0)
                Crafty.trigger("MeasureWaitTime", currentTime - endTime);

            // If we're ahead of real time, skip this tick
            if (gameTime + timeSlip >= currentTime) {
                endTime = currentTime;
                return;
            }

            var netTimeStep = currentTime - (gameTime + timeSlip);
            // Cap catch-up effort: if we're hopelessly behind, accept the loss
            if (netTimeStep > milliSecPerFrame * 20) {
                timeSlip += netTimeStep - milliSecPerFrame;
                netTimeStep = milliSecPerFrame;
            }

            // Determine number of frames and dt based on mode
            if (mode === "fixed") {
                loops = Math.ceil(netTimeStep / milliSecPerFrame);
                loops = Math.min(loops, maxFramesPerStep);
                dt = milliSecPerFrame;
            } else if (mode === "variable") {
                loops = 1;
                dt = netTimeStep;
                dt = Math.min(dt, maxTimestep);
            } else if (mode === "semifixed") {
                loops = Math.ceil(netTimeStep / maxTimestep);
                dt = netTimeStep / loops;
            }

            // Process frames
            for (var i = 0; i < loops; i++) {
                lastFrameTime = currentTime;

                var frameData = {
                    frame: frameState.value++,
                    dt: dt,
                    gameTime: gameTime
                };

                Crafty.trigger("EnterFrame", frameData);
                Crafty.trigger("UpdateFrame", frameData);
                Crafty.trigger("ExitFrame", frameData);
                gameTime += dt;

                currentTime = Date.now();
                Crafty.trigger(
                    "MeasureFrameTime",
                    currentTime - lastFrameTime
                );
            }

            // Render if any frames were processed
            if (loops > 0) {
                drawTimeStart = currentTime;
                Crafty.trigger("PreRender");
                Crafty.trigger("RenderScene");
                Crafty.trigger("PostRender");
                currentTime = Date.now();
                Crafty.trigger(
                    "MeasureRenderTime",
                    currentTime - drawTimeStart
                );
            }

            endTime = currentTime;
        },

        /**@
         * #Crafty.timer.FPS
         * @comp Crafty.timer
         * @kind Method
         *
         * @sign public void Crafty.timer.FPS()
         * Returns the target frames per second. This is not an actual frame rate.
         * @sign public void Crafty.timer.FPS(Number value)
         * @param value - the target rate
         * @trigger FPSChange - Triggered when the target FPS is changed by user - Number - new target FPS
         *
         * Sets the target frames per second. This is not an actual frame rate.
         * The default rate is 50.
         *
         * @see Crafty.timer.steptype
         */
        FPS: function(value) {
            if (typeof value === "undefined") return FPS;
            else {
                FPS = value;
                milliSecPerFrame = 1000 / FPS;
                Crafty.trigger("FPSChange", value);
            }
        },

        /**@
         * #Crafty.timer.simulateFrames
         * @comp Crafty.timer
         * @kind Method
         *
         * @sign public this Crafty.timer.simulateFrames(Number frames[, Number timestep])
         * Advances the game state by a number of frames and draws the resulting stage at the end. Useful for tests and debugging.
         * @param frames - number of frames to simulate
         * @param timestep - the duration to pass each frame.  Defaults to milliSecPerFrame (20 ms) if not specified.
         */
        simulateFrames: function(frames, timestep) {
            timestep = timestep || milliSecPerFrame;
            while (frames-- > 0) {
                var frameData = {
                    frame: frameState.value++,
                    dt: timestep
                };
                Crafty.trigger("EnterFrame", frameData);
                Crafty.trigger("UpdateFrame", frameData);
                Crafty.trigger("ExitFrame", frameData);
            }
            Crafty.trigger("PreRender");
            Crafty.trigger("RenderScene");
            Crafty.trigger("PostRender");
        }
    };
};
