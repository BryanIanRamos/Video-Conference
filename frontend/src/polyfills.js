// Node.js polyfills for browser environment

// Global polyfill
if (typeof global === "undefined") {
  window.global = window;
}

// Process polyfill
if (typeof process === "undefined") {
  window.process = { env: { NODE_ENV: "development" } };
}

// Util polyfill
if (typeof util === "undefined") {
  window.util = {
    debuglog: () => () => {},
    deprecate: (fn) => fn,
    format: (...args) => args.join(" "),
    inherits: function (ctor, superCtor) {
      ctor.super_ = superCtor;
      Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
    },
  };
}

// Events polyfill
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  emit(event, ...args) {
    if (!this.events[event]) {
      return false;
    }
    this.events[event].forEach((listener) => listener(...args));
    return true;
  }

  removeListener(event, listener) {
    if (!this.events[event]) {
      return this;
    }
    this.events[event] = this.events[event].filter((l) => l !== listener);
    return this;
  }
}

// Setup events module
if (typeof events === "undefined") {
  window.events = { EventEmitter };
}

// Expose EventEmitter on window for modules that expect it globally
window.EventEmitter = EventEmitter;
