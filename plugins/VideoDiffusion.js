const AbstractPlugin = require("../utils/AbstractPlugin.js");
const UTILS = require("../utils/Utils.js");
const CONF = require("/boot/robot.json");

const FS = require("fs");
const EXEC = require("child_process").exec;
const NET = require("net");
const SPLIT = require("stream-split");

class VideoDiffusion extends AbstractPlugin {
  constructor() {
    super('VideoDiffusion');

    // Config constants
    this.LATENCEFINALARME = 350;
    this.LATENCEDEBUTALARME = 750;
    this.BITRATEVIDEOFAIBLE = 100000;
    this.CAPTURESENVEILLERATE = 60000;

    this.SEPARATEURNALU = new Buffer.from([0, 0, 0, 1]);

    this.PORTTCPVIDEO = 8043;

    this.V4L2 = "/usr/bin/v4l2-ctl";
    this.PROCESSDIFFUSION = "/usr/local/vigiclient/processdiffusion";
    this.PROCESSDIFFVIDEO = "/usr/local/vigiclient/processdiffvideo";
    this.CMDDIFFUSION = [
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
    this.oldConfVideo = null;
    this.isSeeping = true;

    this.boostVideo = false;
    this.oldBoostVideo = false;

    this.lastTimestamp = Date.now();
  }

  init(config) {
    this.hardwareConf = config.hardwareConf;
    this.rx = config.rx;
    this.tx = config.tx;

    this.confVideo = this.hardwareConf.CAMERAS[config.remoteControlConf.COMMANDES[config.remoteControlConf.DEFAUTCOMMANDE].CAMERA];
    this.oldConfVideo = this.confVideo;

    setInterval(function () {
      if (up || !init || !initVideo || !this.hardwareConf.CAPTURESENVEILLE)
        return;

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
                  FS.readFile("/tmp/out.jpg", function (err, data) {
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
            FS.readFile("/tmp/out.jpg", function (err, data) {
              this.log("Envoi d'une photo sur le serveur " + serveur);
              this.emit('dataToServer', 'serveurrobotcapturesenveille', data);
            });
          }
        });
      }
    }, this.CAPTURESENVEILLERATE);

    let alarmeLatence = false;
    setInterval(() => {
      if (!up || !init)
        return;

      let latencePredictive = Date.now() - lastTimestamp;

      if (latencePredictive < this.LATENCEFINALARME && alarmeLatence) {
        this.log("Latence de " + latencePredictive + " ms, retour au débit vidéo configuré");
        UTILS.exec("v4l2-ctl", this.V4L2 + " -c video_bitrate=" + this.confVideo.BITRATE, (code) => { });
        alarmeLatence = false;
      } else if (latencePredictive > this.LATENCEDEBUTALARME && !alarmeLatence) {
        this.log("Latence de " + latencePredictive + " ms, passage en débit vidéo réduit");
        UTILS.exec("v4l2-ctl", this.V4L2 + " -c video_bitrate=" + this.BITRATEVIDEOFAIBLE, (code) => { });
        alarmeLatence = true;
      }
    }, TXRATE);

    NET.createServer((socket) => {
      const SPLITTER = new SPLIT(this.SEPARATEURNALU);

      this.log("Le processus de diffusion vidéo H.264 est connecté sur tcp://127.0.0.1:" + this.PORTTCPVIDEO);

      SPLITTER.on("data", (data) => {
        this.emit('dataToServer', 'serveurrobotvideo', {
          timestamp: Date.now(),
          data: data
        });
      }).on("error", function (err) {
        this.error("Erreur lors du découpage du flux d'entrée en unités de couche d'abstraction réseau H.264");
      });

      socket.pipe(SPLITTER);

      socket.on("end", function () {
        this.log("Le processus de diffusion vidéo H.264 est déconnecté de tcp://127.0.0.1:" + this.PORTTCPVIDEO);
      });

    }).listen(this.PORTTCPVIDEO);
  }

  registerNewSocket(serverSocket) {
    serverSocket.on("clientsrobotconf", (data) => {
      this.hardwareConf = data.hard;

      this.confVideo = this.hardwareConf.CAMERAS[config.remoteControlConf.COMMANDES[config.remoteControlConf.DEFAUTCOMMANDE].CAMERA];
      this.oldConfVideo = this.confVideo;

      setTimeout(() => { // Wait a little bit or one callback will not trigger !
        if (!this.isSeeping) {
          this._restart();
        } else {
          this._configurationVideo((code) => {
            initVideo = true;
          });
        }
      }, 100);
    });

    serverSocket.on("clientsrobottx", (data) => {
      this.lastTimestamp = data.boucleVideoCommande;

      this.confVideo = this.this.hardwareConfwareConf.CAMERAS[this.tx.choixCameras[0]];
      if (JSON.stringify(this.confVideo) != JSON.stringify(this.oldConfVideo)) {
        this._restart();
        this.oldConfVideo = this.confVideo;
      }

      this.boostVideo = this.tx.interrupteurs[0] >> this.hardwareConf.INTERRUPTEURBOOSTVIDEO & 1;
      if (this.boostVideo != this.oldBoostVideo) {
        if (this.boostVideo) {
          UTILS.exec("v4l2-ctl", this.V4L2 + " -c brightness=" + this.confVideo.BOOSTVIDEOLUMINOSITE + ",contrast=" + this.confVideo.BOOSTVIDEOCONTRASTE, (code) => { });
        } else {
          UTILS.exec("v4l2-ctl", this.V4L2 + " -c brightness=" + this.confVideo.LUMINOSITE + ",contrast=" + this.confVideo.CONTRASTE, (code) => { });
        }
        this.oldBoostVideo = this.boostVideo;
      }
    });
  }

  wakeUp() {
    this.isSeeping = false;

    if (this.hardwareConf.CAPTURESENVEILLE) {
      UTILS.sigterm("Raspistill", "raspistill", (code) => {
        this._diffusion();
      });
    } else {
      this._diffusion();
    }
  }

  sleep() {
    this.isSeeping = true;

    UTILS.sigterm("Diffusion", this.PROCESSDIFFUSION, (code) => {
      UTILS.sigterm("DiffVideo", this.PROCESSDIFFVIDEO, (code) => { });
    });

    UTILS.exec("v4l2-ctl", this.V4L2 + " -c video_bitrate=" + this.confVideo.BITRATE, (code) => { });
  }

  _configurationVideo(callback) {
    this.cmdDiffusion = CONF.CMDDIFFUSION[this.confVideo.SOURCE].join("")
      .replace("WIDTH", this.confVideo.WIDTH)
      .replace("HEIGHT", this.confVideo.HEIGHT)
      .replace(new RegExp("FPS", "g"), this.confVideo.FPS)
      .replace(new RegExp("BITRATE", "g"), this.confVideo.BITRATE)
      .replace("ROTATION", this.confVideo.ROTATION);

    this.log("Initialisation de la configuration Video4Linux");

    let luminosite;
    let contraste;
    if (boostVideo) {
      luminosite = this.confVideo.BOOSTVIDEOLUMINOSITE;
      contraste = this.confVideo.BOOSTVIDEOCONTRASTE;
    } else {
      luminosite = this.confVideo.LUMINOSITE;
      contraste = this.confVideo.CONTRASTE;
    }

    UTILS.exec("v4l2-ctl", this.V4L2 + " -v width=" + this.confVideo.WIDTH +
      ",height=" + this.confVideo.HEIGHT +
      ",pixelformat=4" +
      " -p " + this.confVideo.FPS +
      " -c h264_profile=0" +
      ",repeat_sequence_header=1" +
      ",rotate=" + this.confVideo.ROTATION +
      ",video_bitrate=" + this.confVideo.BITRATE +
      ",brightness=" + luminosite +
      ",contrast=" + contraste, callback);
  }

  _diffusion() {
    this.log("Démarrage du flux de diffusion vidéo H.264");
    UTILS.exec("Diffusion", this.cmdDiffusion, function (code) {
      this.log("Arrêt du flux de diffusion vidéo H.264");
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
}

module.exports = VideoDiffusion;
