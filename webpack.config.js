const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
    mode: process.env.ENVIRONMENT || 'development',
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist/static'),
        publicPath: process.env.PUBLIC_PATH || undefined,
        filename: 'bundle.[contenthash].js'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    resolve: {
        modules: [
            'node_modules',
            path.resolve(__dirname, 'src')
        ],
        extensions: ['.js', '.css']
    },
    devtool: process.env.ENVIRONMENT === 'production' ? 'source-map' : 'eval-source-map',
    context: __dirname,
    target: 'web',
    devServer: {
        proxy: {
            '/api': 'http://localhost:3000'
        },
        contentBase: path.join(__dirname, 'public'),
        compress: true,
        historyApiFallback: true,
        hot: true,
        https: false,
        noInfo: true
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'src/index.ejs',
            filename: '../index.html',
            hasPublicPath: !!process.env.PUBLIC_PATH
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'static', to: '' }
            ]
        }),
        new webpack.DefinePlugin({
            __PLAYCANVAS_PATH__: JSON.stringify(process.env.ENGINE_PATH ? path.resolve(__dirname, process.env.ENGINE_PATH) : 'playcanvas'),
            __PLAYCANVAS_EXTRAS_PATH__: JSON.stringify('playcanvas/build/playcanvas-extras.js'),
            __PUBLIC_PATH__: JSON.stringify(process.env.PUBLIC_PATH)
        })
    ]
};
