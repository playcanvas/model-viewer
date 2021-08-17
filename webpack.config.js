const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const config = {
    mode: process.env.ENVIRONMENT || 'development',
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist/static'),
        publicPath: process.env.PUBLIC_PATH || undefined,
        filename: 'bundle.js'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.tsx?$/,
                use: [
                    {

                        loader: "babel-loader",
                        options: {
                            presets: [
                                "@babel/preset-env",
                                "@babel/preset-react"
                            ],
                            plugins: [
                                "@babel/plugin-proposal-class-properties"
                            ]
                        }
                    },
                    'awesome-typescript-loader'
                ]
            }
        ]
    },
    resolve: {
        modules: [
            path.resolve(__dirname, 'src'),
            'node_modules'
        ],
        alias: {
            lib: path.resolve(__dirname, 'lib')
        },
        extensions: ['.tsx', '.ts', '.js', '.css']
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
            hasPublicPath: !!process.env.PUBLIC_PATH,
            analyticsID: process.env.ANALYTICS_ID,
            oneTrustDomainKey: process.env.ONETRUST_DOMAIN_KEY,
            oneTrustDeveloperId: process.env.ONETRUST_DEVELOPER_ID
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'static', to: '' }
            ]
        }),
        new webpack.DefinePlugin({
            __PUBLIC_PATH__: JSON.stringify(process.env.PUBLIC_PATH)
        }),
        new webpack.ProvidePlugin({
            'React': 'react'
        })
    ]
};

if (process.env.ENGINE_PATH) {
    config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
            /^playcanvas$/,
            path.resolve(__dirname, process.env.ENGINE_PATH)
        )
    );
}

if (process.env.EXTRAS_PATH) {
    config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
            /^playcanvas\/build\/playcanvas-extras\.js$/,
            path.resolve(__dirname, process.env.EXTRAS_PATH)
        )
    );
}

if (process.env.ANALYZE_BUNDLE) {
    config.plugins.push(
        new BundleAnalyzerPlugin()
    );
}

module.exports = config;
