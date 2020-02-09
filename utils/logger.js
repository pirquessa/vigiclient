const FS = require("fs");

function getTimePrefix(date) {
	return ('0' + date.getHours()).slice(-2) + ':' +
		('0' + date.getMinutes()).slice(-2) + ':' +
		('0' + date.getSeconds()).slice(-2) + ':' +
		('00' + date.getMilliseconds()).slice(-3);
}

let singleton = null;

class Logger {
	constructor(logFile) {
		this.filePath = logFile;
		this.sockets = [];
	}

	addSocket(socket) {
		this.sockets.push(socket);
	}

	local(message) {
		FS.appendFile(this.filePath, getTimePrefix(new Date()) + ' | ' + message + '\n', function (err) {});
	}

	remote(message) {
		this.sockets.forEach(function(socket) {
			socket.emit('serveurrobottrace', message);
		});
	}

	both(message) {
		this.local(message);
		this.remote(message);
	}
}

module.exports = {
	init: function(logFile) {
		if (singleton !== null) {
			throw Error('Can init only once a singleton !');
		}

		singleton = new Logger(logFile);

		return singleton;
	},

	getLogger: function() {
		if (singleton === null) {
			throw Error('Init singleton first !');
		}

		return singleton;
	}
};
