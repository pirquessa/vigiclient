const AbstractPlugin = require("../utils/AbstractPlugin.js");

class Gentank extends AbstractPlugin {
  constructor() {
    super('Gentank');

    // Config constants
    this.LASER_REMOTE_POSITION = 0;
    this.AUTO_MOVE_REMOTE_POSITION = 6;
    this.batMin = 9.9;
    this.batMax = 12.6;
    this.arduinoAddress = 0x12;
    this.timers = {
      read: 30000,
      write: 75,
      autoLaser: 250
    };
    this.busyWithI2C = false;
    this.turret = {
      x: {min: 28000, max: 37000, current: 32500, direction: 1},
      y: {min: 31200, max: 32500, current: 31500, direction: 1}
    };

    // Attributes
    this.i2c = null;
    this.tx = null;
    this.environment = null;
    this.intervals = {
      read: null,
      write: null,
      autoLaser: null
    }
    this.autoLaser = false;
    this.lastTxToForward = null;
    this.lastTxForwarded = null;
  }

  init(config) {
    this.updateConfiguration(config);

    this._readBatLvl();

    return Promise.resolve();
  }

  updateConfiguration(config) {
    this.i2c = this.i2c === null ? config.i2c : this.i2c;
    this.tx = config.tx;
    this.rx = config.rx;
    this.environment = config.environment
  }

  forwardTxData(data) {
    let autoLaser = (this.tx.interrupteurs[0] >> this.AUTO_MOVE_REMOTE_POSITION & 1) === 1;
    if (autoLaser !== this.autoLaser) {
      if (autoLaser) {
        this._startAutoLaser();
      }
      else {
        this._stopAutoLaser();
      }
    }

    if (this.autoLaser) {
      // Turn on laser
      this.tx.interrupteurs[0] |= 1 << this.LASER_REMOTE_POSITION;
      // Auto move turret
      this.tx.positions[0] = this.turret.x.current;
      this.tx.positions[1] = this.turret.y.current;
    }

    this.lastTxToForward = Buffer.from(this.tx.arrayBuffer);
  }

  sleep() {
    super.sleep();

    this.log('Go to sleep');

    this._stopAutoLaser();

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
          return;
        }).finally(() => {
          this.busyWithI2C = false;
        });
      }
    }, this.timers.write);
  }

  _startAutoLaser() {
    this.log('_startAutoLaser');
    this.autoLaser = true;
    
    this.intervals.autoLaser = setInterval(() => {
      ['x', 'y'].forEach((axis) => {
        if (Math.random() > 0.9) {
          this.turret[axis].direction = -1 * this.turret[axis].direction;
        }

        let newPos = parseInt(this.turret[axis].current + this.turret[axis].direction * Math.random() * this.timers.autoLaser * 1.8);
        if (newPos > this.turret[axis].min && newPos < this.turret[axis].max) {
          this.turret[axis].current = newPos;
        }
        else {
          this.turret[axis].direction = -1 * this.turret[axis].direction;
        }
      });
      
    }, this.timers.autoLaser);
  }

  _stopAutoLaser() {
    this.log('_stopAutoLaser');
    this.autoLaser = false;

    this.tx.interrupteurs[0] ^= 1 << this.LASER_REMOTE_POSITION;

    clearInterval(this.intervals.autoLaser);
    this.intervals.autoLaser = null;
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
      return;
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
