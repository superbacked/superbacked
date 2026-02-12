#!/usr/bin/env node

/* eslint-disable no-console */

import { ChildProcess, spawn } from "child_process"
import electron from "electron"
import { resolve } from "path"

import webpack, { MultiStats } from "webpack"
import WebpackDevServer from "webpack-dev-server"

import mainConfig from "@/webpack.main.development.config"
import preloadConfig from "@/webpack.preload.development.config"
import rendererConfig from "@/webpack.renderer.development.config"

const ELECTRON_PATH = String(electron)

let electronProcess: ChildProcess | null = null
let isElectronStarted = false
let manualRestart = false

function cleanup() {
  electronProcess?.kill()
  electronProcess = null
}

function startElectron() {
  if (electronProcess) {
    manualRestart = true
    electronProcess.kill()
    return
  }

  electronProcess = spawn(
    ELECTRON_PATH,
    [resolve(__dirname, "..", ".webpack", "main")],
    {
      env: { ...process.env, ENV: "development" },
      stdio: "inherit",
    }
  )

  electronProcess.on("close", (code) => {
    electronProcess = null

    if (manualRestart) {
      manualRestart = false
      startElectron()
      return
    }

    if (code !== null && code !== 0) {
      console.error(`Electron exited with code ${code}`)
    }
    process.exit(code ?? 0)
  })
}

function setupStdinListener() {
  if (!process.stdin.isTTY) return

  process.stdin.setEncoding("utf8")
  process.stdin.setRawMode(true)

  let input = ""
  process.stdin.on("data", (key: string) => {
    const keyCode = key.charCodeAt(0)

    // Handle Ctrl+C (ASCII 3)
    if (keyCode === 3) {
      cleanup()
      process.exit(0)
    }

    // Handle Enter (ASCII 10 or 13)
    if (keyCode === 10 || keyCode === 13) {
      if (input === "rs" && isElectronStarted) {
        console.log("\nManually restarting Electron…")
        startElectron()
      }
      input = ""
      return
    }

    // Handle backspace (ASCII 8 or 127)
    if (keyCode === 8 || keyCode === 127) {
      if (input.length > 0) {
        input = input.slice(0, -1)
        process.stdout.write("\b \b")
      }
      return
    }

    // Accept printable characters (ASCII 32-126)
    if (keyCode >= 32 && keyCode <= 126) {
      input += key
      process.stdout.write(key)
    }
  })

  console.log('\n💡 Type "rs" and press enter to manually restart Electron\n')
}

function handleCompilationComplete(error: Error | null, stats?: MultiStats) {
  if (error) {
    console.error(error)
    return
  }

  if (stats?.hasErrors()) {
    console.error(stats.toString({ colors: true }))
    return
  }

  if (stats) {
    console.log(stats.toString({ colors: true, chunks: false }))
  }

  if (!isElectronStarted) {
    isElectronStarted = true
    console.log("Starting Electron…")
    startElectron()
  } else {
    console.log("Restarting Electron…")
    startElectron()
  }
}

async function start() {
  console.log("Building main process and preload scripts…")

  const mainCompiler = webpack([mainConfig, preloadConfig])

  let compileCount = 0
  mainCompiler.hooks.watchRun.tap("dev-runner", () => {
    compileCount++
    if (compileCount === 1) {
      console.log("Compiling main and preload processes…")
    }
  })

  console.log("Starting webpack-dev-server for renderer process…")

  const rendererCompiler = webpack(rendererConfig)
  const devServerOptions = rendererConfig.devServer

  if (!devServerOptions) {
    throw new Error("devServer configuration is missing")
  }

  const server = new WebpackDevServer(devServerOptions, rendererCompiler)

  await server.start()

  console.log(
    `Webpack dev server running on http://localhost:${devServerOptions.port}`
  )

  setupStdinListener()

  mainCompiler.watch({}, handleCompilationComplete)
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})

const exitHandler = () => {
  cleanup()
  process.exit(0)
}

process.on("SIGINT", exitHandler)
process.on("SIGTERM", exitHandler)
