import Dotenv from "dotenv-webpack"

export const createPlugins = (env: "development" | "production") => [
  new Dotenv({ path: `./.env.${env}` }),
]
