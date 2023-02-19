/*
---功能: 手机银行应用日志_1.0 (mbank.log,20181027）
---作者: 王磊
---说明: Delete 报文中的<EqmtMg>字段

---更New : (mbank.log,20190218）a.请求和响应匹配修改为使用流水号;b.修改匹配开始的方式和增加消息类型;
*/

"use strict"

var _stringify = require("babel-runtime/core-js/json/stringify")
var _stringify2 = _interopRequireDefault(_stringify)

var _typeof2 = require("babel-runtime/helpers/typeof")
var _typeof3 = _interopRequireDefault(_typeof2)

var _assign = require("babel-runtime/core-js/object/assign")
var _assign2 = _interopRequireDefault(_assign)

var _slicedToArray2 = require("babel-runtime/helpers/slicedToArray")
var _slicedToArray3 = _interopRequireDefault(_slicedToArray2)

var _Parser = require("../lib/Parser")
var _Parser2 = _interopRequireDefault(_Parser)

var _xml2js = require("xml2js")

var _mobile_bank_map = require("./ShouJiYinHang/ShouJiYinHang_mbank_map")
var _mobile_bank_map2 = _interopRequireDefault(_mobile_bank_map)

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj } }

var mobile_bank_map = void 0

//var states = { idle: 0, recReqInfo: 1, recRspInfo: 2 };
var states = {
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
var state = states.idle

var MsgRecBuf = ""
var MsgInfo = {}

var resetState = function resetState() {
    MsgRecBuf = ""
    state = states.idle
    MsgInfo = {}
}

// 请求 报文 开始行标识
var ReqHeader = "cn.com.yitong.ares.net.esb.EsbSocketClient:140"

// 响应 报文 开始行标识
var RspHeader = "cn.com.yitong.ares.net.esb.EsbSocketClient:166"

//定义匹配需采集消息的正则
var REG_FORM_1_REQ = /INFO {2}cn.com.yitong.ares.net.esb.EsbSocketClient:[0-9]{2,3} - (.){1,90}交易esb加密前请求数据:/
var REG_FORM_1_RSP = /INFO {2}cn.com.yitong.ares.net.esb.EsbSocketClient:[0-9]{2,3} - response data:/
var REG_FORM_2_REQ = /INFO {2}cn.com.yitong.ares.net.bh.NetConnect4bhb:[0-9]{2,3} - 交易码：【[0-9]{2,3}\/[A-Z]{2,3}[0-9]{2,8}】百合服务--->金融平台:request:/
var REG_FORM_2_RSP = /INFO {2}cn.com.yitong.ares.channel.JsonHttpMessageConverter:[0-9]{2,3} - 返回报文为：/
var REG_FORM_3_REQ = /INFO {2}cn.com.yitong.ares.net.efel.NetConnect4efel:[0-9]{2,3} - inte request is:/
var REG_FORM_3_RSP = /INFO {2}cn.com.yitong.ares.net.efel.NetConnect4efel:[0-9]{2,3} - inte response is:/
var REG_FORM_4_REQ = /INFO {2}cn.com.yitong.ares.net.[a-z]{2,10}.SocketClient:[0-9]{2,3} - request data:/
var REG_FORM_4_RSP = /INFO {2}cn.com.yitong.ares.net.[a-z]{2,10}.SocketClient:[0-9]{2,3} - response data:/
var REG_FORM_5_REQ = /, 登录信息====客户姓名：/
//var REG_FORM_5_RSP = //;
//var REG_FORM_6_REQ = //;
//var REG_FORM_6_RSP = //;
//var REG_FORM_7_REQ = //;
//var REG_FORM_7_RSP = //;

//定义正则
//匹配行首时间
var REG_DATE = /^\[[0-9]{4}-[0-9]{2}-[0-9]{2}\s/

//解析时间
var parseTs = function parseTs(tsString){
    var tsString2 = tsString.replace(/,/, ".")
    return new Date(tsString2)
}

var clearMsgInfoMap = function clearMsgInfoMap(rec_id) {
    if (mobile_bank_map.get(rec_id)) {
        mobile_bank_map.delete(rec_id)
    }
}

var parseXmlMsg = function parseXmlMsg(parser) {
    var msg = MsgRecBuf
    try {
    // 将XML格式字串转换为JSON对象, 返回值在xmlJson中, 错误信息在err中
        (0, _xml2js.parseString)(msg, { explicitArray: false }, function (err, xmlJson) {
            if (err == null) {
                flatJson(xmlJson, MsgInfo)
                var existPack = mobile_bank_map.get(MsgInfo.seqNum_add)
                if (existPack) {
                    var tmp_storedmsginfo = mobile_bank_map.get(MsgInfo.seqNum_add).data
                    var full_packmsginfo = (0, _assign2.default)({}, tmp_storedmsginfo, MsgInfo)
                    mobile_bank_map.delete(MsgInfo.seqNum_add)
                    mobile_bank_map.add(MsgInfo.seqNum_add, full_packmsginfo)
                } else {
                    mobile_bank_map.add(MsgInfo.seqNum_add, MsgInfo)
                }
                // resetState()
            } else {
                resetState()
            }
        })
    } catch (err) {
        console.log(err)
        parser.sendError(MsgInfo, "state.xml", err)
        resetState()
    }
}

var parseLoginInfo = function parseLoginInfo (str) {
    var strArr = str.split(" INFO  ")
    //console.log(strArr);
    MsgInfo.startTime = parseTs(strArr[0].substring(1, strArr[0].indexOf("]")))
    MsgInfo.loginType_add = strArr[0].split(" ").pop()

    var body = strArr[1]
    //console.log(body);
    var bodyArr = body.split("：")
    //console.log(bodyArr);
    MsgInfo.custName_add = bodyArr[1].slice(0, -3)
    MsgInfo.phoneNo_add = bodyArr[2].slice(0, -5)
    MsgInfo.custNum_add = bodyArr[3].slice(0, -3)
    var bodyArr4Arr = bodyArr[4].split(/\([经|纬]度\):/g)
    //MsgInfo.clientVer = bodyArr[4].slice(0, 5);
    //MsgInfo.longitudeVal = bodyArr[4].split('):')[1].slice(0, -3);//经度
    //MsgInfo.latitudeVal = bodyArr[4].split('):')[2];//纬度
    MsgInfo.clientVer_add = bodyArr4Arr[0]
    MsgInfo.longitudeVal_add = bodyArr4Arr[1]//经度
    MsgInfo.latitudeVal_add = bodyArr4Arr[2]//纬度
    MsgInfo.infoType_add = "login"
}

//扁平化嵌套的json, 如存在同名字段get 后出现的值
function flatJson(obj, final) {
    for (var key in obj) {
        if ((0, _typeof3.default)(obj[key]) == "object") {
            flatJson(obj[key], final)
        } else {
            final[key] = obj[key]
        }
    }
}

var messageHandler = function messageHandler(parser, channel, message) {
    // message = message.message
    switch (state) {
    case states.idle:
        //格式 1
        if (REG_FORM_1_REQ.test(message)) {
        //var stp1 = message.indexOf('[') + 1;
        //var edp1 = message.indexOf(']');
        //MsgInfo.startTime = parseTs(message.substring(stp1, edp1));
            MsgInfo.startTime = parseTs(message.substring(1, 24))
            var msg_split1 = message.split(" ")
            MsgInfo.seqNum_add = msg_split1[2]
            MsgInfo.custNum_add = msg_split1[3]
            MsgInfo.tranCode_add = msg_split1[4]
            MsgInfo.bizDesc = msg_split1[5]
            MsgInfo.infoType_add = "M"
            MsgRecBuf = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            state = states.form1ReqInfo
        } else if (REG_FORM_1_RSP.test(message)) {
        //var stp2 = message.indexOf('[') + 1;
        //var edp2 = message.indexOf(']');
        //MsgInfo.endTime = parseTs(message.substring(stp2, edp2));
            MsgInfo.endTime = parseTs(message.substring(1, 24))
            var msg_split2 = message.split(" ")
            MsgInfo.seqNum_add = msg_split2[2]
            MsgRecBuf = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            state = states.form1RspInfo
            //格式 2
        } else if (REG_FORM_2_REQ.test(message)) {
            MsgInfo.startTime = parseTs(message.substring(1, 24))
            var msg_split3 = message.split(" ")
            MsgInfo.seqNum_add = msg_split3[2]
            MsgInfo.custNum_add = msg_split3[3]
            MsgInfo.tranCode_add = msg_split3[4]
            MsgInfo.bizDesc = msg_split3[5]
            MsgInfo.infoType_add = "M"
            MsgRecBuf = "<LZYH>"
            state = states.form2ReqInfo
        } else if (REG_FORM_2_RSP.test(message)) {
            var msg_split4 = message.split(" ")
            MsgInfo.seqNum_add = msg_split4[2]
            var tempData1 = mobile_bank_map.get(MsgInfo.seqNum_add)
            if (tempData1 !== undefined) {
                MsgInfo.endTime = parseTs(message.substring(1, 24))
                //Debug
                //console.log(MsgInfo.endTime);
                MsgRecBuf = message.substring(message.indexOf("{"), message.lastIndexOf("}") + 1)
                var finalPackData2 = tempData1.data
                if (finalPackData2 != null) {
                    flatJson(JSON.parse(MsgRecBuf), MsgInfo)
                    finalPackData2 = (0, _assign2.default)(finalPackData2, MsgInfo)
                    finalPackData2.duration = finalPackData2.endTime.getTime() - finalPackData2.startTime.getTime()
                    delete finalPackData2.EqmtMg//The field length is too long
                    delete finalPackData2.trusfortDevice//The field length is too long
                    //Debug
                    //console.log(finalPackData2.endTime, finalPackData2.startTime, finalPackData2.duration);
                    parser.sendResult((0, _stringify2.default)(finalPackData2))
                    clearMsgInfoMap(MsgInfo.seqNum_add)
                    resetState()
                }
            }
            state = states.idle
            //格式 3,请求和响应报文内容为下一行的json
        } else if (REG_FORM_3_REQ.test(message)) {
            MsgInfo.startTime = parseTs(message.substring(1, 24))
            var msg_split5 = message.split(" ")
            MsgInfo.seqNum_add = msg_split5[2]
            MsgInfo.custNum_add = msg_split5[3]
            MsgInfo.tranCode_add = msg_split5[4]
            MsgInfo.bizDesc = msg_split5[5]
            MsgInfo.infoType_add = "M"
            var tempData100 = mobile_bank_map.get(MsgInfo.seqNum_add)
            MsgRecBuf = ""
            state = states.form3ReqInfo
        } else if (REG_FORM_3_RSP.test(message)) {
            MsgInfo.endTime = parseTs(message.substring(1, 24))
            var msg_split6 = message.split(" ")
            MsgInfo.seqNum_add = msg_split6[2]
            MsgRecBuf = ""
            state = states.form3RspInfo
            //格式 4
        } else if (REG_FORM_4_REQ.test(message)) {
            MsgInfo.startTime = parseTs(message.substring(1, 24))
            var msg_split7 = message.split(" ")
            MsgInfo.seqNum_add = msg_split7[2]
            MsgInfo.custNum_add = msg_split7[3]
            MsgInfo.tranCode_add = msg_split7[4]
            MsgInfo.bizDesc = msg_split7[5]
            MsgInfo.infoType_add = "M"
            MsgRecBuf = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            state = states.form4ReqInfo
        } else if (REG_FORM_4_RSP.test(message)) {
            MsgInfo.endTime = parseTs(message.substring(1, 24))
            var msg_split8 = message.split(" ")
            MsgInfo.seqNum_add = msg_split8[2]
            MsgRecBuf = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            state = states.form4RspInfo
            //格式 5
        } else if (REG_FORM_5_REQ.test(message)) {
            parseLoginInfo(message)
            //console.log(MsgInfo);
            parser.sendResult((0, _stringify2.default)(MsgInfo))
            resetState()
        }
        break
    case states.form1ReqInfo:
        if (REG_DATE.test(message)) {
            resetState()
        }
        MsgRecBuf += message
        if (message.indexOf("</service>") != -1) {
            parseXmlMsg(parser)
            resetState()
        }
        break
    case states.form1RspInfo:
        if (REG_DATE.test(message)) {
            resetState()
        }
        MsgRecBuf += message
        if (message.indexOf("</service>") != -1) {
            parseXmlMsg(parser)
            var finalPackData1 = mobile_bank_map.get(MsgInfo.seqNum_add).data
            if (finalPackData1 != null) {
                finalPackData1.duration = finalPackData1.endTime.getTime() - finalPackData1.startTime.getTime()
                delete finalPackData1.EqmtMg//The field length is too long
                parser.sendResult((0, _stringify2.default)(finalPackData1))
                clearMsgInfoMap(MsgInfo.seqNum_add)
            }
            resetState()
        }
        break
    case states.form2ReqInfo:
        if (REG_DATE.test(message)) {
            resetState()
        }
        MsgRecBuf += message
        if (message.indexOf("</LZYH>") != -1) {
            parseXmlMsg(parser)
            //console.log('Map--->', mobile_bank_map.get(MsgInfo.seqNum_add).data);
            resetState()
        }
        break
    //Discard this state, doesn't go into
    case states.form2RspInfo:
        resetState()
        break
    case states.form3ReqInfo:
        if (REG_DATE.test(message)) {
            resetState()
        }
        MsgRecBuf = message
        var tempData2 = mobile_bank_map.get(MsgInfo.seqNum_add)
        if (tempData2 === undefined) {
            flatJson(JSON.parse(MsgRecBuf), MsgInfo)
            mobile_bank_map.add(MsgInfo.seqNum_add, MsgInfo)
            //Debug
            //console.log('form3--->Form3 REQ_SEQ no existed\n', MsgInfo);
            resetState()
        } else {
            console.log("--->ShouJiYinHang_mbank2.js::messageHandler()::Form3 REQ_SEQ existing\n", MsgInfo)
            //mobile_bank_map.add(MsgInfo.seqNum_add, MsgInfo);
            resetState()
        }
        break
    case states.form3RspInfo:
        if (REG_DATE.test(message)) {
            resetState()
        }
        MsgRecBuf = message
        var tempData3 = mobile_bank_map.get(MsgInfo.seqNum_add)
        if (tempData3 !== undefined) {
            var finalPackData3 = tempData3.data
            flatJson(JSON.parse(MsgRecBuf), MsgInfo)
            finalPackData3 = (0, _assign2.default)(finalPackData3, MsgInfo)
            finalPackData3.duration = finalPackData3.endTime.getTime() - finalPackData3.startTime.getTime()
            delete finalPackData3.sign//The field length is too long
            //Debug
            //console.log(finalPackData3.endTime, finalPackData3.startTime, finalPackData3.duration);
            //Debug
            //console.log('--->Form3 Result', finalPackData3);
            parser.sendResult((0, _stringify2.default)(finalPackData3))
            clearMsgInfoMap(MsgInfo.seqNum_add)
            resetState()
        }
        break
    case states.form4ReqInfo:
        if (!REG_DATE.test(message)) {
            MsgRecBuf += message
        } else {
            parseXmlMsg(parser)
            resetState()
        }
        break
    case states.form4RspInfo:
        if (!REG_DATE.test(message)) {
            MsgRecBuf += message
        } else {
            parseXmlMsg(parser)
            var finalPackData4 = mobile_bank_map.get(MsgInfo.seqNum_add).data
            if (finalPackData4 != null) {
                finalPackData4.duration = finalPackData4.endTime.getTime() - finalPackData4.startTime.getTime()
                delete finalPackData4.AuthParam//The field length is too long
                //Debug
                //console.log(finalPackData4.endTime, finalPackData4.startTime, finalPackData4.duration);
                parser.sendResult((0, _stringify2.default)(finalPackData4))
                clearMsgInfoMap(MsgInfo.seqNum_add)
            }
            resetState()
        }
        break
    //Discard this state, doesn't go into
    case states.form5ReqInfo:
        resetState()
        break
    default:
        resetState()
        break
    }
}

var MobileBankParser = new _Parser2.default(messageHandler)
mobile_bank_map = new _mobile_bank_map2.default(MobileBankParser)
MobileBankParser.start()
