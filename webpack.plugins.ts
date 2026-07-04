import { config } from "dotenv"
import Dotenv from "dotenv-webpack"

export const createPlugins = (env: "development" | "production") => {
  const path = `./.env.${env}`
  // Provide environment variables to webpack consumers
  config({ path, quiet: true })
  // Bundle environment variables
  return [new Dotenv({ path })]
}
