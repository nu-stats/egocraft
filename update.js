module.exports = {
  run: [{
    method: "shell.run",
    params: {
      message: "git pull"
    }
  }, {
    // The app lives in this repository, so after pulling, refresh its
    // packages and rebuild it.
    method: "shell.run",
    params: {
      path: "app",
      message: [
        "npm ci --no-audit --no-fund",
        "npm run build"
      ]
    }
  }]
}
