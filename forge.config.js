module.exports = {
  makers: [
    {
      name: "@electron-forge/maker-zip",
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        devServer: { hot: true, liveReload: false },
        mainConfig: "./webpack.main.config.js",
        renderer: {
          config: "./webpack.renderer.config.js",
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
