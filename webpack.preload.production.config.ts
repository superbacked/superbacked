import { resolve } from "path"

import { Configuration } from "webpack"

import { createPlugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

const config: Configuration = {
  entry: {
    main: "./src/main/preload.ts",
    block: "./src/block/preload.ts",
  },
  mode: "production",
  module: {
    rules: rules,
  },
  optimization: {
    minimize: false,
  },
  output: {
    filename: "[name]/preload.js",
    path: resolve(__dirname, ".webpack"),
  },
  plugins: createPlugins("production"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
    extensions: [".css", ".js", ".json", ".jsx", ".ts", ".tsx"],
  },
  target: "electron-preload",
}

export default config
