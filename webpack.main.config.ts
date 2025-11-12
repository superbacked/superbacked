import { resolve } from "path"

import { Configuration } from "webpack"

import { plugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

export const mainConfig: Configuration = {
  entry: "./src/index.ts",
  module: {
    rules: rules,
  },
  optimization: {
    minimize: false,
  },
  plugins: plugins,
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
    extensions: [".css", ".js", ".json", ".jsx", ".ts", ".tsx"],
  },
}
