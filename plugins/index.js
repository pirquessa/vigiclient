const LOGGER = require("../utils/Logger.js").getLogger();

class PluginManager {
  constructor(pluginPathes) {
    this.plugins = [];

    LOGGER.local('DEBUG | Will instanciate all plugins:');
    pluginPathes.forEach(pluginPath => {
      LOGGER.local('DEBUG | Instanciate plugin: ' + pluginPath);
      try {
        this.plugins.push(new (require(pluginPath))());
      }
      catch(e) {
        LOGGER.local('ERROR | Fail to instanciate plugin ' + pluginPath + ': ' + e);
      }
    });
  }

  apply(funName, args) {
    //LOGGER.local('Apply ' + funName);

    let promises = [];

    this.plugins.forEach(plugin => {
      try {
        promises.push(plugin[funName].apply(plugin, args));
      }
      catch(e) {
        LOGGER.local('ERROR | Fail to apply ' + funName + ' on plugin ' + plugin.name + ': ' + e);
      }
    });

    return Promise.all(promises);
  }

  on(eventName, listener) {
    this.plugins.forEach(plugin => {
      plugin.on(eventName, listener);
    });
  }
}

module.exports = PluginManager;
