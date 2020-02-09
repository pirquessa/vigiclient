const EventEmitter = require('events');

/*
Event emited:
  - dataToServer: the plugin want to send data back to server
*/
class AbstractPlugin extends EventEmitter {
  constructor(name, logger) {
    super();

    this.name = name;
    this.logger = logger;
  }

  // Called on init, the first time server send "clientsrobotconf"
  init(config) {
    return Promise.resolve();
  }

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
    this.logger.local(this.name + ' | DEBUG | ' + msg);
  }

  error(msg) {
    this.logger.local(this.name + ' | ERROR | ' + msg);
  }
}

module.exports = AbstractPlugin;
