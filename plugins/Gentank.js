const AbstractPlugin = require("../utils/AbstractPlugin.js");

class Gentank extends AbstractPlugin {
  constructor() {
    super('Gentank');

    // Config constants
    this.arduinoAddress = 0x12;
    this.bat = [0, 0];
    this.timers = {
      read: 30000,
      write: 50
    };

    // Attributes
    this.i2c = null;
    this.intervals = {
      read: null,
      write: null
    }
    this.lastTxToForward = null;
    this.lastTxForwarded = null;
  }

  init(config) {
    this.i2c = config.i2c;

    this._readBatLvl();

    return super.init(config);
  }

  forwardToSlave(type, tx) {
    if (type === 'text') {
      return;
    }

    this.lastTxToForward = tx;
  }

  updateRx(rx) {
    rx.valeursUint16[0] = this.bat[0];
    rx.valeursUint16[1] = this.bat[1];
  }

  sleep() {
    super.sleep();

    this.log('Go to sleep');

    clearInterval(this.intervals.read);
    this.intervals.read = null;
    clearInterval(this.intervals.write);
    this.intervals.write = null;
  }

  wakeUp() {
    super.wakeUp();

    this.log('Wake up !');

    // Read from slave
    this.intervals.read = setInterval(this._readBatLvl.bind(this), this.timers.read);

    // Write to slave
    this.intervals.write = setInterval(() => {
      if (this.lastTxToForward !== null && this.lastTxForwarded !== this.lastTxToForward) {
        this.lastTxForwarded = this.lastTxToForward;
        this.i2c.promisifiedBus().i2cWrite(this.arduinoAddress, this.lastTxToForward.length, this.lastTxToForward).catch((err) => {
          this.error('Fail to write data to slave: ' + err);
        });
      }
    }, this.timers.write);
  }

  _readBatLvl() {
    var buff = Buffer.alloc(4);
    this.i2c.promisifiedBus().i2cRead(this.arduinoAddress, buff.length, buff).then((result) => {
      this.bat[0] = result.buffer.readUInt16LE();
      this.bat[1] = result.buffer.readUInt16LE(2);
      
      this.log('1 Read bat[0]: ' + this.bat[0] + ', bat[1]: ' + this.bat[1]);
    }).catch(function(err) {
      this.error('Fail to read data from slave: ' + err);
    });
  }
}

module.exports = Gentank;
