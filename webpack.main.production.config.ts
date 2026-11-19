import { resolve } from "path"

import { Configuration, DefinePlugin } from "webpack"

import { rendererOrigin } from "./src/utilities/rendererProtocol"
import { createPlugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

const config: Configuration = {
  entry: "./src/index.ts",
  // node-hid is a native module — it loads its prebuilt binary relative to
  // its own location in node_modules and cannot be bundled
  externals: {
    "node-hid": "commonjs node-hid",
  },
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
      // path.join normalizes the “..” — Electron cannot resolve unnormalized
      // paths inside app.asar (the block preload used to fail with ENOENT)
      MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: `require("path").join(__dirname, "preload.js")`,
      BLOCK_WINDOW_PRELOAD_WEBPACK_ENTRY: `require("path").join(__dirname, "../block/preload.js")`,
      // The windows load from the renderer origin the main process serves
      // out of .webpack/renderer (see src/index.ts), never from file://
      MAIN_WINDOW_WEBPACK_ENTRY: JSON.stringify(
        `${rendererOrigin}/main_window/index.html`
      ),
      BLOCK_WINDOW_WEBPACK_ENTRY: JSON.stringify(
        `${rendererOrigin}/block_window/index.html`
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
