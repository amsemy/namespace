/*
 * gumup
 * https://github.com/amsemy/gumup
 *
 * Copyright (c) 2014 Amsemy
 * Licensed under the MIT license.
 */

'use strict';

exports.declError = function(msg) {
    var err = new Error(msg);
    err.name = 'GumupDeclarationError';
    return err;
};

exports.error = function(msg) {
    var err = new Error(msg);
    err.name = 'GumupError';
    return err;
};

exports.optionsError = function(msg) {
    var err = new Error(msg);
    err.name = 'GumupOptionsError';
    return err;
};
