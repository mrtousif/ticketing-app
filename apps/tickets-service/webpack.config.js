const { composePlugins, withNx } = require('@nx/webpack');
const path = require('path');

// Nx plugins for webpack.
module.exports = composePlugins(
  withNx({
    target: 'node',
  }),
  (config) => {
    // Update the webpack config as needed here.
    // e.g. `config.plugins.push(new MyPlugin())`
    config.output.devtoolModuleFilenameTemplate = function (info) {
      const rel = path.relative(process.cwd(), info.absoluteResourcePath);
      return `webpack:///./${rel}`;
    };

    config.devtool = 'source-map';
    return config;
  }
);
