const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "development", // "production" | "development" | "none"
    entry: "./src/index.js", // string | object | array
    output: {
        path: path.resolve(__dirname, "dist"), // string
        filename: "bundle.js", // string
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    resolve: {
        modules: [
            "node_modules",
            path.resolve(__dirname, "src")
        ],
        extensions: [".js", ".css"],
    },
    devtool: "source-map", // enum
    context: __dirname, // string (absolute path!)
    target: "web", // enum
    devServer: {
        proxy: { // proxy URLs to backend development server
            '/api': 'http://localhost:3000'
        },
        contentBase: path.join(__dirname, 'public'), // boolean | string | array, static file location
        compress: true, // enable gzip compression
        historyApiFallback: true, // true for index.html upon 404, object for multiple paths
        hot: true, // hot module replacement. Depends on HotModuleReplacementPlugin
        https: false, // true for self-signed, object for cert authority
        noInfo: true, // only errors & warns on hot reload
        // ...
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "src/index.ejs"
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'static', to: '' },
            ]
        })
    ],
};
