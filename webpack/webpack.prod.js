const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'production', // Set mode to production
    // You might add optimization settings here for production builds,
    // like terser-webpack-plugin for minification.
});
