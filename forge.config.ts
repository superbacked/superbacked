import { ForgeConfig } from "@electron-forge/shared-types"

import { mainConfig } from "./webpack.main.config"
import { rendererConfig } from "./webpack.renderer.config"

const config: ForgeConfig = {
  makers: [
    {
      config: {},
      name: "@electron-forge/maker-zip",
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        devServer: { hot: true, liveReload: false },
        mainConfig: mainConfig,
        renderer: {
          config: rendererConfig,
          entryPoints: [
            {
              html: "./src/index.html",
              preload: {
                js: "./src/main/preload.ts",
              },
              js: "./src/main/renderer.tsx",
              name: "main_window",
            },
            {
              html: "./src/index.html",
              preload: {
                js: "./src/block/preload.ts",
              },
              js: "./src/block/renderer.tsx",
              name: "block_window",
            },
          ],
        },
      },
    },
  ],
}

export default config
