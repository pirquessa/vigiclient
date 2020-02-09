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

    this.plugins.forEach(plugin => {
      try {
        plugin[funName].apply(plugin, args);
      }
      catch(e) {
        this.logger.local('ERROR | Fail to apply ' + funName + ' on plugin ' + plugin.name);
      }
    });
  }
}

module.exports = PluginManager;
