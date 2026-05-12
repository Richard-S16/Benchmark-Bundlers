const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = (env, argv) => ({
  entry: path.resolve(__dirname, '../shared-src/src/main.tsx'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.svg$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../shared-src/index.html'),
    }),
  ],
  optimization: {
    runtimeChunk: 'single',
  },
  performance: false,
  cache: {
    type: 'filesystem',
    cacheDirectory: path.resolve(__dirname, 'node_modules/.cache/webpack'),
  },
  devServer: {
    port: 3001,
    hot: true,
    static: path.resolve(__dirname, '../shared-src/public'),
  },
  devtool: argv.mode === 'production' ? false : 'eval-cheap-module-source-map',
});
