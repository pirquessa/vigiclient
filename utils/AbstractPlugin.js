const EventEmitter = require('events');
const LOGGER = require("./Logger.js").getLogger();

/*
Event emited:
  - dataToServer: the plugin want to send data back to server
  - activeEngine: the plugin want to activate or desactivate an engine
*/
class AbstractPlugin extends EventEmitter {
  constructor(name) {
    super();

    this.name = name;
  }

  // Called on init, the first time server send "clientsrobotconf"
  init(config) {
    return Promise.resolve();
  }

  // Called each time server send "clientsrobotconf" (execept first one that use init())
  updateConfiguration(config) {}

  // Called during init to setup event handler on server socket
  registerNewSocket(serverSocket) {}

  // Called before sending "serveurrobotrx" to server
  updateRx(rx) {}

  // Called to send data to slave (arduino ?)
  forwardToSlave(type, tx) {}

  // Called when robot need to stop activity
  sleep() {
  }

  // Called when robot can go back to activity
  wakeUp() {
  }

  log(msg) {
    LOGGER.local(this.name + ' | DEBUG | ' + msg);
  }

  error(msg) {
    LOGGER.local(this.name + ' | ERROR | ' + msg);
  }
}

module.exports = AbstractPlugin;
