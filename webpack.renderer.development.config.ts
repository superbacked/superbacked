import { resolve } from "path"

import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin"
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin"
import HtmlWebpackPlugin from "html-webpack-plugin"
import { Configuration } from "webpack"
import { Configuration as DevServerConfiguration } from "webpack-dev-server"

import { createPlugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
})

const devServer: DevServerConfiguration = {
  host: "localhost",
  hot: true,
  liveReload: false,
  port: 3000,
  static: {
    directory: resolve(__dirname, ".webpack/renderer"),
  },
  webSocketServer: "ws",
}

const config: Configuration = {
  devServer: devServer,
  entry: {
    main_window: "./src/main/renderer.tsx",
    block_window: "./src/block/renderer.tsx",
  },
  mode: "development",
  module: {
    rules: rules,
  },
  optimization: {
    minimize: false,
  },
  output: {
    filename: "[name]/index.js",
    path: resolve(__dirname, ".webpack/renderer"),
    publicPath: "/",
  },
  plugins: [
    ...createPlugins("development"),
    new ReactRefreshWebpackPlugin(),
    new ForkTsCheckerWebpackPlugin({
      async: true,
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
  target: "web",
}

export default config
