import { resolve } from "path"

import { Configuration, DefinePlugin } from "webpack"

import { createPlugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

const config: Configuration = {
  entry: "./src/index.ts",
  mode: "production",
  module: {
    rules: rules,
  },
  optimization: {
    minimize: false,
  },
  output: {
    filename: "index.js",
    path: resolve(__dirname, ".webpack/main"),
  },
  plugins: [
    ...createPlugins("production"),
    new DefinePlugin({
      MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: `__dirname + "/preload.js"`,
      MAIN_WINDOW_WEBPACK_ENTRY: `"file://" + __dirname + "/../renderer/main_window/index.html"`,
      BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY: `__dirname + "/../block/preload.js"`,
      BLOCK_WINDOW_WEBPACK_ENTRY: `"file://" + __dirname + "/../renderer/block_window/index.html"`,
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
    extensions: [".css", ".js", ".json", ".jsx", ".ts", ".tsx"],
  },
  target: "electron-main",
}

export default config
