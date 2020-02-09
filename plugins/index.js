class PluginManager {
  constructor(logger, pluginPathes) {
    this.logger = logger;
    this.plugins = [];

    this.logger.local('DEBUG | Will instanciate all plugins:');
    pluginPathes.forEach(pluginPath => {
      this.logger.local('DEBUG | Instanciate plugin: ' + pluginPath);
      try {
        this.plugins.push(new (require(pluginPath))(this.logger));
      }
      catch(e) {
        this.logger.local('ERROR | Fail to instanciate plugin ' + pluginPath + ': ' + e);
      }
    });
  }

  apply(funName, args) {
    //this.logger.local('Apply ' + funName);

    let promises = [];

    this.plugins.forEach(plugin => {
      try {
        promises.push(plugin[funName].apply(plugin, args));
      }
      catch(e) {
        this.logger.local('ERROR | Fail to apply ' + funName + ' on plugin ' + plugin.name + ': ' + e);
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
