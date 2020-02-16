const AbstractPlugin = require("../utils/AbstractPlugin.js");
const UTILS = require("../utils/Utils.js");

const FS = require("fs");
const EXEC = require("child_process").exec;
const NET = require("net");
const SPLIT = require("stream-split");

class VideoDiffusion extends AbstractPlugin {
  constructor() {
    super('VideoDiffusion');

    // Config constants
    this.MIN_DURATION_OF_ALARM = 3000;
    this.MIN_DURATION_OF_LAG_FOR_ALARM = 250;
    this.LATENCY_END_ALARM = 350;
    this.LATENCY_START_ALARM = 750;
    this.BITRATE_LOW_LATENCY = 100000;
    this.CAPTURESENVEILLERATE = 60000;

    this.SEPARATEURNALU = new Buffer.from([0, 0, 0, 1]);

    this.PORTTCPVIDEO = 8043;

    this.V4L2 = "/usr/bin/v4l2-ctl";
    this.PROCESSDIFFUSION = "/usr/local/vigiclient/processdiffusion";
    this.PROCESSDIFFVIDEO = "/usr/local/vigiclient/processdiffvideo";
    this.CMDDIFFUSIONTEMPLATE = [
      [
        this.PROCESSDIFFUSION,
        " /dev/video0",
        " | /bin/nc 127.0.0.1 " + this.PORTTCPVIDEO,
        " -w 2"
      ].join(""), [
        this.PROCESSDIFFVIDEO,
        " -loglevel fatal",
        " -f fbdev",
        " -r FPS",
        " -i /dev/fb0",
        " -c:v h264_omx",
        " -profile:v baseline",
        " -b:v BITRATE",
        " -flags:v +global_header",
        " -bsf:v dump_extra",
        " -f rawvideo",
        " tcp://127.0.0.1:" + this.PORTTCPVIDEO,
      ].join("")
    ];

    // Attributes
    this.hardwareConf = null;
    this.rx = null;
    this.tx = null;
    this.cmdDiffusion = null;
    this.confVideo = null;
    this.currentCameraIndex = null;
    this.isSeeping = true;
    this.isReady = false;
    this.boostVideo = false;
    this.oldBoostVideo = false;
    this.startAlarmTimestamp = null;
    this.lastTimestamp = null;
    this.lagStartTimestamp = null;
    this.intervals = {
      sleepCapture: null,
      qualityCheck: null
    };
  }

  init(config) {
    this.log('Init !');

    this.hardwareConf = config.hardwareConf;
    this.rx = config.rx;
    this.tx = config.tx;

    this.currentCameraIndex = config.remoteControlConf.COMMANDES[config.remoteControlConf.DEFAUTCOMMANDE].CAMERA;
    this.confVideo = this.hardwareConf.CAMERAS[this.currentCameraIndex];

    NET.createServer((socket) => {
      const SPLITTER = new SPLIT(this.SEPARATEURNALU);
      this.log("The video diffusion process is connected to tcp://127.0.0.1:" + this.PORTTCPVIDEO);

      SPLITTER.on("data", (data) => {
        this.emit('dataToServer', 'serveurrobotvideo', {
          timestamp: Date.now(),
          data: data
        });
      }).on("error", (err) => {
        this.error("Fail to split incoming flow");
      });

      socket.pipe(SPLITTER);

      socket.on("end", () => {
        this.log("The video diffusion process is disconnected from tcp://127.0.0.1:" + this.PORTTCPVIDEO);
      });
    }).listen(this.PORTTCPVIDEO);

    return new Promise((resolve, reject) => {
      setTimeout(() => { // Wait a little bit or one callback will not trigger !
        this._configurationVideo((code) => {
          this.isReady = true;
          resolve();
        });
      }, 100);
    });
  }

  updateConfiguration(config) {
    this.log('Update configuration');

    this.hardwareConf = config.hardwareConf;
    this.rx = config.rx;
    this.tx = config.tx;

    this.currentCameraIndex = config.remoteControlConf.COMMANDES[config.remoteControlConf.DEFAUTCOMMANDE].CAMERA;
    this.confVideo = this.hardwareConf.CAMERAS[this.currentCameraIndex];

    setTimeout(() => { // Wait a little bit or one callback will not trigger !
      if (!this.isSeeping) {
        this._restart();
      } else {
        this._configurationVideo((code) => { });
      }
    }, 100);
  }

  forwardTxData(data) {
    if (!this.isReady || data.boucleVideoCommande <= 0) {
      return;
    }

    this.lastTimestamp = data.boucleVideoCommande;

    if (this.currentCameraIndex !== this.tx.choixCameras[0]) {
      this.currentCameraIndex = this.tx.choixCameras[0];
      this.confVideo = this.hardwareConf.CAMERAS[this.currentCameraIndex];
      this._restart();
    }

    this.boostVideo = (this.tx.interrupteurs[0] >> this.hardwareConf.INTERRUPTEURBOOSTVIDEO & 1) === 1;
    if (this.boostVideo !== this.oldBoostVideo) {
      this.oldBoostVideo = this.boostVideo;

      let brightness = this.boostVideo ? this.confVideo.BOOSTVIDEOLUMINOSITE : this.confVideo.LUMINOSITE;
      let contrast = this.boostVideo ? this.confVideo.BOOSTVIDEOCONTRASTE : this.confVideo.CONTRASTE;

      this._exec("v4l2-ctl", this.V4L2 + " -c brightness=" + brightness + ",contrast=" + contrast);
    }
  }

  wakeUp() {
    super.wakeUp();

    this.log('wakeUp');

    this.isSeeping = false;

    if (this.hardwareConf.CAPTURESENVEILLE) {
      UTILS.sigterm("Raspistill", "raspistill", (code) => {
        this._diffusion();
      });
    } else {
      this._diffusion();
    }

    clearInterval(this.intervals.sleepCapture);
    this.intervals.sleepCapture = null;

    setTimeout(this._startMonitorLatency.bind(this), this.MIN_DURATION_OF_ALARM);
  }

  sleep() {
    super.sleep();

    this.log('sleep');

    this.isSeeping = true;

    UTILS.sigterm("Diffusion", this.PROCESSDIFFUSION, (code) => {
      UTILS.sigterm("DiffVideo", this.PROCESSDIFFVIDEO);
    });

    this._exec("v4l2-ctl", this.V4L2 + " -c video_bitrate=" + this.confVideo.BITRATE);

    this.intervals.sleepCapture = setInterval(() => {
      if (!this.isSeeping || !this.isReady || !this.hardwareConf.CAPTURESENVEILLE)
        return;

      this._runSleepCapture();
    }, this.CAPTURESENVEILLERATE);

    clearInterval(this.intervals.qualityCheck);
    this.intervals.qualityCheck = null;
  }

  _startMonitorLatency() {
    this.intervals.qualityCheck = setInterval(() => {
      if (!this.isReady || this.lastTimestamp === null)
        return;

      let now = Date.now()
      let latency = now - this.lastTimestamp;

      if (this._isLowLantencyMode() && latency < this.LATENCY_END_ALARM && now - this.startAlarmTimestamp > this.MIN_DURATION_OF_ALARM) {
        this.log("Latency " + latency + " ms, go back to original config");
        this._exec("v4l2-ctl", this.V4L2 + " -c video_bitrate=" + this.confVideo.BITRATE);
        this.startAlarmTimestamp = null;
      }
      else if (!this._isLowLantencyMode() && latency > this.LATENCY_START_ALARM) {
        if (this.lagStartTimestamp === null) {
          this.lagStartTimestamp = now;
        }
        else if (now - this.lagStartTimestamp > this.MIN_DURATION_OF_LAG_FOR_ALARM) {
          this.log("Latency " + latency + " ms, go to low latency config");
          this._exec("v4l2-ctl", this.V4L2 + " -c video_bitrate=" + this.BITRATE_LOW_LATENCY);
          this.startAlarmTimestamp = now;
        }
      }
      else {
        this.lagStartTimestamp = null;
      }
    }, this.MIN_DURATION_OF_LAG_FOR_ALARM / 2);
  }

  _isLowLantencyMode() {
    return this.startAlarmTimestamp !== null;
  }

  _configurationVideo(callback) {
    this.cmdDiffusion = this.CMDDIFFUSIONTEMPLATE[this.confVideo.SOURCE]
      .replace("WIDTH", this.confVideo.WIDTH)
      .replace("HEIGHT", this.confVideo.HEIGHT)
      .replace(new RegExp("FPS", "g"), this.confVideo.FPS)
      .replace(new RegExp("BITRATE", "g"), this.confVideo.BITRATE)
      .replace("ROTATION", this.confVideo.ROTATION);

    let brightness = this.boostVideo ? this.confVideo.BOOSTVIDEOLUMINOSITE : this.confVideo.LUMINOSITE;
    let contrast = this.boostVideo ? this.confVideo.BOOSTVIDEOCONTRASTE : this.confVideo.CONTRASTE;

    this._exec("v4l2-ctl", this.V4L2 + " -v width=" + this.confVideo.WIDTH +
      ",height=" + this.confVideo.HEIGHT +
      ",pixelformat=4" +
      " -p " + this.confVideo.FPS +
      " -c h264_profile=0" +
      ",repeat_sequence_header=1" +
      ",rotate=" + this.confVideo.ROTATION +
      ",video_bitrate=" + this.confVideo.BITRATE +
      ",brightness=" + brightness +
      ",contrast=" + contrast, callback);
  }

  _diffusion() {
    this.log("Start H.264 diffusion process");
    UTILS.exec("Diffusion", this.cmdDiffusion, (code) => {
      this.log("Stop of the H.264 diffusion process");
    });
  }

  _restart() {
    UTILS.sigterm("Diffusion", this.PROCESSDIFFUSION, (code) => {
      UTILS.sigterm("DiffVideo", this.PROCESSDIFFVIDEO, (code) => {
        this._configurationVideo((code) => {
          this._diffusion();
        });
      });
    });
  }

  _runSleepCapture() {
    let date = new Date();
    let overlay = date.toLocaleDateString() + " " + date.toLocaleTimeString();
    if (this.hardwareConf.CAPTURESHDR)
      overlay += " HDR " + this.hardwareConf.CAPTURESHDR;
    let options = "-a 1024 -a '" + overlay + "' -rot " + this.confVideo.ROTATION;

    if (this.hardwareConf.CAPTURESHDR) {
      EXEC("raspistill -ev " + -this.hardwareConf.CAPTURESHDR + " " + options + " -o /tmp/1.jpg", (err) => {
        if (err) {
          this.error("Erreur lors de la capture de la première photo");
          return;
        }
        EXEC("raspistill " + options + " -o /tmp/2.jpg", (err) => {
          if (err) {
            this.error("Erreur lors de la capture de la deuxième photo");
            return;
          }
          EXEC("raspistill -ev " + this.hardwareConf.CAPTURESHDR + " " + options + " -o /tmp/3.jpg", (err) => {
            if (err) {
              this.error("Erreur lors de la capture de la troisième photo");
              return;
            }
            EXEC("enfuse -o /tmp/out.jpg /tmp/1.jpg /tmp/2.jpg /tmp/3.jpg", (err) => {
              if (err)
                this.error("Erreur lors de la fusion des photos");
              else {
                FS.readFile("/tmp/out.jpg", (err, data) => {
                  this.log("Envoi d'une photo sur le serveur " + serveur);
                  this.emit('dataToServer', 'serveurrobotcapturesenveille', data);
                });
              }
            });
          });
        });
      });
    } else {
      EXEC("raspistill -q 10 " + options + " -o /tmp/out.jpg", (err) => {
        if (err)
          this.error("Erreur lors de la capture de la photo");
        else {
          FS.readFile("/tmp/out.jpg", (err, data) => {
            this.log("Envoi d'une photo sur le serveur " + serveur);
            this.emit('dataToServer', 'serveurrobotcapturesenveille', data);
          });
        }
      });
    }
  }

  _exec(name, cmd, endCallback) {
    this.log("Start subProcess " + name + ": \"" + cmd + "\"");
    let subProcess = EXEC(cmd);
    if (endCallback !== undefined) {
      subProcess.on("close", endCallback);
    }
  }
}

module.exports = VideoDiffusion;
