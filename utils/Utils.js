const LOGGER = require("./Logger.js").getLogger();

const EXEC = require("child_process").exec;
const RL = require("readline");

module.exports = {
  exec: function (name, cmd, endCallback) {
    LOGGER.both("Start subProcess " + name + ": \"" + cmd + "\"");
    let subProcess = EXEC(cmd);
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

      LOGGER.both("SubProcess " + name + " stops after " + elapsed + " milliseconds with exit code: " + code);
      endCallback(code);
    });
  },

  sigterm: function (name, process, endCallback) {
    LOGGER.both("Send signal SIGTERM to process " + name);
    let processkill = EXEC("/usr/bin/pkill -15 -f ^" + process);
    processkill.on("close", endCallback);
  },

  traces: function (id, messages) {
    let tableau = messages.split("\n");
    if (!tableau[tableau.length - 1]) {
      tableau.pop();
    }

    for (let i = 0; i < tableau.length; i++) {
      LOGGER.both(id + " | " + tableau[i]);
    }
  }

}