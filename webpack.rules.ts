import { RuleSetRule } from "webpack"

export const rules: RuleSetRule[] = [
  {
    test: /\.svg$/,
    issuer: /\.[jt]sx?$/,
    use: {
      loader: "@svgr/webpack",
      options: {
        typescript: true,
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(\.webpack|node_modules)/,
    use: [
      {
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
      },
      "./webpack-conditional-loader.js",
    ],
  },
  {
    test: /\.wav$/,
    issuer: /\.[jt]sx?$/,
    use: {
      loader: "file-loader",
    },
  },
]
