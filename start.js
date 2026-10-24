module.exports = {
  // By setting daemon: true, the script keeps running even after all items in the `run` array finishes running. Mandatory for launching servers.
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        // A small Node server for the built app, on 127.0.0.1 only. Studies
        // are kept in the browser and in the .egocraft files you save.
        message: [
          "node server/serve.mjs --port {{port}}"
        ],
        on: [{
          // The server prints "[EgoCraft] Ready at http://127.0.0.1:<port>/".
          "event": "/(http:\\/\\/[0-9.:]+)/",
          "done": true
        }]
      }
    },
    {
      // This step sets the local variable 'url', used in pinokio.js to show "Open EgoCraft".
      method: "local.set",
      params: {
        url: "{{input.event[1]}}"
      }
    }
  ]
}
