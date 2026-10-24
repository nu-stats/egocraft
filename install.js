module.exports = {
  run: [
    // EgoCraft's app code is in this repository (app/), so nothing is
    // cloned: install its packages, then build the interface.
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "npm ci --no-audit --no-fund",
          "npm run build"
        ]
      }
    },
    {
      method: "notify",
      params: {
        html: "Click the 'Start' tab to get started!"
      }
    }
  ]
}
