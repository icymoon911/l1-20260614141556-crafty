/**
 * Settings — a lightweight registry for named configuration values with
 * optional change-notification callbacks.
 *
 * Exported as a **factory** so each Crafty instance gets isolated state.
 *
 * @example
 * Crafty.settings.register("gravity", function(newValue) { ... });
 * Crafty.settings.modify("gravity", 9.8);
 * Crafty.settings.get("gravity"); // 9.8
 */

module.exports = function createSettings() {
    var states = {};
    var callbacks = {};

    return {
        /**@
         * #Crafty.settings.register
         * @comp Crafty.settings
         * @kind Method
         *
         * @sign public void Crafty.settings.register(String settingName, Function callback)
         * @param settingName - Name of the setting
         * @param callback - Function to execute when use modifies setting
         *
         * Use this to register custom settings. Callback will be executed when `Crafty.settings.modify` is used.
         *
         * @see Crafty.settings.modify
         */
        register: function(setting, callback) {
            callbacks[setting] = callback;
        },

        /**@
         * #Crafty.settings.modify
         * @comp Crafty.settings
         * @kind Method
         *
         * @sign public void Crafty.settings.modify(String settingName, * value)
         * @param settingName - Name of the setting
         * @param value - Value to set the setting to
         *
         * Modify settings through this method.
         *
         * @see Crafty.settings.register, Crafty.settings.get
         */
        modify: function(setting, value) {
            if (!callbacks[setting]) return;
            callbacks[setting].call(states[setting], value);
            states[setting] = value;
        },

        /**@
         * #Crafty.settings.get
         * @comp Crafty.settings
         * @kind Method
         *
         * @sign public * Crafty.settings.get(String settingName)
         * @param settingName - Name of the setting
         * @returns Current value of the setting
         *
         * Returns the current value of the setting.
         *
         * @see Crafty.settings.register, Crafty.settings.get
         */
        get: function(setting) {
            return states[setting];
        }
    };
};
