const Dotenv = require("dotenv-webpack")
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin")
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin")

module.exports = [
  new Dotenv({ path: `./.env.${process.env.ENV}` }),
  new ForkTsCheckerWebpackPlugin(),
  new ReactRefreshWebpackPlugin(),
]
