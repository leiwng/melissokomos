class Cellar {
  constructor(tasks) {
    this.tasks = tasks.filter(task => task.TYPE === 'Parser')
    this.brewers = []
  }

  start() {
    this.tasks.forEach(task => {

      const { fork } = require('node:child_process');
      const controller = new AbortController();
      const { signal } = controller;
      const brewer = fork('./brew.js', [task.INPUT.URL, task.INPUT.CHANNEL, task.OUTPUT.URL, task.OUTPUT.CHANNEL], { signal });
      brewer.on('message', (msg) => {
        if (msg === 'exit') {
          console.log('Brewer exit')
          controller.abort()
        }
      });

      this.brewers.push(brewer)
    })
  }

  stop() {
    this.brewers.forEach(brewer => brewer.send('exit'))
  }

  getBrewers() {
    return this.brewers
  }

}