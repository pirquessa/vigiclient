const AbstractPlugin = require("../utils/AbstractPlugin.js");
const SP = require("serialport");

class SerialSlave extends AbstractPlugin {
  constructor(logger) {
    super('SerialSlave', logger);

    // Config constants
    this.FRAME0 = "$".charCodeAt();
    this.FRAME1S = "S".charCodeAt();
    this.FRAME1T = "T".charCodeAt();
    this.FRAME1R = "R".charCodeAt();

    // Attributes
    this.serial = null;
  }

  init(config) {
    this.serial = new SP(config.hard.DEVROBOT, {
      baudRate: config.hard.DEVDEBIT,
      lock: false
    });

    return new Promise((resolve, reject) => {
      this.serial.on("open", () => {
        this.log("Connected to " + config.hard.DEVROBOT);

        if (config.hard.DEVTELEMETRIE) {
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
                    this.emit('dataToServer', {
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
    this.serial.write(tx);
  }
}

module.exports = SerialSlave;