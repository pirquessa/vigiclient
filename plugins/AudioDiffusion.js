const AbstractPlugin = require("../utils/AbstractPlugin.js");
const UTILS = require("../utils/Utils.js");

const NET = require("net");

class AudioDiffusion extends AbstractPlugin {
  constructor() {
    super('AudioDiffusion');

    // Config constants
    this.PORTTCPAUDIO = 8044;
    this.PROCESSDIFFAUDIO = "/usr/local/vigiclient/processdiffaudio";
    this.CMDDIFFAUDIO = [
      this.PROCESSDIFFAUDIO,
      " -loglevel fatal",
      " -f alsa",
      " -ac 1",
      " -i hw:1,0",
      " -ar 16000",
      " -c:a pcm_s16le",
      " -f s16le",
      " tcp://127.0.0.1:" + this.PORTTCPAUDIO
    ].join("");

    // Attributes
  }

  init(config) {
    NET.createServer((socket) => {
      this.log("The audio diffusion process is connected to tcp://127.0.0.1:" + this.PORTTCPAUDIO);

      let array = [];
      let i = 0;
      socket.on("data", (data) => {
        array.push(data);
        i++;

        if (i == 20) {
          this.emit('dataToServer', 'serveurrobotaudio', {
            timestamp: Date.now(),
            data: Buffer.concat(array)
          });

          array = [];
          i = 0;
        }

      });

      socket.on("end", () => {
        this.log("The audio diffusion process is disconnected from tcp://127.0.0.1:" + this.PORTTCPAUDIO);
      });

    }).listen(this.PORTTCPAUDIO);

    return Promise.resolve();
  }

  wakeUp() {
    this.log("wakeUp => Start audio diffusion process");

    UTILS.exec("DiffAudio", this.CMDDIFFAUDIO, (code) => {
      this.log("Audio diffusion process has stopped");
    });
  }

  sleep() {
    this.log("sleep => Stop audio diffusion process");

    UTILS.sigterm("DiffAudio", this.PROCESSDIFFAUDIO);
  }
}

module.exports = AudioDiffusion;
