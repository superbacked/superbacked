const rules = require("./webpack.rules")
const plugins = require("./webpack.plugins")

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
})

module.exports = {
  module: {
    rules,
  },
  optimization: {
    minimize: false,
  },
  plugins: plugins,
  resolve: {
    extensions: [".css", ".jsx", ".ts", ".tsx", ".js"],
  },
}
