const path = require('path');
const webpack = require('webpack');

// Standalone build: bundles React + ReactDOM so no external deps needed.
// Use this for pages that don't already have React (e.g. monitor, static HTML).
// Output: dist/sphere-viewer-standalone.js (~300KB larger than the external build)

module.exports = {
  mode: 'production',
  entry: './src/embed-entry-standalone.tsx',
  output: {
    filename: 'sphere-viewer-standalone.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'FeatrixSphereViewer',
    libraryTarget: 'umd',
    libraryExport: 'default',
    globalObject: 'this',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.embed.json',
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  // No externals — React is bundled
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
  ],
  optimization: {
    minimize: true,
  },
};
