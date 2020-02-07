const fs = require('fs');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const updateUtils = require('./utils/update.js');

const repoOwner = 'pirquessa';
const repoId = 'vigiclient';
const tempFolderPath = path.resolve('tmp');
const backupFolderPath = path.resolve('update.backup');
const projectFolderPath = path.resolve('.' + path.sep);

let updateDone = false;

updateUtils.getLatestTagInfos(repoOwner, repoId).then(function (latestTag) {
	console.log('Distant version: ' + latestTag.name);

	let localVersion = require('./package.json').version;
	console.log('Local version: ' + localVersion);

	if (localVersion !== latestTag.name) {
		// Create a backup
		try {
			if (fs.existsSync(backupFolderPath)) {
				console.log('Delete old backup: ' + backupFolderPath);
				updateUtils.deleteFileOrFolder(backupFolderPath);
			}

			console.log('Backup current project');
			updateUtils.copyFolder(projectFolderPath, backupFolderPath, [path.resolve('update.backup2'), path.resolve('.git'), path.resolve('node_modules'), tempFolderPath, backupFolderPath]);
		}
		catch(e) {
			console.error('Fail to backup current project: ' + e);
		}

		return updateUtils.downloadAndUnzipTag(latestTag.zipball_url, tempFolderPath).then(function() {
			return true;
		});
	}

	return false;
}).then(function (hasUpdated) {
	if (hasUpdated) {
		return updateUtils.replaceCurrentProject(tempFolderPath, projectFolderPath);
	}
	
	return Promise.reject('No need to update !');
}).then(function () {
	console.log('Update done');

	updateDone = true;
	return;
}).catch(function (e) {
	console.error('Fail: ' + e);

	if (fs.existsSync(backupFolderPath)) {
		console.log('Restore backuped project');
		updateUtils.copyFolder(backupFolderPath, projectFolderPath, []);
	}
}).catch(function (e) {
	console.error('Fatal fail: ' + e);
}).finally(function() {
	if (fs.existsSync(tempFolderPath)) {
		updateUtils.deleteFileOrFolder(tempFolderPath);

		console.log(tempFolderPath + ' folder deleted !');
	}

	if (updateDone) {
		exec('npm install').then((stdout, stderr) => {
			console.log(`npm install stdout: ${stdout}`);
			console.error(`npm install stderr: ${stderr}`);

			return exec('sudo reboot');
		}).then((stdout, stderr) => {
			console.log(`reboot stdout: ${stdout}`);
			console.error(`reboot stderr: ${stderr}`);
		}).catch((e) => {
			console.error('Fatal fail: ' + e);
		});
	}
});
