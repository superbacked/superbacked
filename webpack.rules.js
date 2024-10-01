module.exports = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules\/.+\.node$/,
    use: "node-loader",
  },
  {
    test: /\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },
  {
    test: /\.svg$/,
    issuer: /\.[jt]sx?$/,
    use: {
      loader: "@svgr/webpack",
      options: {
        typescript: true,
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(\.webpack|node_modules)/,
    use: [
      {
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
      },
      "./webpack-conditional-loader.js",
    ],
  },
  {
    test: /\.wav$/,
    issuer: /\.[jt]sx?$/,
    use: {
      loader: "file-loader",
    },
  },
]
