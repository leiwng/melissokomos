/*
 * Recipe for Mobile Bank 5.0 Application Log File
*/

const parseString = require("xml2js").parseString
const Recipe = require("../recipe")
const Recipe_map = require("../recipe_map")
const logger = require("../cellar_logger")(require("path").basename(__filename))

const MAP = new Recipe_map()

let STATES = {
  idle: 0,
  form1ReqInfo: 1,
  form1RspInfo: 2,
  form2ReqInfo: 3,
  form2RspInfo: 4,
  form3ReqInfo: 5,
  form3RspInfo: 6,
  form4ReqInfo: 7,
  form4RspInfo: 8,
  form5ReqInfo: 9,
  form5RspInfo: 10
}

const REG_FORM_1_REQ = /INFO {2}cn.com.yitong.ares.net.esb.EsbSocketClient:[0-9]{2,3} - (.){1,90}交易esb加密前请求数据:/
const REG_FORM_1_RSP = /INFO {2}cn.com.yitong.ares.net.esb.EsbSocketClient:[0-9]{2,3} - response data:/

// const REG_FORM_2_REQ = /INFO {2}cn.com.yitong.ares.net.bh.NetConnect4bhb:[0-9]{2,3} - 交易码：【[0-9]{2,3}\/[A-Z]{2,3}[0-9]{2,8}】百合服务--->金融平台:request:/
const FLAG_FORM_2_REQ = "百合服务--->金融平台:request:"
const REG_FORM_2_RSP = /INFO {2}cn.com.yitong.ares.channel.JsonHttpMessageConverter:[0-9]{2,3} - 返回报文为：/

const REG_FORM_3_REQ = /INFO {2}cn.com.yitong.ares.net.efel.NetConnect4efel:[0-9]{2,3} - inte request is:/
const REG_FORM_3_RSP = /INFO {2}cn.com.yitong.ares.net.efel.NetConnect4efel:[0-9]{2,3} - inte response is:/

const REG_FORM_4_REQ = /INFO {2}cn.com.yitong.ares.net.[a-z]{2,10}.SocketClient:[0-9]{2,3} - request data:/
const REG_FORM_4_RSP = /INFO {2}cn.com.yitong.ares.net.[a-z]{2,10}.SocketClient:[0-9]{2,3} - response data:/

const REG_FORM_5_REQ = /，登录信息====客户姓名：/
//匹配行首时间
const REG_DATE = /^\[[0-9]{4}-[0-9]{2}-[0-9]{2}\s/

let STATE = STATES.idle
let MSG_BUF = ""
let MSG_INFO = {}

const _reset = () => {
  MSG_BUF = ""
  STATE = STATES.idle
  MSG_INFO = {}
}

const parse_ts = (ts_in_str) => {
  // date format example: [2018-03-21 16:32:19,946]
  const ts_str = ts_in_str.replace(/,/, ".")
  return new Date(ts_str)
}

const isNumeric = n => !!Number(n);

const convert_to_number = (obj) => {
  if (isNumeric(obj)) {
    return Number(obj)
  } else {
    return obj
  }
}

const flat_obj = (obj, prefix = "") => {
  const result = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Long Name: keep all keys from root to leaf, and separated by dot
      const newKey = prefix ? prefix + "." + key : key
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
    if (key.indexOf(".") > 0) {
      let keys = key.split(".")
      let new_key = ""
      for (let i = keys.length - 1; i >= 0; i--) {
        new_key = keys[i]
        new_key = new_key.replace(/:/g, "_")
        if (new_key !== "0") {
          while (key_names.includes(new_key)) {
            // deal with duplicated new_key, the effect wanted is:
            // if "project" used rename to "project1";
            // if "project1" used rename to "project2", etc.
            let numbers = new_key.match(/\d+/g)
            // the numbers will have all numbers in key, like ["12", "345", "1"]
            if (numbers) {
              let num = numbers[numbers.length - 1]
              let first_part = new_key.replace(num, "")
              new_key = first_part + (Number(num) + 1)
            } else {
              new_key = new_key + "1"
            }
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

const _merge_msg_pack_in_map = (msg_info) => {
  let mapped_msg_info = MAP.get_data(msg_info.seqNum_add)
  if (mapped_msg_info) {
    msg_info = Object.assign(mapped_msg_info, msg_info)
    MAP.add(msg_info.seqNum_add, msg_info)
  } else {
    MAP.add(msg_info.seqNum_add, msg_info)
  }
  return msg_info
}

const _store_xml_msg = (xml_msg_buf) => {
  try {
    parseString(xml_msg_buf, (err, result) => {
      if (err) {
        logger.error({xml_msg_buf: xml_msg_buf, err: err}, "xml2js parseString Error:")
        return false
      } else {
        // MSG_INFO is a global variable there already some info stored in it.
        // First merge with current info stored in MSG_INFO
        let tmp_json = flat_obj_with_simple_key(result)
        MSG_INFO = Object.assign(MSG_INFO, tmp_json)
        // Then merge with info stored in MAP
        MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
        return true
      }
    })
  } catch (e) {
    logger.error({xml_msg_buf: xml_msg_buf, err: e}, "xml2js parseString Exception:")
    return false
  }
}

const _store_json_msg = (json_msg_buf) => {
  try {
    let tmp_json = flat_obj_with_simple_key(JSON.parse(json_msg_buf))
    // MSG_INFO is a global variable there already some info stored in it.
    // First merge with current info stored in MSG_INFO
    MSG_INFO = Object.assign(MSG_INFO, tmp_json)
    // Then merge with info stored in MAP
    MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
    return true
  } catch (e) {
    logger.error({json_msg_bug: json_msg_buf, err: e}, "JSON.parse Exception:")
    return false
  }
}

const _calc_duration = () => {
  try {
    if (("startTime" in MSG_INFO) && ("endTime" in MSG_INFO)) {
      MSG_INFO.duration = MSG_INFO.endTime.getTime() - MSG_INFO.startTime.getTime()
      return true
    } else {
      logger.error({MSG_INFO: MSG_INFO},"startTime or endTime not in MSG_INFO cannot calculate duration")
      return false
    }
  } catch (e) {
    logger.error({MSG_INFO: MSG_INFO, err: e},"calc duration Exception:")
    return false
  }
}

const _parse_login_info = (str) => {
  let strArr = str.split(" INFO  ")
  MSG_INFO.startTime = parse_ts(strArr[0].substring(1, strArr[0].indexOf("]")))
  MSG_INFO.loginType_add = strArr[0].split(" ").pop()

  let body = strArr[1]
  let bodyArr = body.split("：")

  MSG_INFO.custName_add = bodyArr[1].slice(0, -3)
  MSG_INFO.phoneNo_add = bodyArr[2].slice(0, -5)
  MSG_INFO.custNum_add = bodyArr[3].slice(0, -3)

  let bodyArr4Arr = bodyArr[4].split(/\([经|纬]度\):/g)
  MSG_INFO.clientVer_add = bodyArr4Arr[0]
  MSG_INFO.longitudeVal_add = bodyArr4Arr[1]//经度
  MSG_INFO.latitudeVal_add = bodyArr4Arr[2]//纬度
  MSG_INFO.infoType_add = "login"
}

const _msg_handler = (recipe, msg) => {

  if (msg.trim() === "") {
    return
  }

  switch (STATE) {
  case STATES.idle:
    if (REG_FORM_1_REQ.test(msg)) {
      MSG_INFO.startTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO.custNum_add = msg_segments[3]
      MSG_INFO.tranCode_add = msg_segments[4]
      MSG_INFO.bizDesc = msg_segments[5]
      MSG_INFO.infoType_add = "M"
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      STATE = STATES.form1ReqInfo
    } else if (REG_FORM_1_RSP.test(msg)) {
      MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      STATE = STATES.form1RspInfo
    } else if (msg.indexOf(FLAG_FORM_2_REQ) !== -1) {
      MSG_INFO.startTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO.custNum_add = msg_segments[3]
      MSG_INFO.tranCode_add = msg_segments[4]
      MSG_INFO.bizDesc = msg_segments[5]
      MSG_INFO.infoType_add = "M"
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = "<LZYH>"
      STATE = STATES.form2ReqInfo
    } else if (REG_FORM_2_RSP.test(msg)) {
      // REG_FORM_2_RSP msg: the msg head and body in one line and msg body is in JSON format.
      MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      if (MAP.lookup(MSG_INFO.seqNum_add)) {
        MSG_BUF = msg.substring(msg.indexOf("{"), msg.lastIndexOf("}") + 1)
        if (!_store_json_msg(MSG_BUF)) {
          // Parse JSON String to JSON Object failed, reset all.
          _reset()
          break
        }
        if (!_calc_duration()) {
          // cannot calculate duration, message broken, reset all.
          logger.error({}, "REG_FORM_2_RSP message: cannot calculate duration, message broken, reset all.")
          _reset()
          break
        }
        //The field length is too long, delete.
        delete MSG_INFO.EqmtMg
        //The field length is too long, delete.
        delete MSG_INFO.trusfortDevice
        logger.debug({ MSG_INFO: MSG_INFO }, "sendResult DATA.")
        recipe.sendResult(JSON.stringify(MSG_INFO))
        MAP.delete(MSG_INFO.seqNum_add)
        _reset()
        // logger.debug({MSG_INFO: MSG_INFO}, "Good Case for FORM_2_RSP message:")
      } else {
        // FORM_2_RSP message responses to many cases REQ message.
        // The FORM_2_REQ message is just one kind REQ message which response by FORM_2_RSP message,
        // So, in this else case, there will be so many FORM_2_RSP messages, but not REQ message.
        // So, for this case here, we just ignore it. OK, Dude!
        // logger.error({msg: msg, MSG_INFO: MSG_INFO}, "FORM_2_RSP MSG: No stored REQ msg info before, only receive response msg.")
        _reset()
      }
      STATE = STATES.idle
    }else if (REG_FORM_3_REQ.test(msg)) {
      MSG_INFO.startTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO.custNum_add = msg_segments[3]
      MSG_INFO.tranCode_add = msg_segments[4]
      MSG_INFO.bizDesc = msg_segments[5]
      MSG_INFO.infoType_add = "M"
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = ""
      STATE = STATES.form3ReqInfo
    } else if (REG_FORM_3_RSP.test(msg)) {
      MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = ""
      STATE = STATES.form3RspInfo
    } else if (REG_FORM_4_REQ.test(msg)) {
      MSG_INFO.startTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO.custNum_add = msg_segments[3]
      MSG_INFO.tranCode_add = msg_segments[4]
      MSG_INFO.bizDesc = msg_segments[5]
      MSG_INFO.infoType_add = "M"
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      STATE = STATES.form4ReqInfo
    } else if (REG_FORM_4_RSP.test(msg)) {
      MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
      let msg_segments = msg.split(" ")
      MSG_INFO.seqNum_add = msg_segments[2]
      MSG_INFO = _merge_msg_pack_in_map(MSG_INFO)
      MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      STATE = STATES.form4RspInfo
    } else if (REG_FORM_5_REQ.test(msg)) {
      _parse_login_info(msg)
      logger.debug({pack_data: MSG_INFO},"sendResult DATA.")
      recipe.sendResult(JSON.stringify(MSG_INFO))
      _reset()
    }
    break

  case STATES.form1ReqInfo:
    if (REG_DATE.test(msg)) {
      // get new Date-Time started line, mean new Pack of Message coming.
      if (MSG_BUF) {
        // store REQ package into MAP
        _store_xml_msg(MSG_BUF)
        _reset()
        // rehandle the new message again, or this message will be lost.
        _msg_handler(recipe, msg)
        break
      }
    } else {
      MSG_BUF += msg
      if (msg.indexOf("</service>") != -1) {
        _store_xml_msg(MSG_BUF)
        _reset()
      }
    }
    break

  case STATES.form1RspInfo:
    if (REG_DATE.test(msg)) {
      if (MSG_BUF) {
        _store_xml_msg(MSG_BUF)
        let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
        if (mapped_msg_info) {
          MSG_INFO = Object.assign(mapped_msg_info, MSG_INFO)
          if (!_calc_duration()) {
            logger.error({}, "STATES.form1RspInfo if REG_DATE: cannot calculate duration, message broken, reset all.")
            _reset()
            break
          }
          delete MSG_INFO.EqmtMg//The field length is too long
          logger.debug({MSG_INFO: MSG_INFO},"sendResult DATA.")
          recipe.sendResult(JSON.stringify(MSG_INFO))
          MAP.delete(MSG_INFO.seqNum_add)
        }
      }
      _reset()
      // re-enter _msg_handler to make current msg got handled and processed.
      _msg_handler(recipe, msg)
      break
    } else {
      MSG_BUF += msg
      if (msg.indexOf("</service>") != -1) {
        _store_xml_msg(MSG_BUF)
        let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
        if (mapped_msg_info) {
          MSG_INFO = Object.assign(mapped_msg_info, MSG_INFO)
          if (!_calc_duration()) {
            logger.error({}, "STATES.form1RspInfo: cannot calculate duration, message broken, reset all.")
            _reset()
            break
          }
          delete MSG_INFO.EqmtMg//The field length is too long
          logger.debug({MSG_INFO: MSG_INFO},"sendResult DATA.")
          recipe.sendResult(JSON.stringify(MSG_INFO))
          MAP.delete(MSG_INFO.seqNum_add)
        } // RSP message there should be a REQ msg info pack in MAP, if not, just ignore it.
        _reset()
      }
    }
    break

  case STATES.form2ReqInfo:
    if (REG_DATE.test(msg)) {
      if (MSG_BUF) {
        _store_xml_msg(MSG_BUF)
      }
      _reset()
      _msg_handler(recipe, msg)
      break
    } else {
      MSG_BUF += msg
      if (msg.indexOf("</LZYH>") !== -1) {
        _store_xml_msg(MSG_BUF)
        _reset()
      }
      // no else case, keep in current state and continue receive new msg line.
    }
    break

  case STATES.form3ReqInfo:
    if (REG_DATE.test(msg)) {
      // The message form3ReqInfo body is the next line of message head line.
      // IF get new Date-Time line means another new message pack coming,
      // So, this current form3ReqInfo message is broken, which have no body.
      // Then, _reset state and message buffer to handle new message pack.
      _reset()
      _msg_handler(recipe, msg)
      break
    } else {
      MSG_BUF = msg
      if (Object.keys(MSG_INFO).length !== 0) {
        // no need to query MAP for saved msg header info,
        // header info is only saved in MSG_INFO for performance consideration.
        if (!_store_json_msg(MSG_BUF)) {
          _reset()
          break
        }
        _reset()
      } else {
        logger.error({msg: msg, MSG_INFO: MSG_INFO}, "form3ReqInfo msg broken, no msg head, only receive msg body.")
        _reset()
      }
    }
    break

  case STATES.form3RspInfo:
    if (REG_DATE.test(msg)) {
      // same as form2ReqInfo message pack
      _reset()
      _msg_handler(recipe, msg)
      break
    } else {
      MSG_BUF = msg
      if (Object.keys(MSG_INFO).length !== 0) {
        if (MAP.lookup(MSG_INFO.seqNum_add)) {
          if (!_store_json_msg(MSG_BUF)) {
            _reset()
            break
          }
          if (!_calc_duration()) {
            logger.error({}, "STATES.form3RspInfo: cannot calculate duration, message broken, reset all.")
            _reset()
            break
          }
          delete MSG_INFO.sign//The field length is too long
          logger.debug({ MSG_INFO: MSG_INFO }, "sendResult DATA.")
          recipe.sendResult(JSON.stringify(MSG_INFO))
          MAP.delete(MSG_INFO.seqNum_add)
          _reset()
        } else {
          logger.error({msg: msg, MSG_INFO: MSG_INFO}, "form3RspInfo msg broken, no REQ msg, only receive response msg.")
          _reset()
        }
      } else {
        logger.error({msg: msg, MSG_INFO: MSG_INFO}, "form3RspInfo msg broken, no msg head, only receive msg body.")
        _reset()
      }
    }
    break

  case STATES.form4ReqInfo:
    if (!REG_DATE.test(msg)) {
      MSG_BUF += msg
    } else {
      _store_xml_msg(MSG_BUF)
      _reset()
      _msg_handler(recipe, msg)
    }
    break

  case STATES.form4RspInfo:
    if (!REG_DATE.test(msg)) {
      MSG_BUF += msg
    } else {
      _store_xml_msg(MSG_BUF)
      let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
      if (mapped_msg_info) {
        MSG_INFO = Object.assign(mapped_msg_info, MSG_INFO)
        if (!_calc_duration()) {
          logger.error({}, "STATES.form3RspInfo: cannot calculate duration, message broken, reset all.")
          _reset()
          break
        }
        delete MSG_INFO.AuthParam//The field length is too long
        logger.debug({MSG_INFO: MSG_INFO},"sendResult DATA.")
        recipe.sendResult(JSON.stringify(MSG_INFO))
        MAP.delete(MSG_INFO.seqNum_add)
      }
      _reset()
    }
    break

  default:
    _reset()
    break
  }
}

const mbank5_recipe = new Recipe(_msg_handler)
mbank5_recipe.start()
logger.info({ "recipe": "mbank5_recipe" },"mbank5_recipe started.")