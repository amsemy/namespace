(function() {

    /*
     *  unitName
     *      :   IDENTIFIER ( '.' IDENTIFIER )*
     *      ;
     *
     *  requireName
     *      :   unitName ('.' '*')?
     *      |   '*'
     *      ;
     *
     *  IDENTIFIER
     *      :   ('A'..'Z' | 'a'..'z' | '_' | '$') ('A'..'Z' | 'a'..'z' | '0'..'9' | '_'  | '$')*
     *      ;
     */
    var unitNamePattern = /^(?:[A-Za-z_\$][\w\$]*(?:\.[A-Za-z_\$][\w\$]*)*)$/,
        requireNamePattern = /^(?:[A-Za-z_\$][\w\$]*(?:\.[A-Za-z_\$][\w\$]*)*(?:\.\*)?|\*)$/;

    /**
     * Create a Gumup namespace. The namespace consist of units which can be
     * anything: modules, objects, constructors, primitives.
     *
     * @constructor
     */
    var Gumup = function() {

        /**
         * Initialize the unit. When it's called the context will be set to a
         * existing (or auto-created) unit. If it return a value, the value will
         * be used as the unit.
         *
         * @callback  Gumup~implementation
         * @param  {Gumup#units} units
         *         The hash of initialized units.
         * @returns  {object}
         *           The initialized unit.
         */

        /**
         * Create a unit declaration.
         *
         * @constructor
         * @param  {Gumup~implementation} implementation
         *         The function of unit initialization.
         */
        var Declaration = this.Declaration = function(implementation) {
            this._dependencies = [];
            this._implementation = implementation;
        };

        /**
         * Add a dependency on another unit.
         *
         * @param  {string} reqName
         *         A dependent unit name. It supports masks using `*` symbol.
         *         For example, the mask `foo.*` matches all the nested units
         *         of `foo` unit (except the `foo` unit). If the unit depends
         *         on all existing units, the mask `*` can be used.
         * @return  {Gumup~Declaration}
         *          Itself.
         */
        Declaration.prototype.require = function(reqName) {
            if (!checkRequireName(reqName)) {
                throw error("Invalid require name '" + reqName + "'");
            }
            this._dependencies.push(reqName);
            return this;
        };

        // Creates a unit in namespace
        Declaration.prototype._init = function(dest, name) {
            var p = name.lastIndexOf(".");
            var unitDir = (p >= 0 ? name.substring(0, p): "");
            var unitName = (p >= 0 ? name.substring(p + 1): name);
            var dir = mkdir(dest.units, unitDir);
            var obj = dir[unitName];
            if (obj == null) {
                obj = {};
            } else if (typeof obj != "object") {
                throw error("Cann't create unit '" + name
                        + "' because there is an object on this path");
            }
            dir[unitName] = this._implementation.call(obj, dest.units);
            if (dir[unitName] == null) {
                dir[unitName] = obj;
            }
        };

        this._declarations = {};

        /**
         * The hash that contains the initialized units.
         *
         * @namespace
         */
        this.units = {};

    };

    Gumup.prototype.constructor = Gumup;

    /**
     * Initialize the Gumup namespace with the declared units. Initialization
     * order of units depends on dependency resolution.
     */
    Gumup.prototype.init = function() {
        this.Declaration.prototype.require = initialized;
        this.init = initialized;
        this.unit = initialized;
        var cache = {
            // Declaration dependencies with uncapped `*` mask
            dependencies: {},
            // Units without references
            outer: {}
        };
        var d, resolved = {}, inited = {};
        for (d in this._declarations) {
            cache.dependencies[d] = [];
            cache.outer[d] = true;
        }
        for (d in this._declarations) {
            resolve(this._declarations, d, cache, resolved, {});
        }
        for (d in cache.outer) {
            initialize(this, this._declarations, d, cache, inited);
        }
    };

    /**
     * Dependency injections settings.
     *
     * @namespace  Gumup~pickDependency
     * @property  {string} unit
     *            Unit name that'll be assigned to injected object.
     * @property  {*} implementation
     *            Any object that'll be injected. If it is string, then object
     *            will be picked from the picked namespace.
     */

    /**
     * Pick settings.
     *
     * @namespace  Gumup~pickSettings
     * @property  {Gumup} [namespace]
     *            Picked namespace.
     * @property  {string[]} [units]
     *            Unit names to be picked. {@link Declaration#require}
     * @property  {Gumup~pickDependency[]} [dependecies]
     *            Dependencies to be injected.
     */

    /**
     * Copy unit declarations from the another Gumup namespace with theirs
     * dependencies.
     *
     * @param  {Gumup~pickSettings} settings
     *         Pick settings.
     * @return  {Gumup}
     *          Itself.
     */
    Gumup.prototype.pick = function(settings) {
        pickUnits(this, settings);
        pickDependencies(this, settings);
        return this;
    };

    /**
     * Add the unit declaration.
     *
     * @param  {string} name
     *         Unit name.
     * @param  {Gumup~implementation} implementation
     *         Initialization function.
     * @return  {Gumup~Declaration}
     *          Unit declaration.
     */
    Gumup.prototype.unit = function(name, implementation) {
        if (!checkUnitName(name)) {
            throw error("Invalid unit name '" + name + "'");
        }
        if (typeof implementation != "function") {
            throw error("Invalid implementation of '" + name + "' unit");
        }
        if (this._declarations[name]) {
            throw error("Unit '" + name + "' has already been declared");
        }
        return this._declarations[name] = new this.Declaration(implementation);
    };

    // Helpers
    // -------

    function checkRequireName(name) {
        return (name && requireNamePattern.test(name));
    }

    function checkUnitName(name) {
        return (name && unitNamePattern.test(name));
    }

    function error(msg) {
        var err = new Error(msg);
        err.name = "GumupError";
        return err;
    }

    // Iterate over declarations, executing a callback function for each matched
    // dependency
    function forEach(declarations, reqName, callback) {
        var d;
        if (reqName == "*") {
            // Iterate over all declarations
            for (d in declarations) {
                callback.call(this, d);
            }
        } else if (reqName.charAt(reqName.length - 1) == "*") {
            // Iterate over uncapped `*` declarations
            var baseName = reqName.substring(0, reqName.length - 1);
            for (d in declarations) {
                if (d.indexOf(baseName) == 0) {
                    callback.call(this, d);
                }
            }
        } else {
            // A single dependency iteration
            if (declarations[reqName]) {
                callback.call(this, reqName);
            } else {
                throw error("Invalid dependency '" + reqName + "'");
            }
        }
    }

    // Creates a valid path to the unit in the namespace
    function mkdir(units, name) {
        if (name != "") {
            var parts = name.split(".");
            var path = "";
            for (var i = 0, len = parts.length; i < len; i++) {
                var part = parts[i];
                path += part;
                if (units[part] == null) {
                    units[part] = {};
                } else if (typeof units[part] != "object") {
                    throw error("Cann't init unit '" + name
                            + "' because path element '" + path
                            + "' isn't an object");
                }
                units = units[part];
                path += ".";
            }
        }
        return units;
    }

    function isArray(obj) {
        return Object.prototype.toString.call(obj) == "[object Array]";
    }

    // Pick dependencies
    // -----------------

    // Iterate over `settings.dependencies`, injecting each dependency
    function pickDependencies(dest, settings) {
        var dependencies = settings.dependencies || [];
        if (!isArray(dependencies)) {
            throw error("Invalid dependencies array in pick settings");
        }
        var destDecls = dest._declarations;
        for (var i = 0, len = dependencies.length; i < len; i++) {
            var dependency = dependencies[i];
            if (typeof dependency != "object") {
                throw error("Invalid dependencies in pick settings");
            }
            var destName = dependency.name;
            if (!checkUnitName(destName)) {
                throw error("Invalid dependency name '"
                        + destName + "' in pick settings");
            }
            if (typeof dependency.implementation == "string") {
                // Copy unit declaration with new name and without its
                // dependencies
                if (!(settings.namespace instanceof Gumup)) {
                    throw error("Invalid namespace in pick settings");
                }
                if (!checkUnitName(dependency.implementation)) {
                    throw error("Invalid dependency implementation'"
                            + dependency.implementation + "'");
                }
                var srcDecls = settings.namespace._declarations;
                var srcName = dependency.implementation;
                if (srcDecls[srcName] == null) {
                    throw error("Invalid dependency '" + srcName + "'");
                }
                destDecls[destName] = srcDecls[srcName];
            } else {
                // Inject object as new object declaration
                destDecls[destName] = new dest.Declaration((function(obj) {
                    return function() {
                        return obj;
                    };
                })(dependency.implementation));
            }
        }
    }

    // Copy unit declaration and its dependencies
    function pickUnit(srcDecls, destDecls, name, picked, stack) {
        var decl = srcDecls[name];
        if (!picked[name]) {
            if (stack[name]) {
                throw error("Recursive dependency '" + name + "'");
            }
            stack[name] = true;
            for (var i = 0, len = decl._dependencies.length; i < len; i++) {
                var reqName = decl._dependencies[i];
                forEach(srcDecls, reqName, function(depName) {
                    if (depName != name) {
                        pickUnit(srcDecls, destDecls, depName, picked, stack);
                    }
                });
            }
            destDecls[name] = decl;
            picked[name] = true;
        }
    }

    // Iterate over `settings.unit`, executing a `pickUnit` function for each
    // item
    function pickUnits(dest, settings) {
        var units = settings.units || [];
        if (!isArray(units)) {
            throw error("Invalid units array in pick settings");
        }
        var len = units.length;
        // if the `units` isn't used the `namespace` parameter can be omitted
        if (len > 0) {
            if (!(settings.namespace instanceof Gumup)) {
                throw error("Invalid namespace in pick settings");
            }
            var picked = {},
                srcDecls = settings.namespace._declarations;
            for (var i = 0; i < len; i++) {
                var reqName = units[i];
                if (!checkRequireName(reqName)) {
                    throw error("Invalid unit name '" + reqName
                            + "' in pick settings");
                }
                forEach(srcDecls, reqName, function(depName) {
                    pickUnit(srcDecls, dest._declarations, depName, picked, {});
                });
            }
        }
    }

    // Initialization
    // --------------

    // Dummy to avoid namespace editing in its initialization
    function initialized() {
        throw error("Gumup namespace has already been initialized");
    }

    // Create unit in namespace
    function initialize(dest, declarations, name, cache, inited) {
        var decl = declarations[name];
        if (!inited[name]) {
            // Create unit dependencies first
            var len = cache.dependencies[name].length;
            for (var i = 0; i < len; i++) {
                initialize(dest, declarations,
                        cache.dependencies[name][i], cache, inited);
            }
            // Create unit
            decl._init(dest, name);
            inited[name] = true;
        }
    }

    // Check and prepare (uncap `*` mask) unit dependencies
    function resolve(declarations, name, cache, resolved, stack) {
        var decl = declarations[name];
        if (!resolved[name]) {
            if (stack[name]) {
                throw error("Recursive dependency '" + name + "'");
            }
            stack[name] = true;
            for (var i = 0, len = decl._dependencies.length; i < len; i++) {
                var reqName = decl._dependencies[i];
                forEach(declarations, reqName, function(depName) {
                    if (depName != name) {
                        delete cache.outer[depName];
                        cache.dependencies[name].push(depName);
                        resolve(declarations, depName, cache, resolved, stack);
                    }
                });
            }
            resolved[name] = true;
        }
    }

    this.gumup = new Gumup();

}).call(this);
