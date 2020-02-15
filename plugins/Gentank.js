const AbstractPlugin = require("../utils/AbstractPlugin.js");

class Gentank extends AbstractPlugin {
  constructor() {
    super('Gentank');

    // Config constants
    this.batMin = 9.9;
    this.batMax = 12.6;
    this.arduinoAddress = 0x12;
    this.timers = {
      read: 30000,
      write: 50
    };
    this.busyWithI2C = false;

    // Attributes
    this.i2c = null;
    this.environment = null;
    this.intervals = {
      read: null,
      write: null
    }
    this.lastTxToForward = null;
    this.lastTxForwarded = null;
  }

  init(config) {
    this.i2c = config.i2c;
    this.environment = config.environment

    this._readBatLvl();

    return super.init(config);
  }

  forwardToSlave(type, tx) {
    if (type === 'text') {
      return;
    }

    this.lastTxToForward = tx;
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
    this.intervals.read = setInterval(this._whenAvailable.bind(this, this._readBatLvl.bind(this), 300), this.timers.read);

    // Write to slave
    this.intervals.write = setInterval(() => {
      if (!this.busyWithI2C && this.lastTxToForward !== null && this.lastTxForwarded !== this.lastTxToForward) {
        this.busyWithI2C = true;
        this.lastTxForwarded = this.lastTxToForward;
        this.i2c.promisifiedBus().i2cWrite(this.arduinoAddress, this.lastTxToForward.length, this.lastTxToForward).catch((err) => {
          this.error('Fail to write data to slave: ' + err);
        }).finally(() => {
          this.busyWithI2C = false;
        });
      }
    }, this.timers.write);
  }

  _readBatLvl() {
    this.busyWithI2C = true;
    var buff = Buffer.alloc(4);
    this.i2c.promisifiedBus().i2cRead(this.arduinoAddress, buff.length, buff).then((result) => {
      let voltage = result.buffer.readUInt16LE() * (this.batMax - this.batMin) / 65535 + this.batMin;
      let percent = result.buffer.readUInt16LE(2) * 100 / 65535;

      this.environment.setBattery(voltage, percent);

      // this.log('Bat V: ' + this.environment.voltage);
      // this.log('Bat %: ' + this.environment.battery);
    }).catch(function(err) {
      this.error('Fail to read data from slave: ' + err);
    }).finally(() => {
      this.busyWithI2C = false;
    });
  }

  _whenAvailable(cb, waitTime) {
    if (!this.busyWithI2C) {
      cb();
    }
    else {
      setTimeout(cb, waitTime);
    }
  }
}

module.exports = Gentank;
