var Dispatcher = require('flux').Dispatcher
var Symbol = require('es6-symbol')
var Promise = require('es6-promise').Promise
var EventEmitter = require('events').EventEmitter
Object.assign = Object.assign || require('object-assign')

// XXX use immutable data stores for stores

var setState = Symbol('set state')
var symActionKey = Symbol('action key name')
var symListeners = Symbol('action listeners storage')
var symState = Symbol('state container')

class Store extends EventEmitter {
  constructor(dispatcher, store) {
    this[symState] = store.getInitialState()
    this[symListeners] = {}

    this[setState] = (newState) => {
      Object.assign(this[symState], newState)
      this.emit('change')
    }

    this.dispatcherToken = dispatcher.register((payload) => {
      if (this[symListeners][payload.action]) {
        var state = this[symListeners][payload.action](payload.data)
        if (state.then) {
          state.then((data) => this[setState](data))
        } else {
          this[setState](state)
        }
      }
    })

    var toListen = store.initListeners()
    Object.keys(toListen).forEach((symbol) => {
      var cb = toListen[symbol]

      if (symbol[symActionKey]) {
        this[symListeners][symbol[symActionKey]] = cb
      } else {
        this[symListeners][symbol] = cb
      }
    })
  }

  emitChange() {
    this.emit('change')
  }

  listen(cb) {
    this.on('change', cb)
  }

  unlisten(cb) {
    this.removeListener('change', cb)
  }

  getCurrentState() {
    return this[symState]
  }

  getDispatcherToken() {
    return this.dispatcherToken
  }
}

var symDispatch = Symbol('dispatch action')
var symHandler = Symbol('action creator handler')

class ActionCreator {
  constructor(dispatcher, name, action) {
    this.name = name
    this.action = action

    this[symHandler] = (...args) => {
      var value = this.action.apply(this, args)
      // XXX this is a shitty way to know if its a promise
      if (value.then) {
        value.then((data) => this[symDispatch](data))
      } else {
        this[symDispatch](value)
      }
    }

    this[symDispatch] = (data) => {
      dispatcher.dispatch({
        action: this.name,
        data: data
      })
    }
  }
}

var formatAsConstant = (name) => {
  return name.replace(/[a-z]([A-Z])/g, (i) => {
    return i[0] + '_' + i[1].toLowerCase()
  }).toUpperCase()
}

var symDispatcher = Symbol('the dispatcher')

class Fux {
  constructor() {
    this[symDispatcher] = new Dispatcher()
  }

  createStore(store) {
    return new Store(this[symDispatcher], store)
  }

  createActions(actions) {
    return Object.keys(actions).reduce((obj, action) => {
      var constant = formatAsConstant(action)
      var actionName = Symbol('action ' + constant)

      var newAction = new ActionCreator(
        this[symDispatcher],
        actionName,
        actions[action]
      )

      obj[action] = newAction[symHandler]
      obj[action][symActionKey] = actionName
      obj[constant] = actionName

      return obj
    }, {})
  }
}

Fux.Promise = Promise

module.exports = Fux
