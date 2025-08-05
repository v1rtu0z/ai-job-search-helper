const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development', // Set mode to development
    devtool: 'inline-source-map', // Enable source maps for easier debugging
});
