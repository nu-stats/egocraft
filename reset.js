module.exports = {
  // Removes what install.js added (packages and the built app). The app's
  // source is kept, and so are your studies (in your browser and in the
  // .egocraft files you saved).
  run: [{
    method: "fs.rm",
    params: {
      path: "app/node_modules"
    }
  }, {
    method: "fs.rm",
    params: {
      path: "app/dist"
    }
  }]
}
