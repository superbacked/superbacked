import ReactRefreshWebpackPlugin from "@pmmmwh/react-refresh-webpack-plugin"
import Dotenv from "dotenv-webpack"
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin"
import { HotModuleReplacementPlugin } from "webpack"

export const plugins = [
  new Dotenv({ path: `./.env.${process.env.ENV}` }),
  new ForkTsCheckerWebpackPlugin({
    logger: "webpack-infrastructure",
  }),
  ...(process.env.ENV === "development"
    ? [new HotModuleReplacementPlugin(), new ReactRefreshWebpackPlugin()]
    : []),
]
