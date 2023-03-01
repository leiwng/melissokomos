const flat_json = (obj, final) => {
  for (let key in obj) {
  if (typeof obj[key] === "object") {
    flat_json(obj[key], final)
  } else {
    final[key] = obj[key]
  }
  }
}


const flat_json2 = (obj, final) => {
  for (let key in obj) {
  if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
    flat_json(obj[key], final)
  } else if (typeof obj[key] === "object" && Array.isArray(obj[key])) {
    obj[key].forEach((item, index) => {
    if (typeof item === "object") {
      flat_json(item, final)
    } else {
      final[key + "_" + index] = item
    }
    })
  } else {
    final[key] = obj[key]
  }
  }
}

function visitObject(obj, visitor) {
  if (Array.isArray(obj)) {
  for (let i = 0; i < obj.length; i++) {
    visitObject(obj[i], visitor)
  }
  } else if (typeof obj === "object" && obj !== null) {
  visitor(obj)
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
    visitObject(obj[key], visitor)
    }
  }
  }
}
// Example usage:
// const myObject = {
//   foo: {
//   bar: 1,
//   baz: [2, 3, { qux: 4 }]
//   }
// }
// visitObject(myObject, (obj) => {
//   console.log(obj)
// })

function flattenObject(obj, prefix = "") {
  const result = {}
  for (const key in obj) {
  if (obj.hasOwnProperty(key)) {
    const newKey = prefix ? prefix + "." + key : key
    if (typeof obj[key] === "object" && obj[key] !== null) {
    Object.assign(result, flattenObject(obj[key], newKey))
    } else {
    result[newKey] = obj[key]
    }
  }
  }
  return result
}

const isNumeric = n => !!Number(n);

const convert_to_number = (obj) => {
  if (isNumeric(obj)) {
  return Number(obj)
  } else {
  return obj
  }
}

const KEY_SEP = "."
const flat_obj = (obj, prefix = "") => {
  const result = {}
  for (const key in obj) {
  if (obj.hasOwnProperty(key)) {
    // Long Name: keep all keys from root to leaf, and separated by dot
    const newKey = prefix ? prefix + KEY_SEP + key : key
    if (typeof obj[key] === "object" && obj[key] !== null) {
    Object.assign(result, flat_obj(obj[key], newKey))
    } else {
    result[newKey] = obj[key]
    }
  }
  }
  return result
}

const shorten_key = (obj) => {
  let key_names = []
  Object.keys(obj).forEach((key) => {
  if (key.indexOf(KEY_SEP) > 0) {
    let keys = key.split(".")
    let new_key = ""
    for (let i = keys.length - 1; i >= 0; i--) {
    new_key = keys[i]
    new_key = new_key.replace(/:/g, "_")
    if (new_key !== "0") {
      while (key_names.includes(new_key)) {
      new_key = new_key + "1"
      }
      key_names.push(new_key)
      break
    }
    }
    obj[new_key] = convert_to_number(obj[key])
    delete obj[key]
  } else {
    let new_key = key.replace(/:/g, "_")
    obj[new_key] = convert_to_number(obj[key])
    delete obj[key]
  }
  })
  return obj
}

const flat_obj_with_simple_key = (obj) => {
  let tmp_obj = flat_obj(obj)
  let final_obj = shorten_key(tmp_obj)
  return final_obj
}

const fs = require("fs")
let xml_str = fs.readFileSync("./errored_xml_string.xml").toString()

const parseString = require("xml2js").parseString

let json_obj = {}

parseString(xml_str, (err, result) => {
  if (err) {
  console.log(err)
  } else {
  json_obj = flat_obj_with_simple_key(result)
  console.log(json_obj)
  }
})
