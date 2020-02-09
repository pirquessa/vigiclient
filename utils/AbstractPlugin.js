class AbstractPlugin {
  constructor(name, logger) {
    this.name = name;
    this.logger = logger;
  }

  // Called on init, the first time server send "clientsrobotconf"
  init(i2c) {}

  // Called before sending "serveurrobotrx" to server
  updateRx(rx) {}

  // Called to send data to slave (arduino ?)
  forwardToSlave(tx) {}

  // Called when robot need to stop activity
  sleep() {}

  // Called when robot can go back to activity
  wakeUp() {}

  log(msg) {
    this.logger.local(this.name + ' | DEBUG | ' + msg);
  }

  error(msg) {
    this.logger.local(this.name + ' | ERROR | ' + msg);
  }
}

module.exports = AbstractPlugin;
