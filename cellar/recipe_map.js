/*
 * Use Map for storing recipe intermediate data
*/

class Recipe_map {
    constructor() {
        this.map = new Map()
        this.scanTime = 10*60*1000 //10 minutes
        this.timeout = 30*60*1000 //20 minutes
        this.add = this.add.bind(this)
        this.get = this.get.bind(this)
        this.delete = this.delete.bind(this)
        setInterval(() => this.scan(),this.scanTime)
    }

    add(key, msg) {
        let new_msg = {
            t: +new Date(),
            data: msg
        }
        this.map.set(key, new_msg)
    }

    lookup(key) {
        return this.map.has(key)
    }

    get(key) {
        return this.map.get(key)
    }

    get_data(key) {
        if (this.lookup(key)) {
            return this.map.get(key).data
        } else {
            return null
        }
    }

    delete(key) {
        this.map.delete(key)
    }

    scan() {
        let now = +new Date()
        let keys_to_delete = []
        for (let key of this.map.keys()) {
            if ((now - this.get(key).t) > this.timeout) {
                keys_to_delete.push(key)
            }
        }
        for (let key of keys_to_delete) {
            this.delete(key)
        }
    }
}

module.exports = Recipe_map
