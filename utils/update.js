const fs = require('fs');
const path = require('path');
const url = require('url');
const unzipper = require('unzipper');
const exec = require('child_process').exec;

module.exports = {
  deleteFileOrFolder: function(originPath) {
    let stats = fs.lstatSync(originPath);
    if (stats.isDirectory()) {
      fs.readdirSync(originPath).forEach(function (file) {
        let curPath = originPath + path.sep + file;
        if (fs.lstatSync(curPath).isDirectory()) { // recurse
          this.deleteFileOrFolder(curPath);
        } else { // delete file
          fs.unlinkSync(curPath);
        }
      }.bind(this));
      fs.rmdirSync(originPath);
    }
    else if (stats.isFile()) {
      fs.unlinkSync(originPath);
    }
  },
  
  copyFolder: function(originPath, destinationPath, exceptionList) {
    if (!fs.existsSync(originPath)) {
      throw new Error('Folder ' + originPath + ' do not exists !');
    }
  
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath);
    }
  
    fs.readdirSync(originPath).forEach(function (file, index) {
      let curPath = originPath + path.sep + file;
      let desPath = destinationPath + path.sep + file;
      
      if (exceptionList.includes(curPath)) {
        console.log('Ignore: ' + curPath);
        return;
      }
      
      if (fs.lstatSync(curPath).isDirectory()) { // Handle folder
        this.copyFolder(curPath, desPath, exceptionList);
      } else { // Handle file
        fs.copyFileSync(curPath, desPath);
      }
    }.bind(this));
  },
  
  downloadAndFollowRedirect: function(uri) {
    let opts = url.parse(uri);
    opts.headers = {
      'User-Agent': 'javascript'
    };
  
    let protocol = opts.protocol.slice(0, -1);
    return new Promise(function (resolve, reject) {
      require(protocol).get(opts, function (response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response);
        } else if (response.headers.location) {
          resolve(this.downloadAndFollowRedirect(response.headers.location));
        } else {
          reject(new Error(response.statusCode + ' ' + response.statusMessage));
        }
      }.bind(this)).on('error', reject);
    }.bind(this));
  },
  
  getLatestTagInfos: function(repoOwner, repoId) {
    return new Promise(function (resolve, reject) {
      let opts = url.parse('https://api.github.com/repos/' + repoOwner + '/' + repoId + '/tags');
      opts.headers = {
        'User-Agent': 'javascript'
      };
      require('https').get(opts, function (response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          let body = '';
          response.on("data", function (chunk) {
            body += chunk;
          });
  
          response.on('end', function () {
            var tagList = [];
            try {
              tagList = JSON.parse(body);
            }
            catch(e) {
              return reject('Fail to parse response: ' + e);
            }
  
            if (tagList.length <= 0) {
              return reject('No tag found in this repo');
            }
  
            resolve(tagList[0]);
          });
        }
        else {
          reject('Bad response: ' + response.statusCode);
        }
      });
    });
  },
  
  downloadAndUnzipTag: function(archiveUri, tmpFolder) {
    console.log('Download @ ' + archiveUri);
  
    return new Promise((resolve, reject) => {
      // downloadAndFollowRedirect last archive
      this.downloadAndFollowRedirect(archiveUri).then((response) => {
        response
          .pipe(unzipper.Extract({ path: tmpFolder })) // Will create tmpFolder if needed
          .on('close', () => {
            try {
              fs.readdirSync(tmpFolder).forEach((tmpSubFolder) => { // Zip contain a sub-folder...
                this.copyFolder(tmpFolder + path.sep + tmpSubFolder, tmpFolder, []);
                this.deleteFileOrFolder(tmpFolder + path.sep + tmpSubFolder);
                resolve();
              });
            }
            catch (e) {
              reject(e);
            }
          });
      }, reject);
    });
  },
  
  replaceCurrentProject: function(originPath, currentProjetPath) {
    return new Promise(function (resolve, reject) {
      if (!fs.existsSync(currentProjetPath)) {
        reject('Folder ' + currentProjetPath + ' do not exist !');
      }
      
      try {
        this.copyFolder(originPath, currentProjetPath, []);
      }
      catch (e) {
        reject(e);
      }
  
      resolve();
    }.bind(this));
  },

  areDependenciesEquals: function(deps1, deps2) {
    if ((typeof deps1) !== (typeof deps2)) {
      return false;
    }

    var libList1 = Object.keys(deps1);
    var libList2 = Object.keys(deps2);

    if (libList1.length !== libList2.length) {
      return false;
    }

    for (libName in libList1) {
      if (deps1[libName] !== deps2[libName]) {
          return false;
      }
    }

    return true;
  },

  npmInstall: function() {
    return new Promise(function (resolve, reject) {
      let child = exec('npm install');
      child.stdout.on('data', function(data) {
        console.log('stdout: ' + data);
      });
      child.stderr.on('data', function(data) {
        console.log('stderr: ' + data);
      });
      child.on('close', function(code) {
        if (code===0) {
          return resolve();
        }

        return reject();
      });
    });
  },

  reboot: function() {
    return new Promise(function (resolve, reject) {
      let child = exec('sudo reboot');
      child.stdout.on('data', function(data) {
        console.log('stdout: ' + data);
      });
      child.stderr.on('data', function(data) {
        console.log('stderr: ' + data);
      });
      child.on('close', function(code) {
        if (code===0) {
          return resolve();
        }

        return reject();
      });
    });
  },

  restartClient: function() {
    return new Promise(function (resolve, reject) {
      let child = exec('systemctl restart vigiclient');
      child.stdout.on('data', function(data) {
        console.log('stdout: ' + data);
      });
      child.stderr.on('data', function(data) {
        console.log('stderr: ' + data);
      });
      child.on('close', function(code) {
        if (code===0) {
          return resolve();
        }

        return reject();
      });
    });
  }
};
