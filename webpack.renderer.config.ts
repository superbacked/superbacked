import { resolve } from "path"

import { Configuration } from "webpack"

import { plugins } from "./webpack.plugins"
import { rules } from "./webpack.rules"

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
})

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  optimization: {
    minimize: false,
  },
  plugins: plugins,
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
    extensions: [".css", ".js", ".jsx", ".ts", ".tsx"],
  },
}
