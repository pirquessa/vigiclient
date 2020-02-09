const AbstractPlugin = require("../utils/AbstractPlugin.js");
const SP = require("serialport");

class SerialSlave extends AbstractPlugin {
  constructor() {
    super('SerialSlave');

    // Config constants
    this.FRAME0 = "$".charCodeAt();
    this.FRAME1S = "S".charCodeAt();
    this.FRAME1T = "T".charCodeAt();
    this.FRAME1R = "R".charCodeAt();

    // Attributes
    this.hardwareConfig = null;
    this.serial = null;
  }

  init(config) {
    this.hardwareConfig = config.hard;

    this.serial = new SP(this.hardwareConfig.DEVROBOT, {
      baudRate: this.hardwareConfig.DEVDEBIT,
      lock: false
    });

    return new Promise((resolve, reject) => {
      this.serial.on("open", () => {
        this.log("Connected to " + this.hardwareConfig.DEVROBOT);

        if (this.hardwareConfig.DEVTELEMETRIE) {
          let rxPos = 0;
          this.serial.on("data", function (data) {
            let i = 0;
            while (i < data.length) {

              switch (rxPos) {
                case 0:
                  if (data[i] == this.FRAME0)
                    rxPos++;
                  else
                    this.error("Premier octet de la trame télémétrique invalide");
                  break;

                case 1:
                  if (data[i] == this.FRAME1R)
                    rxPos++;
                  else {
                    rxPos = 0;
                    this.error("Second octet de la trame télémétrique invalide");
                  }
                  break;

                default:
                  rx.bytes[rxPos++] = data[i];
                  if (rxPos == rx.byteLength) {
                    this.emit('dataToServer', 'serveurrobotrx', {
                      timestamp: Date.now(),
                      data: rx.arrayBuffer
                    });

                    rxPos = 0;
                  }
                  break;
              }

              i++;
            }
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
