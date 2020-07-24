const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = env => {
    return {
        mode: env && env.production ? 'production' : 'development',
        entry: './src/index.js',
        output: {
            path: path.resolve(__dirname, 'dist'),
            publicPath: env && env.publicPath ? '/viewer/' : undefined,
            filename: 'bundle.js'
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
        devtool: 'source-map',
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
                template: 'src/index.ejs'
            }),
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'static', to: '' }
                ]
            })
        ]
    };
};
