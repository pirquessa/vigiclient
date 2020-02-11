const AbstractPlugin = require("../utils/AbstractPlugin.js");

class Safety extends AbstractPlugin {
  constructor() {
    super('Safety');

    // Config constants
    this.LATENCEDEBUTALARME = 750;

    // Attributes
    this.remoteControlConf = null;
    this.hardwareConf = null;
    this.tx = null;

    this.interval = null;
    this.lastTimestamp = 0;
  }

  init(config) {
    this.remoteControlConf = config.remoteControlConf;
    this.hardwareConf = config.hardwareConf;
    this.tx = config.tx;

    return super.init(config);
  }

  registerNewSocket(serverSocket) {
    serverSocket.on("clientsrobottx", (data) => {
      this.lastTimestamp = data.boucleVideoCommande;
    });
  }

  sleep() {
    super.sleep();

    clearInterval(this.interval);
    this.interval = null;
  }

  wakeUp() {
    super.wakeUp();

    this.interval = setInterval(() => {
      let latence = Date.now() - this.lastTimestamp;
      if (latence > this.LATENCEDEBUTALARME) {
        this._failSafe();
      }
    }, 50);
  }

  _failSafe() {
    for (let i = 0; i < this.remoteControlConf.TX.VITESSES.length; i++) {
      this.tx.vitesses[i] = this.remoteControlConf.TX.VITESSES[i];
    }

    for (let i = 0; i < this.hardwareConf.MOTEURS.length; i++) {
      if (this.hardwareConf.MOTEURS[i].FAILSAFE) {
        this.emit('activeEngine', i, 0);
      }
    }
  }
}

module.exports = Safety;
