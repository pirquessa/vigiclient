class PluginManager {
  constructor(logger, pluginPathes) {
    this.logger = logger;
    this.plugins = [];

    this.logger.local('Will instanciate all plugins:');
    pluginPathes.forEach(pluginPath => {
      this.logger.local('Instanciate plugin: ' + pluginPath);
      try {
        this.plugins.push(new (require(pluginPath))(this.logger));
      }
      catch(e) {
        this.logger.local('Fail to instanciate plugin ' + pluginPath + ': ' + e);
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
        this.logger.local('Fail to apply ' + funName + ' on plugin ' + plugin.name);
      }
    });
  }
}

module.exports = PluginManager;
