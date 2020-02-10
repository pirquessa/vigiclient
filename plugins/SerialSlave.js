const AbstractPlugin = require("../utils/AbstractPlugin.js");
const SP = require("serialport");

class SerialSlave extends AbstractPlugin {
  constructor() {
    super('SerialSlave');

    // Config constants

    // Attributes
    this.rx = null;
    this.hardwareConfig = null;
    this.serial = null;
  }

  init(config) {
    this.rx = config.rx;
    this.hardwareConfig = config.hard;

    this.serial = new SP(this.hardwareConfig.DEVROBOT, {
      baudRate: this.hardwareConfig.DEVDEBIT,
      lock: false
    });

    return new Promise((resolve, reject) => {
      this.serial.on("open", () => {
        this.log("Connected to " + this.hardwareConfig.DEVROBOT);

        if (this.hardwareConfig.DEVTELEMETRIE) {

          this.serial.on("data", (data) => {
            this.rx.update(data, () => {
              this.emit('dataToServer', 'serveurrobotrx', {
                timestamp: Date.now(),
                data: this.rx.arrayBuffer
              });
            }, this.log);
          });
        }

        resolve();
      });
    });
  }

  forwardToSlave(type, tx) {
    if (this.hardwareConfig.DEVTELECOMMANDE) {
      this.serial.write(tx);
    }
  }
}

module.exports = SerialSlave;
