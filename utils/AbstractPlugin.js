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

  log(msg) {
    this.logger.local(this.name + ' | ' + msg);
  }
}

module.exports = AbstractPlugin;
