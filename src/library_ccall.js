/**
 * @license
 * Copyright 2022 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

mergeInto(LibraryManager.library, {
  // Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
  $getCFunc: function(ident) {
    var func = Module['_' + ident]; // closure exported function
#if ASSERTIONS
    assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
#endif
    return func;
  },

  // C calling interface.
  $ccall__deps: ['$getCFunc'],
  $ccall__docs: `
  /**
   * @param {string|null=} returnType
   * @param {Array=} argTypes
   * @param {Arguments|Array=} args
   * @param {Object=} opts
   */`,
  $ccall: function(ident, returnType, argTypes, args, opts) {
    // For fast lookup of conversion functions
    var toC = {
#if MEMORY64
      'pointer': (p) => {{{ to64('p') }}},
#endif
      'string': function(str) {
        var ret = 0;
        if (str !== null && str !== undefined && str !== 0) { // null string
          // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
          var len = (str.length << 2) + 1;
          ret = stackAlloc(len);
          stringToUTF8(str, ret, len);
        }
        return {{{ to64('ret') }}};
      },
      'array': function(arr) {
        var ret = stackAlloc(arr.length);
        writeArrayToMemory(arr, ret);
        return {{{ to64('ret') }}};
      }
    };

    function convertReturnValue(ret) {
      if (returnType === 'string') {
        {{{ from64('ret') }}}
        return UTF8ToString(ret);
      }
#if MEMORY64
      if (returnType === 'pointer') return Number(ret);
#endif
      if (returnType === 'boolean') return Boolean(ret);
      return ret;
    }

    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
#if ASSERTIONS
    assert(returnType !== 'array', 'Return type should not be "array".');
#endif
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
#if ASYNCIFY
    // Data for a previous async operation that was in flight before us.
    var previousAsync = Asyncify.currData;
#endif
    var ret = func.apply(null, cArgs);
    function onDone(ret) {
#if ASYNCIFY
      runtimeKeepalivePop();
#endif
      if (stack !== 0) stackRestore(stack);
      return convertReturnValue(ret);
    }
#if ASYNCIFY
    // Keep the runtime alive through all calls. Note that this call might not be
    // async, but for simplicity we push and pop in all calls.
    runtimeKeepalivePush();
    var asyncMode = opts && opts.async;
    if (Asyncify.currData != previousAsync) {
#if ASSERTIONS
      // A change in async operation happened. If there was already an async
      // operation in flight before us, that is an error: we should not start
      // another async operation while one is active, and we should not stop one
      // either. The only valid combination is to have no change in the async
      // data (so we either had one in flight and left it alone, or we didn't have
      // one), or to have nothing in flight and to start one.
      assert(!(previousAsync && Asyncify.currData), 'We cannot start an async operation when one is already flight');
      assert(!(previousAsync && !Asyncify.currData), 'We cannot stop an async operation in flight');
#endif
      // This is a new async operation. The wasm is paused and has unwound its stack.
      // We need to return a Promise that resolves the return value
      // once the stack is rewound and execution finishes.
#if ASSERTIONS
      assert(asyncMode, 'The call to ' + ident + ' is running asynchronously. If this was intended, add the async option to the ccall/cwrap call.');
#endif
      return Asyncify.whenDone().then(onDone);
    }
#endif

    ret = onDone(ret);
#if ASYNCIFY
    // If this is an async ccall, ensure we return a promise
    if (asyncMode) return Promise.resolve(ret);
#endif
    return ret;
  },

  $cwrap__docs: `
  /**
   * @param {string=} returnType
   * @param {Array=} argTypes
   * @param {Object=} opts
   */`,
  $cwrap__deps: ['$getCFunc', '$ccall'],
  $cwrap: function(ident, returnType, argTypes, opts) {
#if !ASSERTIONS
    argTypes = argTypes || [];
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every((type) => type === 'number');
    var numericRet = returnType !== 'string';
    if (numericRet && numericArgs && !opts) {
      return getCFunc(ident);
    }
#endif
    return function() {
      return ccall(ident, returnType, argTypes, arguments, opts);
    }
  },
});
