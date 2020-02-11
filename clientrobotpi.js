"use strict";

const CONF = require("/boot/robot.json");

const TRAME = require("./trame.js");
const LOGGER = require("./utils/Logger.js").init("/var/log/vigiclient.log");

const PORTROBOTS = 8042;

const INTERFACEWIFI = "wlan0";
const FICHIERWIFI = "/proc/net/wireless";
const FICHIERTEMPERATURE = "/sys/class/thermal/thermal_zone0/temp";
const CPURATE = 250;
const TEMPERATURERATE = 1000;
const WIFIRATE = 250;

const CMDINT = RegExp(/^-?\d{1,10}$/);

const FRAME0 = "$".charCodeAt();
const FRAME1S = "S".charCodeAt();
const FRAME1T = "T".charCodeAt();

const UPTIMEOUT = 5000;
const TXRATE = 50;
const BEACONRATE = 10000;

const CW2015ADDRESS = 0x62;
const CW2015WAKEUP = new Buffer.from([0x0a, 0x00]);
const MAX17043ADDRESS = 0x36;
const BQ27441ADDRESS = 0x55;
const GAUGERATE = 250;

const PCA9685FREQUENCY = 50;
const PIGPIOMOTORFREQUENCY = 100;

const UNUSED = -1;
const SERVO = 0;
const PCASERVO = 1;
const L9110 = 2;
const L298 = 3;
const PCAL298 = 4;

const OS = require("os");
const FS = require("fs");
const IO = require("socket.io-client");
const EXEC = require("child_process").exec;
const RL = require("readline");
const GPIO = require("pigpio").Gpio;
const I2C = require("i2c-bus");
const PCA9685 = require("pca9685");
const PLUGINS = new (require("./plugins"))([
 "./Safety.js",
 "./VideoDiffusion.js",
 // "./AudioDiffusion.js",
 // "./SerialSlave.js",
 // "./TextToSpeech.js",
 "./Gentank.js"
]);

const VERSION = Math.trunc(FS.statSync(__filename).mtimeMs);
const PROCESSTIME = Date.now();
const OSTIME = PROCESSTIME - OS.uptime() * 1000;

let sockets = {};
let serveurCourant = "";

let up = false;
let upTimeout;
let init = false;
let conf;
let hard;
let tx;
let rx;

let lastTrame = Date.now();

let oldPositions = [];
let oldVitesses = [];
let oldMoteurs = [];
let rattrapage = [];
let oldTxInterrupteurs;

let gpiosMoteurs = [];
let gpioInterrupteurs = [];

let i2c;
let gaugeType;

let pca9685Driver = [];

let prevCpus = OS.cpus();
let nbCpus = prevCpus.length;

CONF.SERVEURS.forEach(function(serveur) {
 sockets[serveur] = IO.connect(serveur, {"connect timeout": 1000, transports: ["websocket"], path: "/" + PORTROBOTS + "/socket.io"});
 LOGGER.addSocket(sockets[serveur]);
});

LOGGER.both("Démarrage du client");

i2c = I2C.openSync(1);

try {
 i2c.i2cWriteSync(CW2015ADDRESS, 2, CW2015WAKEUP);
 gaugeType = "CW2015";
} catch(err) {
 try {
  i2c.readWordSync(MAX17043ADDRESS, 0x02);
  gaugeType = "MAX17043";
 } catch(err) {
  try {
   i2c.readWordSync(BQ27441ADDRESS, 0x04);
   gaugeType = "BQ27441";
  } catch(err) {
   i2c.closeSync();
   gaugeType = "";
  }
 }
}

setTimeout(function() {
 if(gaugeType)
  LOGGER.both(gaugeType + " I2C fuel gauge detected");
 else
  LOGGER.both("No I2C fuel gauge detected");
}, 1000);

function map(n, inMin, inMax, outMin, outMax) {
 return Math.trunc((n - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);
}

function constrain(n, nMin, nMax) {
 if(n > nMax)
  n = nMax;
 else if(n < nMin)
  n = nMin;

 return n;
}

function debout(serveur) {
 if(up)
  return;

 if(!init) {
  LOGGER.both("Ce robot n'est pas initialisé");
  return;
 }

 if(serveurCourant) {
  LOGGER.both("Ce robot est déjà utilisé depuis le serveur " + serveurCourant);
  return;
 }

 LOGGER.both("Sortie de veille du robot");

 for(let i = 0; i < hard.MOTEURS.length; i++)
  oldMoteurs[i]++;

 for(let i = 0; i < 8; i++)
  setGpio(i, tx.interrupteurs[0] >> i & 1);

 serveurCourant = serveur;
 up = true;

 PLUGINS.apply('wakeUp');
}

function dodo() {
 if(!up)
  return;

 LOGGER.both("Mise en veille du robot");

 for(let i = 0; i < conf.TX.POSITIONS.length; i++)
  tx.positions[i] = (conf.TX.POSITIONS[i] + 180) * 0x10000 / 360;

 for(let i = 0; i < conf.TX.VITESSES.length; i++)
  tx.vitesses[i] = conf.TX.VITESSES[i];

 for(let i = 0; i < hard.MOTEURS.length; i++) {
  if(hard.MOTEURS[i].FAILSAFE)
   setConsigneMoteur(i, 0);
  else {
   gpiosMoteurs[i].forEach(function(gpio) {
    gpio.mode(GPIO.INPUT);
   });
  }
 }

 for(let i = 0; i < 8; i++)
  setGpio(i, 0);

 rx.interrupteurs[0] = 0;

 serveurCourant = "";
 up = false;

 PLUGINS.apply('sleep');
}

CONF.SERVEURS.forEach(function(serveur, index) {

 sockets[serveur].on("connect", function() {
  LOGGER.both("Connecté sur " + serveur + "/" + PORTROBOTS);
  EXEC("hostname -I").stdout.on("data", function(ipPriv) {
   EXEC("iwgetid -r || echo $?").stdout.on("data", function(ssid) {
    sockets[serveur].emit("serveurrobotlogin", {
     conf: CONF,
     version: VERSION,
     processTime: PROCESSTIME,
     osTime: OSTIME,
     ipPriv: ipPriv.trim(),
     ssid: ssid.trim()
    });
   });
  });
 });

 if(index == 0) {
  sockets[serveur].on("clientsrobotconf", function(data) {
   LOGGER.both("Réception des données de configuration du robot depuis le serveur " + serveur);

   // Security hardening: even if already done on server side,
   // always filter values integrated in command lines
   for(let i = 0; i < data.hard.CAMERAS.length; i++) {
    if(!(CMDINT.test(data.hard.CAMERAS[i].SOURCE) &&
         CMDINT.test(data.hard.CAMERAS[i].WIDTH) &&
         CMDINT.test(data.hard.CAMERAS[i].HEIGHT) &&
         CMDINT.test(data.hard.CAMERAS[i].FPS) &&
         CMDINT.test(data.hard.CAMERAS[i].BITRATE) &&
         CMDINT.test(data.hard.CAMERAS[i].ROTATION) &&
         CMDINT.test(data.hard.CAMERAS[i].LUMINOSITE) &&
         CMDINT.test(data.hard.CAMERAS[i].CONTRASTE) &&
         CMDINT.test(data.hard.CAMERAS[i].BOOSTVIDEOLUMINOSITE) &&
         CMDINT.test(data.hard.CAMERAS[i].BOOSTVIDEOCONTRASTE)))
     return;
   }

   conf = data.conf;
   hard = data.hard;

   tx = new TRAME.Tx(conf.TX);
   rx = new TRAME.Rx(conf.TX, conf.RX);

   for(let i = 0; i < conf.TX.POSITIONS.length; i++)
    oldPositions[i] = tx.positions[i] + 1;

   for(let i = 0; i < conf.TX.VITESSES.length; i++)
    oldVitesses[i] = tx.vitesses[i] + 1;

   for(let i = 0; i < hard.MOTEURS.length; i++) {
    oldMoteurs[i] = 0;
    rattrapage[i] = 0;
   }

   oldTxInterrupteurs = conf.TX.INTERRUPTEURS[0];

   gpiosMoteurs.forEach(function(gpios) {
    gpios.forEach(function(gpio) {
     gpio.mode(GPIO.INPUT);
    });
   });

   gpioInterrupteurs.forEach(function(gpio) {
    gpio.mode(GPIO.INPUT);
   });

   pca9685Driver = [];
   gpiosMoteurs = [];
   gpioInterrupteurs = [];

   for(let i = 0; i < hard.PCA9685ADDRESSES.length; i++) {
    pca9685Driver[i] = new PCA9685.Pca9685Driver({
     i2c: i2c,
     address: hard.PCA9685ADDRESSES[i],
     frequency: PCA9685FREQUENCY
    }, function(err) {
     if(err)
      LOGGER.both("Error initializing PCA9685 at address " + hard.PCA9685ADDRESSES[i]);
     else
      LOGGER.both("PCA9685 initialized at address " + hard.PCA9685ADDRESSES[i]);
    });
   }

   for(let i = 0; i < hard.MOTEURS.length; i++) {
    if(hard.MOTEURS[i].ADRESSE < 0) {
     gpiosMoteurs[i] = [];
     for(let j = 0; j < hard.MOTEURS[i].PINS.length; j++)
      gpiosMoteurs[i][j] = new GPIO(hard.MOTEURS[i].PINS[j], {mode: GPIO.OUTPUT});
     setMotorFrequency(i);
    }
   }

   for(let i = 0; i < 8; i++) {
    if(hard.INTERRUPTEURS[i].PIN != UNUSED) {
     if(hard.INTERRUPTEURS[i].PCA9685 == UNUSED)
      gpioInterrupteurs[i] = new GPIO(hard.INTERRUPTEURS[i].PIN, {mode: GPIO.OUTPUT});
     setGpio(i, 0);
    }
   }

   if(!init) {
    PLUGINS.apply('init', [{
     rx: rx,
     tx: tx,
     i2c: i2c,
     remoteControlConf: conf,
     hardwareConf: hard,
     hard: hard
    }]).then(() => {
     init = true;
    });
   }
   else {
    PLUGINS.apply('updateConfiguration', [{
     rx: rx,
     tx: tx,
     remoteControlConf: conf,
     hardwareConf: hard
    }]);
   }
  });
 }

 sockets[serveur].on("disconnect", function() {
  LOGGER.both("Déconnecté de " + serveur + "/" + PORTROBOTS);
  dodo();
 });

 sockets[serveur].on("connect_error", function(err) {
  //LOGGER.both("Erreur de connexion au serveur " + serveur + "/" + PORTROBOTS);
 });

 sockets[serveur].on("clientsrobotsys", function(data) {
  switch(data) {
   case "exit":
    LOGGER.both("Fin du processus Node.js");
    process.exit();
    break;
   case "reboot":
    LOGGER.both("Redémarrage du système");
    EXEC("reboot");
    break;
   case "poweroff":
    LOGGER.both("Arrêt du système");
    EXEC("poweroff");
    break;
  }
 });

 sockets[serveur].on("echo", function(data) {
  sockets[serveur].emit("echo", {
   serveur: data,
   client: Date.now()
  });
 });

 sockets[serveur].on("clientsrobottx", function(data) {
  if(serveurCourant && serveur != serveurCourant)
   return;

  if(data.data[0] != FRAME0 ||
     data.data[1] != FRAME1S &&
     data.data[1] != FRAME1T) {
   LOGGER.both("Réception d'une trame corrompue");
   return;
  }

  // Reject bursts
  let now = Date.now();
  if(now - lastTrame < TXRATE / 2)
   return;
  lastTrame = now;

  debout(serveur);
  clearTimeout(upTimeout);
  upTimeout = setTimeout(function() {
   dodo();
  }, UPTIMEOUT);

  if(data.data[1] == FRAME1T) {
   LOGGER.both("Réception d'une trame texte");
   PLUGINS.apply('forwardToSlave', ['text', data.data]);
   return;
  }

  for(let i = 0; i < tx.byteLength; i++)
   tx.bytes[i] = data.data[i];

  PLUGINS.apply('forwardToSlave', ['data', data.data]);

  for(let i = 0; i < hard.MOTEURS.length; i++)
   setConsigneMoteur(i, 1);

  if(tx.interrupteurs[0] != oldTxInterrupteurs) {
   for(let i = 0; i < 8; i++) {
    let etat = tx.interrupteurs[0] >> i & 1;
    setGpio(i, etat);
   }
   oldTxInterrupteurs = tx.interrupteurs[0]
  }

  if(!hard.DEVTELEMETRIE) {
   for(let i = 0; i < conf.TX.POSITIONS.length; i++)
    rx.positions[i] = tx.positions[i];
   rx.choixCameras[0] = tx.choixCameras[0];
   for(let i = 0; i < conf.TX.VITESSES.length; i++)
    rx.vitesses[i] = tx.vitesses[i];
   rx.interrupteurs[0] = tx.interrupteurs[0];

   PLUGINS.apply('updateRx', [rx]);

   sockets[serveur].emit("serveurrobotrx", {
    timestamp: now,
    data: rx.arrayBuffer
   });
  }
 });

 PLUGINS.apply('registerNewSocket', [sockets[serveur]]);
});

PLUGINS.on('dataToServer', (eventName, data) => {
 CONF.SERVEURS.forEach((serveur) => {
  if (serveurCourant && serveur != serveurCourant)
   return;

  sockets[serveur].emit(eventName, data);
 });
});

PLUGINS.on('activeEngine', (n, rattrape) => {
 setConsigneMoteur(n, rattrape);
});
 
function setPca9685Gpio(pcaId, pin, etat) {
 if(etat)
  pca9685Driver[pcaId].channelOn(pin);
 else
  pca9685Driver[pcaId].channelOff(pin);
}

function setGpio(n, etat) {
 etat ^= hard.INTERRUPTEURS[n].INV;
 if(hard.INTERRUPTEURS[n].PIN != UNUSED) {
  if(hard.INTERRUPTEURS[n].PCA9685 == UNUSED) {
   if(hard.INTERRUPTEURS[n].MODE == 1 && !etat || // Drain ouvert
      hard.INTERRUPTEURS[n].MODE == 2 && etat)    // Collecteur ouvert
    gpioInterrupteurs[n].mode(GPIO.INPUT);
   else
    gpioInterrupteurs[n].digitalWrite(etat);
  } else
   setPca9685Gpio(hard.INTERRUPTEURS[n].PCA9685, hard.INTERRUPTEURS[n].PIN, etat);
 }
}

function computePwm(n, consigne, min, max) {
 let pwm;
 let pwmNeutre = (min + max) / 2 + hard.MOTEURS[n].OFFSET;

 if(consigne < -2)
  pwm = map(consigne, -hard.MOTEURS[n].COURSE * 0x8000 / 360, 0, min, pwmNeutre + hard.MOTEURS[n].NEUTREAR);
 else if(consigne > 2)
  pwm = map(consigne, 0, hard.MOTEURS[n].COURSE * 0x8000 / 360, pwmNeutre + hard.MOTEURS[n].NEUTREAV, max);
 else
  pwm = pwmNeutre;

 return pwm;
}

function setMotorFrequency(n) {
 switch(hard.MOTEURS[n].TYPE) {
  case L9110:
   gpiosMoteurs[n][0].pwmFrequency(PIGPIOMOTORFREQUENCY);
   gpiosMoteurs[n][1].pwmFrequency(PIGPIOMOTORFREQUENCY);
   break;
  case L298:
   gpiosMoteurs[n][0].pwmFrequency(PIGPIOMOTORFREQUENCY);
   break;
 }
}

function setConsigneMoteur(n, rattrape) {
 let moteur = 0;

 for(let i = 0; i < conf.TX.POSITIONS.length; i++)
  moteur += (tx.positions[i] - 0x8000) * hard.MIXAGES[n].POSITIONS[i];

 for(let i = 0; i < conf.TX.VITESSES.length; i++)
  moteur += tx.vitesses[i] * hard.MIXAGES[n].VITESSES[i] * 0x100;

 if(moteur != oldMoteurs[n]) {
  if(rattrape) {
   if(moteur < oldMoteurs[n])
    rattrapage[n] = -hard.MOTEURS[n].RATTRAPAGE * 0x10000 / 360;
   else if(moteur > oldMoteurs[n])
    rattrapage[n] = hard.MOTEURS[n].RATTRAPAGE * 0x10000 / 360;
  } else
   rattrapage[n] = 0;

  oldMoteurs[n] = moteur;

  let consigne = Math.trunc(constrain(moteur + rattrapage[n] + hard.MOTEURS[n].OFFSET * 0x10000 / 360, -hard.MOTEURS[n].COURSE * 0x8000 / 360,
                                                                                                        hard.MOTEURS[n].COURSE * 0x8000 / 360));
  setMoteur(n, consigne);
 }
}

function setMoteur(n, consigne) {
 switch(hard.MOTEURS[n].TYPE) {
  case PCASERVO:
   pca9685Driver[hard.MOTEURS[n].PCA9685].setPulseLength(hard.MOTEURS[n].PIN, computePwm(n, consigne, hard.MOTEURS[n].PWMMIN, hard.MOTEURS[n].PWMMAX));
   break;
  case SERVO:
   gpiosMoteurs[n][0].servoWrite(computePwm(n, consigne, hard.MOTEURS[n].PWMMIN, hard.MOTEURS[n].PWMMAX));
   break;
  case L9110:
   l9110MotorDrive(n, computePwm(n, consigne, -255, 255));
   break;
  case L298:
   l298MotorDrive(n, computePwm(n, consigne, -255, 255));
   break;
  case PCAL298:
   pca9685MotorDrive(n, computePwm(n, consigne, -100, 100));
   break;
 }
}

function l298MotorDrive(n, consigne) {
 let pwm;

 if(consigne < 0) {
  gpiosMoteurs[n][1].digitalWrite(false);
  gpiosMoteurs[n][2].digitalWrite(true);
  pwm = -consigne;
 } else if(consigne > 0) {
  gpiosMoteurs[n][1].digitalWrite(true);
  gpiosMoteurs[n][2].digitalWrite(false);
  pwm = consigne;
 } else {
  gpiosMoteurs[n][1].digitalWrite(false);
  gpiosMoteurs[n][2].digitalWrite(false);
  pwm = 0;
 }

 gpiosMoteurs[n][0].pwmWrite(pwm);
}

function l9110MotorDrive(n, consigne) {
 if(consigne < 0) {
  gpiosMoteurs[n][0].digitalWrite(false);
  gpiosMoteurs[n][1].pwmWrite(-consigne);
 } else if(consigne > 0) {
  gpiosMoteurs[n][0].pwmWrite(consigne);
  gpiosMoteurs[n][1].digitalWrite(false);
 } else {
  gpiosMoteurs[n][0].digitalWrite(false);
  gpiosMoteurs[n][1].digitalWrite(false);
 }
}

function pca9685MotorDrive(n, consigne) {
 let pcaId = hard.MOTEURS[n].PCA9685;
 let chIn1 = hard.MOTEURS[n].PINS[1];
 let chIn2 = hard.MOTEURS[n].PINS[2];
 let pwm;

 if(consigne < 0) {
  pca9685Driver[pcaId].channelOff(chIn1);
  pca9685Driver[pcaId].channelOn(chIn2);
  pwm = -consigne / 100;
 } else if(consigne > 0) {
  pca9685Driver[pcaId].channelOn(chIn1);
  pca9685Driver[pcaId].channelOff(chIn2);
  pwm = consigne / 100;
 } else {
  pca9685Driver[pcaId].channelOff(chIn1);
  pca9685Driver[pcaId].channelOff(chIn2);
  pwm = 0;
 }

 pca9685Driver[pcaId].setDutyCycle(hard.MOTEURS[n].PINS[0], pwm);
}

setInterval(function() {
 if(!init)
  return;

 let currCpus = OS.cpus();
 let charges = 0;
 let idles = 0;

 for(let i = 0; i < nbCpus; i++) {
  let prevCpu = prevCpus[i];
  let currCpu = currCpus[i];

  charges += currCpu.times.user - prevCpu.times.user;
  charges += currCpu.times.nice - prevCpu.times.nice;
  charges += currCpu.times.sys - prevCpu.times.sys;
  charges += currCpu.times.irq - prevCpu.times.irq;
  idles += currCpu.times.idle - prevCpu.times.idle;
 }
 prevCpus = currCpus;

 rx.setValeur8(0, 100 - Math.trunc(100 * idles / (charges + idles)));
}, CPURATE);

setInterval(function() {
 if(!init)
  return;

 FS.readFile(FICHIERTEMPERATURE, function(err, data) {
  rx.setValeur8(1, data / 1000);
 });
}, TEMPERATURERATE);

setInterval(function() {
 if(!init)
  return;

 const STATS = RL.createInterface(FS.createReadStream(FICHIERWIFI));

 STATS.on("line", function(ligne) {
  ligne = ligne.split(/\s+/);

  if(ligne[1] == INTERFACEWIFI + ":") {
   rx.setValeur8(2, ligne[3]);
   rx.setValeur8(3, ligne[4]);
  }
 });
}, WIFIRATE);

function swapWord(word) {
 return (word & 0xff) << 8 | word >> 8;
}

switch(gaugeType) {
 case "CW2015":
  setInterval(function() {
   if(!init)
    return;
   i2c.readWord(CW2015ADDRESS, 0x02, function(err, microVolts305) {
    rx.setValeur16(0, swapWord(microVolts305) * 305 / 1000000);
    i2c.readWord(CW2015ADDRESS, 0x04, function(err, pour25600) {
     rx.setValeur16(1, swapWord(pour25600) / 256);
    });
   });
  }, GAUGERATE);
  break;

 case "MAX17043":
  setInterval(function() {
   if(!init)
    return;
   i2c.readWord(MAX17043ADDRESS, 0x02, function(err, volts12800) {
    rx.setValeur16(0, swapWord(volts12800) / 12800);
    i2c.readWord(MAX17043ADDRESS, 0x04, function(err, pour25600) {
     rx.setValeur16(1, swapWord(pour25600) / 256);
    });
   });
  }, GAUGERATE);
  break;

 case "BQ27441":
  setInterval(function() {
   if(!init)
    return;
   i2c.readWord(BQ27441ADDRESS, 0x04, function(err, milliVolts) {
    rx.setValeur16(0, milliVolts / 1000);
    i2c.readByte(BQ27441ADDRESS, 0x1c, function(err, pourcents) {
     rx.setValeur16(1, pourcents);
    });
   });
  }, GAUGERATE);
  break;
}

setInterval(function() {
 if(up || !init || hard.DEVTELEMETRIE)
  return;

 CONF.SERVEURS.forEach(function(serveur) {
  PLUGINS.apply('updateRx', [rx]);

  sockets[serveur].emit("serveurrobotrx", {
   timestamp: Date.now(),
   data: rx.arrayBuffer
  });
 });
}, BEACONRATE);

process.on("uncaughtException", function(err) {
 let i = 0;
 let erreur = err.stack.split("\n");

 while(i < erreur.length)
  LOGGER.both(erreur[i++]);

 LOGGER.both("Suite à cette exception non interceptée, le processus Node.js va être terminé automatiquement");
 setTimeout(function() {
  process.exit(1);
 }, 1000);
})

LOGGER.both("Client prêt");
