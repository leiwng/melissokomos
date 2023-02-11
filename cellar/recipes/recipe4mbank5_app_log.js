/*
 * Recipe for Mobile Bank 5.0 Application Log File
*/

const parseString = require("xml2js").parseString
const Recipe = require("../recipe")
const Recipe_map = require("../recipe_map")

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
const REG_FORM_2_REQ = /INFO {2}cn.com.yitong.ares.net.bh.NetConnect4bhb:[0-9]{2,3} - 交易码：【[0-9]{2,3}\/[A-Z]{2,3}[0-9]{2,8}】百合服务--->金融平台:request:/
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

const reset = () => {
    MSG_BUF = ""
    STATE = STATES.idle
    MSG_INFO = {}
}

const parse_ts = (ts_in_str) => {
    const ts_str = ts_in_str.replace(/,/, ".")
    return new Date(ts_str)
}

const flat_json = (obj, final) => {
    for (let key in obj) {
        if (typeof obj[key] === "object") {
            flat_json(obj[key], final)
        } else {
            final[key] = obj[key]
        }
    }
}

const store_xml_msg = (xml_msg) => {
    try {
        parseString(xml_msg, (err, result) => {
            if (err) {
                console.log("xml2js parseString Err: ", err)
                reset()
            } else {
                // MSG_INFO is a global variable there already some info stored in it.
                flat_json(result, MSG_INFO)
                let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
                if (mapped_msg_info) {
                    let full_pack = Object.assign(mapped_msg_info, MSG_INFO)
                    MAP.delete(MSG_INFO.seqNum_add)
                    MAP.add(full_pack.seqNum_add, full_pack)
                } else {
                    MAP.add(MSG_INFO.seqNum_add, MSG_INFO)
                }
            }
        })
    } catch (e) {
        console.log("Caught xml2js parseString Exception: ", e)
        reset()
    }
}

const parse_login_info = (str) => {
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

const msg_handler = (recipe, msg) => {

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
            MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            STATE = STATES.form1ReqInfo
        } else if (REG_FORM_1_RSP.test(msg)) {
            MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
            let msg_segments = msg.split(" ")
            MSG_INFO.seqNum_add = msg_segments[2]
            MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            STATE = STATES.form1RspInfo
        } else if (REG_FORM_2_REQ.test(msg)) {
            MSG_INFO.startTime = parse_ts(msg.substring(1, 24))
            let msg_segments = msg.split(" ")
            MSG_INFO.seqNum_add = msg_segments[2]
            MSG_INFO.custNum_add = msg_segments[3]
            MSG_INFO.tranCode_add = msg_segments[4]
            MSG_INFO.bizDesc = msg_segments[5]
            MSG_INFO.infoType_add = "M"
            MSG_BUF = "<LZYH>"
            STATE = STATES.form2ReqInfo
        } else if (REG_FORM_2_RSP.test(msg)) {
            let msg_segments = msg.split(" ")
            MSG_INFO.seqNum_add = msg_segments[2]
            let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
            if (mapped_msg_info) {
                MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
                MSG_BUF = msg.substring(msg.indexOf("{"), msg.lastIndexOf("}") + 1)
                flat_json(JSON.parse(MSG_BUF), MSG_INFO)
                let final_pack_data = Object.assign(mapped_msg_info, MSG_INFO)
                final_pack_data.duration = final_pack_data.endTime.getTime() - final_pack_data.startTime.getTime()
                //The field length is too long, delete.
                delete final_pack_data.EqmtMg
                //The field length is too long, delete.
                delete final_pack_data.trusfortDevice
                recipe.sendResult(JSON.stringify(final_pack_data))
                MAP.delete(MSG_INFO.seqNum_add)
                reset()
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
            MSG_BUF = ""
            STATE = STATES.form3ReqInfo
        } else if (REG_FORM_3_RSP.test(msg)) {
            MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
            let msg_segments = msg.split(" ")
            MSG_INFO.seqNum_add = msg_segments[2]
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
            MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            STATE = STATES.form4ReqInfo
        } else if (REG_FORM_4_RSP.test(msg)) {
            MSG_INFO.endTime = parse_ts(msg.substring(1, 24))
            let msg_segments = msg.split(" ")
            MSG_INFO.seqNum_add = msg_segments[2]
            MSG_BUF = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            STATE = STATES.form4RspInfo
        } else if (REG_FORM_5_REQ.test(msg)) {
            parse_login_info(msg)
            recipe.sendResult(JSON.stringify(MSG_INFO))
            reset()
        }
        break

    case STATES.form1ReqInfo:
        if (REG_DATE.test(msg)) {
            reset()
        }
        MSG_BUF += msg
        if (msg.indexOf("</service>") != -1) {
            store_xml_msg(MSG_BUF)
            reset()
        }
        break

    case STATES.form1RspInfo:
        if (REG_DATE.test(msg)) {
            reset()
        }
        MSG_BUF += msg
        if (msg.indexOf("</service>") != -1) {
            store_xml_msg(MSG_BUF)
            let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
            if (mapped_msg_info) {
                mapped_msg_info.duration = mapped_msg_info.endTime.getTime() - mapped_msg_info.startTime.getTime()
                delete mapped_msg_info.EqmtMg//The field length is too long
                recipe.sendResult(JSON.stringify(mapped_msg_info))
                MAP.delete(mapped_msg_info.seqNum_add)
            }
            reset()
        }
        break

    case STATES.form2ReqInfo:
        if (REG_DATE.test(msg)) {
            reset()
        }
        MSG_BUF += msg
        if (msg.indexOf("</LZYH>") != -1) {
            store_xml_msg(MSG_BUF)
            reset()
        }
        break

    case STATES.form2RspInfo:
        reset()
        break

    case STATES.form3ReqInfo:
        if (REG_DATE.test(msg)) {
            reset()
        }
        {
            MSG_BUF = msg
            let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
            if (mapped_msg_info) {
                console.log("recipe4mbank5_app_log.js messageHandler()::Form3 REQ_SEQ existing\n", MSG_INFO)
                //mobile_bank_map.add(msg_info.seqNum_add, msg_info);
                reset()
            } else {
                flat_json(JSON.parse(MSG_BUF), MSG_INFO)
                MAP.add(MSG_INFO.seqNum_add, MSG_INFO)
                reset()
            }
        }
        break

    case STATES.form3RspInfo:
        if (REG_DATE.test(msg)) {
            reset()
        }
        {
            MSG_BUF = msg
            let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
            if (mapped_msg_info) {
                flat_json(JSON.parse(MSG_BUF), MSG_INFO)
                let final_pack = Object.assign(mapped_msg_info, MSG_INFO)
                final_pack.duration = final_pack.endTime.getTime() - final_pack.startTime.getTime()
                delete final_pack.sign//The field length is too long
                recipe.sendResult(JSON.stringify(final_pack))
                MAP.delete(final_pack.seqNum_add)
                reset()
            }
        }
        break

    case STATES.form4ReqInfo:
        if (!REG_DATE.test(msg)) {
            MSG_BUF += msg
        } else {
            store_xml_msg(MSG_BUF)
            reset()
        }
        break

    case STATES.form4RspInfo:
        if (!REG_DATE.test(msg)) {
            MSG_BUF += msg
        } else {
            store_xml_msg(MSG_BUF)
            let mapped_msg_info = MAP.get_data(MSG_INFO.seqNum_add)
            if (mapped_msg_info) {
                let final_pack = Object.assign(mapped_msg_info, MSG_INFO)
                final_pack.duration = final_pack.endTime.getTime() - final_pack.startTime.getTime()
                delete final_pack.AuthParam//The field length is too long
                recipe.sendResult(JSON.stringify(final_pack))
                MAP.delete(final_pack.seqNum_add)
            }
            reset()
        }
        break

    case STATES.form5ReqInfo:
        reset()
        break

    default:
        reset()
        break
    }
}

const mbank5_recipe = new Recipe(msg_handler)
mbank5_recipe.start()