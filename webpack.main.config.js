const rules = require("./webpack.rules")
const plugins = require("./webpack.plugins")

module.exports = {
  entry: "./src/index.ts",
  module: {
    rules: rules,
  },
  optimization: {
    minimize: false,
  },
  plugins: plugins,
  resolve: {
    extensions: [".css", ".js", ".json", ".jsx", ".ts", ".tsx"],
  },
}
