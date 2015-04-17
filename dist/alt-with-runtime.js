"use strict";

var Dispatcher = require("flux").Dispatcher;

var Symbol = babelHelpers.interopRequire(require("es-symbol"));
var assign = babelHelpers.interopRequire(require("object-assign"));

var _srcSharedSymbols = require("../src/shared/symbols");

var ACTION_HANDLER = _srcSharedSymbols.ACTION_HANDLER;
var ACTION_KEY = _srcSharedSymbols.ACTION_KEY;
var ACTION_UID = _srcSharedSymbols.ACTION_UID;
var ALL_LISTENERS = _srcSharedSymbols.ALL_LISTENERS;
var EE = _srcSharedSymbols.EE;
var INIT_SNAPSHOT = _srcSharedSymbols.INIT_SNAPSHOT;
var LAST_SNAPSHOT = _srcSharedSymbols.LAST_SNAPSHOT;
var LIFECYCLE = _srcSharedSymbols.LIFECYCLE;
var LISTENERS = _srcSharedSymbols.LISTENERS;
var PUBLIC_METHODS = _srcSharedSymbols.PUBLIC_METHODS;
var STATE_CHANGED = _srcSharedSymbols.STATE_CHANGED;
var STATE_CONTAINER = _srcSharedSymbols.STATE_CONTAINER;
var ActionCreator = babelHelpers.interopRequire(require("../src/action/ActionCreator"));

var _srcStoreCreateStore = require("../src/store/createStore");

var createStoreFromObject = _srcStoreCreateStore.createStoreFromObject;
var createStoreFromClass = _srcStoreCreateStore.createStoreFromClass;

var warn = require("../src/shared/warnings").warn;

var _srcSharedHelpers = require("../src/shared/helpers");

var getInternalMethods = _srcSharedHelpers.getInternalMethods;
var builtInProto = _srcSharedHelpers.builtInProto;

var GlobalActionsNameRegistry = {};

function formatAsConstant(name) {
  return name.replace(/[a-z]([A-Z])/g, function (i) {
    return "" + i[0] + "_" + i[1].toLowerCase();
  }).toUpperCase();
}

function uid(container, name) {
  var count = 0;
  var key = name;
  while (Object.hasOwnProperty.call(container, key)) {
    key = name + String(++count);
  }
  return key;
}

function setAppState(instance, data, onStore) {
  var obj = instance.deserialize(data);
  Object.keys(obj).forEach(function (key) {
    var store = instance.stores[key];
    if (store) {
      if (store[LIFECYCLE].deserialize) {
        obj[key] = store[LIFECYCLE].deserialize(obj[key]) || obj[key];
      }
      assign(store[STATE_CONTAINER], obj[key]);
      onStore(store);
    }
  });
}

function snapshot(instance) {
  for (var _len = arguments.length, storeNames = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    storeNames[_key - 1] = arguments[_key];
  }

  var stores = storeNames.length ? storeNames : Object.keys(instance.stores);
  return stores.reduce(function (obj, key) {
    var store = instance.stores[key];
    if (store[LIFECYCLE].snapshot) {
      store[LIFECYCLE].snapshot();
    }
    var customSnapshot = store[LIFECYCLE].serialize && store[LIFECYCLE].serialize();
    obj[key] = customSnapshot ? customSnapshot : store.getState();
    return obj;
  }, {});
}

function saveInitialSnapshot(instance, key) {
  var state = instance.stores[key][STATE_CONTAINER];
  var initial = instance.deserialize(instance[INIT_SNAPSHOT]);
  initial[key] = state;
  instance[INIT_SNAPSHOT] = instance.serialize(initial);
  instance[LAST_SNAPSHOT] = instance[INIT_SNAPSHOT];
}

function filterSnapshotOfStores(instance, serializedSnapshot, storeNames) {
  var stores = instance.deserialize(serializedSnapshot);
  var storesToReset = storeNames.reduce(function (obj, name) {
    if (!stores[name]) {
      throw new ReferenceError("" + name + " is not a valid store");
    }
    obj[name] = stores[name];
    return obj;
  }, {});
  return instance.serialize(storesToReset);
}

var Alt = (function () {
  function Alt() {
    var config = arguments[0] === undefined ? {} : arguments[0];
    babelHelpers.classCallCheck(this, Alt);

    this.serialize = config.serialize || JSON.stringify;
    this.deserialize = config.deserialize || JSON.parse;
    this.dispatcher = config.dispatcher || new Dispatcher();
    this.actions = {};
    this.stores = {};
    this[LAST_SNAPSHOT] = this[INIT_SNAPSHOT] = "{}";
  }

  babelHelpers.createClass(Alt, {
    dispatch: {
      value: function dispatch(action, data) {
        this.dispatcher.dispatch({ action: action, data: data });
      }
    },
    createUnsavedStore: {
      value: function createUnsavedStore(StoreModel) {
        for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }

        var key = StoreModel.displayName || "";
        return typeof StoreModel === "object" ? createStoreFromObject(this, StoreModel, key) : createStoreFromClass.apply(undefined, [this, StoreModel, key].concat(args));
      }
    },
    createStore: {
      value: function createStore(StoreModel, iden) {
        for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
          args[_key - 2] = arguments[_key];
        }

        var key = iden || StoreModel.name || StoreModel.displayName || "";

        if (this.stores[key] || !key) {
          if (this.stores[key]) {
            warn("A store named " + key + " already exists, double check your store " + "names or pass in your own custom identifier for each store");
          } else {
            warn("Store name was not specified");
          }

          key = uid(this.stores, key);
        }

        var storeInstance = typeof StoreModel === "object" ? createStoreFromObject(this, StoreModel, key) : createStoreFromClass.apply(undefined, [this, StoreModel, key].concat(args));

        this.stores[key] = storeInstance;
        saveInitialSnapshot(this, key);

        return storeInstance;
      }
    },
    generateActions: {
      value: function generateActions() {
        for (var _len = arguments.length, actionNames = Array(_len), _key = 0; _key < _len; _key++) {
          actionNames[_key] = arguments[_key];
        }

        return this.createActions(function () {
          this.generateActions.apply(this, actionNames);
        });
      }
    },
    createAction: {
      value: function createAction(name, implementation, obj) {
        var actionId = uid(GlobalActionsNameRegistry, name);
        GlobalActionsNameRegistry[actionId] = 1;
        var actionName = Symbol["for"](actionId);

        // Wrap the action so we can provide a dispatch method
        var newAction = new ActionCreator(this, actionName, implementation, obj);

        var action = newAction[ACTION_HANDLER];
        action.defer = function () {
          for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }

          setTimeout(function () {
            newAction[ACTION_HANDLER].apply(null, args);
          });
        };
        action[ACTION_KEY] = actionName;
        return action;
      }
    },
    createActions: {
      value: function createActions(ActionsClass) {
        var _this = this;

        for (var _len = arguments.length, argsForConstructor = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
          argsForConstructor[_key - 2] = arguments[_key];
        }

        var exportObj = arguments[1] === undefined ? {} : arguments[1];

        var actions = {};
        var key = ActionsClass.name || ActionsClass.displayName || "";

        if (typeof ActionsClass === "function") {
          (function () {
            assign(actions, getInternalMethods(ActionsClass.prototype, builtInProto));

            var ActionsGenerator = (function (_ActionsClass) {
              function ActionsGenerator() {
                for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                  args[_key2] = arguments[_key2];
                }

                babelHelpers.classCallCheck(this, ActionsGenerator);

                babelHelpers.get(Object.getPrototypeOf(ActionsGenerator.prototype), "constructor", this).apply(this, args);
              }

              babelHelpers.inherits(ActionsGenerator, _ActionsClass);
              babelHelpers.createClass(ActionsGenerator, {
                generateActions: {
                  value: function generateActions() {
                    for (var _len2 = arguments.length, actionNames = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                      actionNames[_key2] = arguments[_key2];
                    }

                    actionNames.forEach(function (actionName) {
                      // This is a function so we can later bind this to ActionCreator
                      actions[actionName] = function (x) {
                        for (var _len3 = arguments.length, a = Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
                          a[_key3 - 1] = arguments[_key3];
                        }

                        this.dispatch(a.length ? [x].concat(a) : x);
                      };
                    });
                  }
                }
              });
              return ActionsGenerator;
            })(ActionsClass);

            assign(actions, babelHelpers.applyConstructor(ActionsGenerator, argsForConstructor));
          })();
        } else {
          assign(actions, ActionsClass);
        }

        return Object.keys(actions).reduce(function (obj, action) {
          obj[action] = _this.createAction("" + key + "#" + action, actions[action], obj);
          var constant = formatAsConstant(action);
          obj[constant] = obj[action][ACTION_KEY];
          return obj;
        }, exportObj);
      }
    },
    takeSnapshot: {
      value: function takeSnapshot() {
        for (var _len = arguments.length, storeNames = Array(_len), _key = 0; _key < _len; _key++) {
          storeNames[_key] = arguments[_key];
        }

        var state = snapshot.apply(undefined, [this].concat(storeNames));
        this[LAST_SNAPSHOT] = this.serialize(assign(this.deserialize(this[LAST_SNAPSHOT]), state));
        return this.serialize(state);
      }
    },
    rollback: {
      value: function rollback() {
        setAppState(this, this[LAST_SNAPSHOT], function (store) {
          if (store[LIFECYCLE].rollback) {
            store[LIFECYCLE].rollback();
          }
          store.emitChange();
        });
      }
    },
    recycle: {
      value: function recycle() {
        for (var _len = arguments.length, storeNames = Array(_len), _key = 0; _key < _len; _key++) {
          storeNames[_key] = arguments[_key];
        }

        var initialSnapshot = storeNames.length ? filterSnapshotOfStores(this, this[INIT_SNAPSHOT], storeNames) : this[INIT_SNAPSHOT];

        setAppState(this, initialSnapshot, function (store) {
          if (store[LIFECYCLE].init) {
            store[LIFECYCLE].init();
          }
          store.emitChange();
        });
      }
    },
    flush: {
      value: function flush() {
        var state = this.serialize(snapshot(this));
        this.recycle();
        return state;
      }
    },
    bootstrap: {
      value: function bootstrap(data) {
        setAppState(this, data, function (store) {
          if (store[LIFECYCLE].bootstrap) {
            store[LIFECYCLE].bootstrap();
          }
          store.emitChange();
        });
      }
    },
    addActions: {

      // Instance type methods for injecting alt into your application as context

      value: function addActions(name, ActionsClass) {
        for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
          args[_key - 2] = arguments[_key];
        }

        this.actions[name] = Array.isArray(ActionsClass) ? this.generateActions.apply(this, ActionsClass) : this.createActions.apply(this, [ActionsClass].concat(args));
      }
    },
    addStore: {
      value: function addStore(name, StoreModel) {
        for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
          args[_key - 2] = arguments[_key];
        }

        this.createStore.apply(this, [StoreModel, name].concat(args));
      }
    },
    getActions: {
      value: function getActions(name) {
        return this.actions[name];
      }
    },
    getStore: {
      value: function getStore(name) {
        return this.stores[name];
      }
    }
  });
  return Alt;
})();

module.exports = Alt;

