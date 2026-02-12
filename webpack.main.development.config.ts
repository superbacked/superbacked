import { resolve } from "path"

import { Configuration, DefinePlugin } from "webpack"

import { createPlugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

const config: Configuration = {
  entry: "./src/index.ts",
  mode: "development",
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
    ...createPlugins("development"),
    new DefinePlugin({
      MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: JSON.stringify(
        resolve(__dirname, ".webpack/main/preload.js")
      ),
      MAIN_WINDOW_WEBPACK_ENTRY: JSON.stringify(
        "http://localhost:3000/main_window/"
      ),
      BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY: JSON.stringify(
        resolve(__dirname, ".webpack/block/preload.js")
      ),
      BLOCK_WINDOW_WEBPACK_ENTRY: JSON.stringify(
        "http://localhost:3000/block_window/"
      ),
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
