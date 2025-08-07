const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    // Entry points for your extension's scripts
    entry: {
        service_worker: path.resolve(__dirname, '..', 'src', 'service-worker.ts'),
        sidepanel: path.resolve(__dirname, '..', 'src', 'sidepanel.ts'),
        // content_script: path.resolve(__dirname, '..', 'src', 'content-script.ts'), // Assuming you have this file
        // options: path.resolve(__dirname, '..', 'src', 'options.ts'), // For options.html
    },
    // Output settings for bundled JavaScript files
    output: {
        path: path.join(__dirname, '../dist'), // Changed: All output goes to the root of 'dist'
        filename: 'js/[name].js', // Changed: JS files go into a 'js' subfolder within 'dist'
    },
    // Resolve extensions for TypeScript and JavaScript files
    resolve: {
        extensions: ['.ts', '.js'],
    },
    // Module rules for handling different file types
    module: {
        rules: [
            {
                test: /\.ts$/, // Apply ts-loader to TypeScript files
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    // Plugins for copying static assets and other tasks
    plugins: [
        new CopyPlugin({
            patterns: [
                // Copy your manifest.json to the root of the dist folder (relative to output.path)
                { from: 'manifest.json', to: './manifest.json' },
                // Copy your HTML files to the root of the dist folder
                { from: 'sidepanel.html', to: './sidepanel.html' },
                {
                    from: 'src/showdown.js',
                    to: 'js/showdown.js'
                },
                {
                    from: 'src/showdown.min.js',
                    to: 'js/showdown.min.js'
                },
                {
                    from: 'src/pdf.mjs',
                    to: 'js/pdf.mjs'
                },
                {
                    from: 'src/pdf.worker.mjs',
                    to: 'js/pdf.worker.mjs'
                },
                {
                    from: 'output_format.txt',
                    to: 'output_format.txt'
                },
                // { from: 'options.html', to: './options.html' },
                // Copy images to a subfolder in dist
                { from: 'images', to: './images' },
                // Add any other static assets here
            ],
        }),
    ],
};
