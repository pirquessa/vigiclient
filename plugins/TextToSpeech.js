const AbstractPlugin = require("../utils/AbstractPlugin.js");
const UTILS = require("../utils/Utils.js");

const FS = require("fs");

class TextToSpeech extends AbstractPlugin {
  constructor() {
    super('TextToSpeech');

    // Config constants

    // Attributes
    this.playbackDevice = null;
  }

  init(config) {
    this.playbackDevice = config.hardwareConf.PLAYBACKDEVICE;
  }

  registerNewSocket(serverSocket) {
    serverSocket.on("clientsrobottts", (data) => {
      if (this.playbackDevice === null) {
        return;
      }

      this.log('Let\'s talk: ' + data);

      FS.writeFile("/tmp/tts.txt", data, (err) => {
        if (err) {
          this.error(err);
          return;
        }

        UTILS.exec("eSpeak", "/usr/bin/espeak -v fr -f /tmp/tts.txt --stdout > /tmp/tts.wav", (code) => {
          UTILS.exec("Aplay", "/usr/bin/aplay -D plughw:" + this.playbackDevice + " /tmp/tts.wav", (code) => {});
        });
      });
    });
  }
}

module.exports = TextToSpeech;
