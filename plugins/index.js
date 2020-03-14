const LOGGER = require("../utils/Logger.js").getLogger();

class PluginManager {
  constructor() {
    this.plugins = null;
    this.callbackStack = [];
  }

  init(pluginConfigs) {
    LOGGER.local('PLUGIN | DEBUG | Will instanciate all plugins:');

    var plugins = [];
    pluginConfigs.forEach(pluginConfig => {
      LOGGER.local('PLUGIN | DEBUG | Instanciate plugin: ' + pluginConfig.name);
      try {
        plugins.push(new (require(pluginConfig.path))());
      }
      catch(e) {
        LOGGER.local('PLUGIN | ERROR | Fail to instanciate plugin ' + pluginPath.name + ': ' + e);
      }
    });
    this.plugins = plugins;
    this.callbackStack.forEach(cb => {
      cb();
    });
  }

  onNewConfig(hardwareConfig, remoteConfig) {
    if (hardwareConfig.PLUGINS !== undefined) {
      if (this.plugins === null) {
        var pluginPathes = hardwareConfig.PLUGINS.filter(pluginName => {
          return /^\w+$/g.test(pluginName);
        }).map((pluginName => {
          return {
            name: pluginName,
            path: './' + pluginName + '.js'
          };
        }));

        this.init(pluginPathes);
      }
    }
    else {
      LOGGER.local('PLUGIN | ERROR | You need to define the plugins to load !');
    }
  }

  onReady(callback) {
    if (this.plugins === null) {
      this.callbackStack.push(callback);
    }
    else {
      callback();
    }
  }

  apply(funName, args) {
    //LOGGER.local('Apply ' + funName);

    let promises = [];

    if (this.plugins !== null) {
      this.plugins.forEach(plugin => {
        try {
          promises.push(plugin[funName].apply(plugin, args));
        }
        catch(e) {
          LOGGER.local('PLUGIN | ERROR | Fail to apply ' + funName + ' on plugin ' + plugin.name + ': ' + e);
        }
      });
    }
    else {
      LOGGER.local('PLUGIN | ERROR | Can\'t apply method "' + funName + '" because plugins are not initialized');
    }

    return Promise.all(promises);
  }

  on(eventName, listener) {
    this.onReady(() => {
      this.plugins.forEach(plugin => {
        plugin.on(eventName, listener);
      });
    });
  }
}

module.exports = PluginManager;
