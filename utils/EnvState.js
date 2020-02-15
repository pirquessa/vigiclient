class EnvState {
  constructor() {
    this.voltage = 0;
    this.battery = 0;
    this.cpuLoad = 0;
    this.socTemp = 0;
    this.link = 0;
    this.rssi = 0;
  }
  setBattery(voltage, level) {
    this.voltage = voltage;
    this.battery = level;
  }
  setLoad(load) {
    this.cpuLoad = load;
  }
  setTemperature(temp) {
    this.socTemp = temp;
  }
  setWifiQuality(link, rssi) {
    this.link = link;
    this.rssi = rssi;
  }
  apply(rx) {
    rx.setValeur16(0, this.voltage);
    rx.setValeur16(1, this.battery);
    rx.setValeur8(0, this.cpuLoad);
    rx.setValeur8(1, this.socTemp);
    rx.setValeur8(2, this.link);
    rx.setValeur8(3, this.rssi);
  }
}

exports.EnvState = EnvState;
