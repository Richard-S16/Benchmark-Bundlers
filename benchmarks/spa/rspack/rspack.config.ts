import path from 'path';
import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';

export default defineConfig((env, argv) => ({
  entry: {
    main: path.resolve(__dirname, '../shared-src/src/main.tsx'),
  },
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
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic' } },
            },
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        type: 'javascript/auto',
      },
      {
        test: /\.svg$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: path.resolve(__dirname, '../shared-src/index.html'),
    }),
  ],
  optimization: {
    runtimeChunk: 'single',
  },
  performance: false,
  cache: {
    type: 'persistent',
    storage: {
      type: 'filesystem',
      directory: path.resolve(__dirname, 'node_modules/.cache/rspack'),
    },
  },
  devServer: {
    port: 3003,
    hot: true,
    static: path.resolve(__dirname, '../shared-src/public'),
  },
  devtool: argv.mode === 'production' ? false : 'eval-cheap-module-source-map',
}));
