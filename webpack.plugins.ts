import { config } from "dotenv"
import Dotenv from "dotenv-webpack"

export const createPlugins = (env: "development" | "production") => {
  const path = `./.env.${env}`
  // Provide environment variables to webpack consumers
  config({ path, quiet: true })
  // dotenv never overrides variables already set in the shell — a stray ENV
  // would silently change which #if blocks ship, so fail the build instead.
  if (process.env.ENV !== env) {
    throw new Error(
      `ENV is set to "${process.env.ENV}" but bundling for "${env}"`
    )
  }
  // Bundle environment variables
  return [new Dotenv({ path })]
}
