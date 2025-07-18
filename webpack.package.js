const path = require('path');
const webpack = require('webpack');

module.exports = (env) => {
  const isESM = env.module === 'esm';
  
  return {
    mode: 'production',
    entry: './src/index.ts',
    output: {
      filename: isESM ? 'index.esm.js' : 'index.js',
      path: path.resolve(__dirname, 'dist'),
      library: isESM ? undefined : '@featrix/sphere-viewer',
      libraryTarget: isESM ? 'module' : 'commonjs2',
      clean: false, // Don't clean since we're building multiple outputs
    },
    experiments: isESM ? {
      outputModule: true,
    } : {},
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
              configFile: 'tsconfig.package.json',
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
    externals: {
      react: 'react',
      'react-dom': 'react-dom',
      'react/jsx-runtime': 'react/jsx-runtime',
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
    ],
    optimization: {
      minimize: true,
    },
  };
}; 