class Test_this {

  constructor(task) {
    console.log('in constructor: ' + this)
    this.init()
  }

  init() {
    console.log('in init: ' + this)
    this.a = 'a'
    this.b = 'b'
  }

  start() {
    this.func1()
    this.func2()
  }

  func1() {
    console.log('in func1: ' + this.a)
  }

  func2() {
    console.log('in func2: ' + this.b)
  }

}

a = new Test_this()
a.start()