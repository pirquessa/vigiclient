const AbstractPlugin = require("../utils/AbstractPlugin.js");

class Gentank extends AbstractPlugin {
  constructor(logger) {
    super('Gentank', logger);

    this.log('Hello world !');

    this.arduinoAddress = 0x12;
    this.bat = [0, 0];
    this.timers = {
      read: 30000,
      write: 50
    };

    this.i2c = null;
    this.lastTxToForward = null;
    this.lastTxForwarded = null;
  }

  init(i2c) {
    this.i2c = i2c;

    // Read from slave
    var buff = Buffer.alloc(4);
    setInterval(() => {
      this.i2c.promisifiedBus().i2cRead(this.arduinoAddress, buff.length, buff).then((result) => {
        this.bat[0] = result.buffer.readUInt16LE();
        this.bat[1] = result.buffer.readUInt16LE(2);
        
        this.log('1 Read bat[0]: ' + this.bat[0] + ', bat[1]: ' + this.bat[1]);
      }).catch(function(err) {
        this.log('Fail to read data from slave: ' + err);
      });
    }, this.timers.read);

    
    // Write to slave
    setInterval(() => {
      if (this.lastTxToForward !== null && this.lastTxForwarded !== this.lastTxToForward) {
        this.lastTxForwarded = this.lastTxToForward;
        this.i2c.promisifiedBus().i2cWrite(this.arduinoAddress, this.lastTxToForward.length, this.lastTxToForward).catch((err) => {
          this.log('Fail to write data to slave: ' + err);
        });
      }
    }, this.timers.write);
  }

  forwardToSlave(tx) {
    this.lastTxToForward = tx;
  }

  updateRx(rx) {
    rx.valeursUint16[0] = this.bat[0];
    rx.valeursUint16[1] = this.bat[1];
  }
}

module.exports = Gentank;
