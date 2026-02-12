import { resolve } from "path"

import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin"
import HtmlWebpackPlugin from "html-webpack-plugin"
import { Configuration } from "webpack"

import { createPlugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
})

const config: Configuration = {
  entry: {
    main_window: "./src/main/renderer.tsx",
    block_window: "./src/block/renderer.tsx",
  },
  mode: "production",
  module: {
    rules: rules,
  },
  optimization: {
    minimize: false,
  },
  output: {
    filename: "[name]/index.js",
    path: resolve(__dirname, ".webpack/renderer"),
  },
  plugins: [
    ...createPlugins("production"),
    new ForkTsCheckerWebpackPlugin({
      logger: "webpack-infrastructure",
    }),
    new HtmlWebpackPlugin({
      chunks: ["main_window"],
      filename: "main_window/index.html",
      template: "./src/index.html",
    }),
    new HtmlWebpackPlugin({
      chunks: ["block_window"],
      filename: "block_window/index.html",
      template: "./src/index.html",
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
    extensions: [".css", ".js", ".jsx", ".ts", ".tsx"],
  },
  target: "electron-renderer",
}

export default config
