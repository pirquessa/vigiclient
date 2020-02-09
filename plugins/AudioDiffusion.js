const AbstractPlugin = require("../utils/AbstractPlugin.js");
const EXEC = require("child_process").exec;
const RL = require("readline");
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
    this.cmdDiffAudio = null;
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
  }

  wakeUp() {
    this.log("Start audio diffusion process");

    this.exec("DiffAudio", this.CMDDIFFAUDIO, (code) => {
      this.log("Stop of the audio diffusion process");
    });
  }

  sleep() {
    sigterm("DiffAudio", this.PROCESSDIFFAUDIO, (code) => { });
  }

  // Move in a generic util class
  exec(name, command, endCallback) {
    this.log("Start subProcess " + name);
    this.log(command);
    let subProcess = EXEC(command);
    let stdout = RL.createInterface(subProcess.stdout);
    let stderr = RL.createInterface(subProcess.stderr);
    let pid = subProcess.pid;
    let execTime = Date.now();

    //subProcess.stdout.on("data", function(data) {
    stdout.on("line", (data) => {
      this.traces(name + " | " + pid + " | stdout", data);
    });

    //subProcess.stderr.on("data", function(data) {
    stderr.on("line", (data) => {
      this.traces(name + " | " + pid + " | stderr", data);
    });

    subProcess.on("close", (code) => {
      let elapsed = Date.now() - execTime;

      this.log("SubProcess " + name + " stops after " + elapsed + " milliseconds with exit code: " + code);
      endCallback(code);
    });
  }

  // Move in a generic util class
  traces(id, messages) {
    let tableau = messages.split("\n");
    if (!tableau[tableau.length - 1]) {
      tableau.pop();
    }

    for (let i = 0; i < tableau.length; i++) {
      this.log(id + " | " + tableau[i]);
    }
  }
}

module.exports = AudioDiffusion;
