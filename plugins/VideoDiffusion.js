const AbstractPlugin = require("../utils/AbstractPlugin.js");
const UTILS = require("../utils/Utils.js");
const CONF = require("/boot/robot.json");
const NET = require("net");

class VideoDiffusion extends AbstractPlugin {
  constructor() {
    super('VideoDiffusion');

    // Config constants
    this.PORTTCPVIDEO = 8043;
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

    this.boostVideo = false;
    this.oldBoostVideo = false;
  }

  init(config) {
    this.hardwareConf = config.hardwareConf;
    this.rx = config.rx;
    this.tx = config.tx;

    this.confVideo = this.hardwareConf.CAMERAS[config.remoteControlConf.COMMANDES[config.remoteControlConf.DEFAUTCOMMANDE].CAMERA];
    this.oldConfVideo = this.confVideo;
  }

  registerNewSocket(serverSocket) {
    serverSocket.on("clientsrobottx", function (data) {
      this.confVideo = this.hardwareConf.CAMERAS[this.tx.choixCameras[0]];
      if (JSON.stringify(this.confVideo) != JSON.stringify(this.oldConfVideo)) {
        UTILS.sigterm("Diffusion", this.PROCESSDIFFUSION, (code) => {
          UTILS.sigterm("DiffVideo", this.PROCESSDIFFVIDEO, (code) => {
            this._configurationVideo((code) => {
              this._diffusion();
            });
          });
        });
        this.oldConfVideo = this.confVideo;
      }

      if (this.boostVideo != this.oldBoostVideo) {
        if (this.boostVideo) {
          UTILS.exec("v4l2-ctl", V4L2 + " -c brightness=" + this.confVideo.BOOSTVIDEOLUMINOSITE + ",contrast=" + this.confVideo.BOOSTVIDEOCONTRASTE, (code) => {});
        } else {
          UTILS.exec("v4l2-ctl", V4L2 + " -c brightness=" + this.confVideo.LUMINOSITE + ",contrast=" + this.confVideo.CONTRASTE, (code) => {});
        }
        this.oldBoostVideo = this.boostVideo;
      }
    });
  }

  wakeUp() {

  }

  sleep() {

  }

  _configurationVideo(callback) {
    this.cmdDiffusion = CONF.CMDDIFFUSION[confVideo.SOURCE].join("")
      .replace("WIDTH", confVideo.WIDTH)
      .replace("HEIGHT", confVideo.HEIGHT)
      .replace(new RegExp("FPS", "g"), confVideo.FPS)
      .replace(new RegExp("BITRATE", "g"), confVideo.BITRATE)
      .replace("ROTATION", confVideo.ROTATION);

    LOGGER.both("Initialisation de la configuration Video4Linux");

    let luminosite;
    let contraste;
    if (boostVideo) {
      luminosite = confVideo.BOOSTVIDEOLUMINOSITE;
      contraste = confVideo.BOOSTVIDEOCONTRASTE;
    } else {
      luminosite = confVideo.LUMINOSITE;
      contraste = confVideo.CONTRASTE;
    }

    UTILS.exec("v4l2-ctl", V4L2 + " -v width=" + confVideo.WIDTH +
      ",height=" + confVideo.HEIGHT +
      ",pixelformat=4" +
      " -p " + confVideo.FPS +
      " -c h264_profile=0" +
      ",repeat_sequence_header=1" +
      ",rotate=" + confVideo.ROTATION +
      ",video_bitrate=" + confVideo.BITRATE +
      ",brightness=" + luminosite +
      ",contrast=" + contraste, callback);
  }

  _diffusion() {
    this.log("Démarrage du flux de diffusion vidéo H.264");
    UTILS.exec("Diffusion", this.cmdDiffusion, function (code) {
      this.log("Arrêt du flux de diffusion vidéo H.264");
    });
  }
}

module.exports = VideoDiffusion;
