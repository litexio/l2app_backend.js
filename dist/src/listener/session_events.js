"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var server_1 = require("../lib/server");
var mylog_1 = require("../lib/mylog");
exports.SESSION_EVENTS = {
    InitSession: {
        filter: function () {
            return {};
        },
        handler: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                mylog_1.logger.debug("--------------------Handle CITA InitSession--------------------");
                return [2];
            });
        }); }
    },
    JoinSession: {
        filter: function () {
            return {};
        },
        handler: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                mylog_1.logger.debug("--------------------Handle CITA JoinSession--------------------");
                return [2];
            });
        }); }
    },
    SendMessage: {
        filter: function () {
            return { to: server_1.cpProvider.address };
        },
        handler: function (event) { return __awaiter(_this, void 0, void 0, function () {
            var _a, from, to, sessionID, type, content, balance, nonce, amount, channelID, transactionHash, token, message;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        mylog_1.logger.debug("--------------------Handle CITA SendMessage--------------------");
                        _a = event.returnValues, from = _a.from, to = _a.to, sessionID = _a.sessionID, type = _a.mType, content = _a.content, balance = _a.balance, nonce = _a.nonce, amount = _a.amount, channelID = _a.channelID, transactionHash = event.transactionHash;
                        mylog_1.logger.debug(" from: [%s], to: [%s], sessionID: [%s], type: [%s], content: [%s], balance: [%s], nonce: [%s], amount: [%s], channelID: [%s] ", from, to, sessionID, type, content, balance, nonce, amount, channelID);
                        return [4, server_1.appPN.methods.channelMap(channelID).call()];
                    case 1:
                        token = (_b.sent()).token;
                        message = {
                            from: from,
                            sessionID: sessionID,
                            type: type,
                            content: content,
                            amount: amount,
                            token: token
                        };
                        server_1.callbacks.get("Message") && server_1.callbacks.get("Message")(null, message);
                        return [2];
                }
            });
        }); }
    },
    CloseSession: {
        filter: function () {
            return {};
        },
        handler: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                mylog_1.logger.debug("--------------------Handle CITA CloseSession--------------------");
                return [2];
            });
        }); }
    }
};
//# sourceMappingURL=session_events.js.map