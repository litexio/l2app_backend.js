import { Contract } from 'web3-eth-contract';
import { provider } from 'web3-providers';
import { BN } from 'web3-utils';


import CITASDK from '@cryptape/cita-sdk';

import { Common } from "./common";

import { ERC20ABI, ADDRESS_ZERO, CHANNEL_STATUS, TYPED_DATA } from '../conf/contract';
import HttpWatcher from "../listener/listener";
import {ETH_EVENTS} from "../listener/eth_events";
import {CITA_EVENTS} from "../listener/cita_events";

const Web3 = require('web3');
import {signHash} from "./sign";

// 定义 PaymentNetwork 合约对象
export type PN = {
    address: string,
    abi: string
};

export type L2_EVENT = 'SessionMessage' | 'UserJoin' | 'Deposit' | 'Withdraw' | 'UserLeave' | 'Asset';
export type L2_CB = (err: any, res: any) => { };

export let CITA: any;
export let cpProvider: any;
export let web3: any;
export let ethPN: Contract;
export let appPN: Contract;
export let ERC20: Contract;
export let callbacks: Map<L2_EVENT, L2_CB>;

export class SDK {
    public static instance: SDK;

    // 私有函数，不允许外部使用 new函数 创建
    private constructor() {}

    // 单例模式 返回SDK对象
    public static GetInstance(): SDK {
        if (this.instance === undefined) {
            this.instance = new SDK();
        }

        return this.instance;
    }

    /**
     * 初始化 SDK
     *
     * @param cpPrivateKey      string
     * @param ethProvider       provider
     * @param ethPaymentNetwork       PN
     * @param appRpcUrl         string
     * @param appPaymentNetwork  PN
     * @constructor
     */
    async Init(cpPrivateKey: string, ethProvider: provider, ethPaymentNetwork: PN, appRpcUrl: string, appPaymentNetwork: PN) {
        web3    = new Web3(Web3.givenProvider || ethProvider);

        CITA = CITASDK(appRpcUrl);

        ethPN  = new Contract(ethProvider, Common.Abi2JsonInterface(ethPaymentNetwork.abi), ethPaymentNetwork.address);
        appPN = new CITA.base.Contract(Common.Abi2JsonInterface(appPaymentNetwork.abi), appPaymentNetwork.address);

        ethPN.options.address = ethPaymentNetwork.address;
        appPN.options.address = appPaymentNetwork.address;

        TYPED_DATA.domain.verifyingContract = ethPaymentNetwork.address;

        ERC20 = new Contract(ethProvider, Common.Abi2JsonInterface(ERC20ABI));

        cpProvider = CITA.base.accounts.privateKeyToAccount(cpPrivateKey);

        // 私钥错误, 不进行监听
        if (cpProvider.address) {
            // 监听 ETH合约事件
            new HttpWatcher(web3.eth, 15000, ethPN, ETH_EVENTS).start();

            // 监听 appChain合约事件
            new HttpWatcher(CITA.base, 3000, appPN, CITA_EVENTS).start();
        }

        callbacks = new Map<L2_EVENT, L2_CB>();
    }

    /**
     * CP充值
     *
     * @description 调用Eth支付合约的充值接口
     *
     * @param amount   number 存入金额
     * @param token    string token地址，0x0 eth  其它 token
     *
     * @returns string 返回交易hash
     */
    async Deposit(amount: number | string, token: string = ADDRESS_ZERO) {
        let amountBN = web3.utils.toBN(amount).toString();

        let data = ethPN.methods.providerDeposit(token, amountBN).encodeABI();

        let hash = {};

        // 其它token
        if(token !== ADDRESS_ZERO) {
            // 授权合约能从账户扣token
            let erc20Data = ERC20.methods.approve(ethPN.options.address, amountBN).encodeABI();

            // 发送ERC20交易
            await Common.SendEthTransaction(cpProvider.address, ethPN.options.address, 0, erc20Data);

            // 发送ETH交易
            hash = await Common.SendEthTransaction(cpProvider.address, ethPN.options.address, 0, data);
        } else {
            // 发送ETH交易
            hash = await Common.SendEthTransaction(cpProvider.address, ethPN.options.address, amountBN, data);
        }

        return hash;
    }

    /**
     * CP发起提现申请
     *
     * @description 发送提现请求到AppChain上
     *
     * @param amount number  提现金额
     * @param token  string  token地址
     *
     * @returns string 返回交易hash
     */
    async ProposeWithdraw(amount: number | string, token: string = ADDRESS_ZERO) {
        let amountBN = web3.utils.toBN(amount);

        let [{ providerOnchainBalance, providerBalance }] = await Promise.all([ appPN.methods.paymentNetworkMap(token).call() ]);

        let onChainBalanceBN = web3.utils.toBN(providerOnchainBalance);
        let balanceBN = web3.utils.toBN(providerBalance);

        // 余额检测 (BN 计算)
        if (amountBN.gt(onChainBalanceBN)) {
            return false;
        }

        //web3.utils.toBN(amount).gt()
        let balance = web3.utils.toBN(providerOnchainBalance).sub(web3.utils.toBN(amount));
        // 余额检测 (BN 计算)
        if (balance.gt(balanceBN)) {
            return false;
        }

        // 初始化 交易对象
        let tx = await Common.BuildAppChainTX();

        // ETH lastCommitBlock
        let lastCommitBlock = await Common.GetLastCommitBlock();

        // 发送交易 到 AppChain
        let rs = await appPN.methods.providerProposeWithdraw(token, balance.toString(), lastCommitBlock).send(tx);
        if (rs.hash) {
            let receipt = await CITA.listeners.listenToTransactionReceipt(rs.hash);

            if (!receipt.errorMessage) {
                //确认成功
                console.log("send CITA tx success", receipt);
                return 'confirm success'
            } else {
                //确认失败
                return 'confirm fail'
            }
        } else {
            // 提交失败
            return 'send CITA tx fail'
        }

        // 等待 ProviderProposeWithdraw 事件回调
    }

    /**
     * CP ReBalance 操作
     *
     * @description 提交到AppChain的支付合约
     *
     * @param userAddress string 用户地址
     * @param amount    bigint 挪进通道的金额
     * @param token     string token地址
     *
     * @return
     */
    async ProposeReBalance(userAddress: string, amount: number | string, token: string = ADDRESS_ZERO) {
        // 从 ETH 获取通道信息
        let channelID = await ethPN.methods.getChannelID(userAddress, token).call();

        // 获取通道信息
        let channel = await appPN.methods.channelMap(channelID).call();

        // 通道状态异常
        if (Number(channel.status) != CHANNEL_STATUS.CHANNEL_STATUS_OPEN) {
            throw new Error("channel status is not open");
        }

        // 转换金额 为BN, 便于计算
        let amountBN = web3.utils.toBN(amount);

        // 获取通道 可用金额
        let [{ providerBalance }] = await Promise.all([ appPN.methods.paymentNetworkMap(token).call() ]);
        // 转换金额 为BN, 便于计算
        let providerBalanceBN = web3.utils.toBN(providerBalance);

        // 获取 ReBalance 数据
        let [{ amount: balance, nonce }] = await Promise.all([ appPN.methods.rebalanceProofMap(channelID).call() ]);
        // 转换金额 为BN, 便于计算
        let balanceBN = web3.utils.toBN(balance);

        // 总金额检测，判断是否有足够资金
        if (amountBN.sub(balanceBN).gt(providerBalanceBN)) {
            return false;
        }

        // 计算 ReBalance amount
        let reBalanceAmountBN = balanceBN.add(amountBN).toString();

        // 计算 NONCE
        nonce = web3.utils.toBN(nonce).add(web3.utils.toBN(1)).toString();

        // CP 签名
        let messageHash = web3.utils.soliditySha3(
            {v: ethPN.options.address, t: 'address'},
            {v: channelID, t: 'bytes32'},
            {v: reBalanceAmountBN, t: 'uint256'},
            {v: nonce, t: 'uint256'},
        );

        // 进行签名
        let signature = Common.SignatureToHex(messageHash);

        // 初始化 交易对象
        let tx = await Common.BuildAppChainTX();

        // console.log("channelID", channelID);
        // console.log("balance", reBalanceAmountBN);
        // console.log("nonce", nonce);
        // console.log("signature", signature);

        // 向 appChain 提交 ReBalance 数据
        let rs = await appPN.methods.proposeRebalance(channelID, reBalanceAmountBN, nonce, signature).send(tx);
        if (rs.hash) {
            let receipt = await CITA.listeners.listenToTransactionReceipt(rs.hash);

            if (!receipt.errorMessage) {
                //确认成功
                console.log("send CITA tx success", receipt);
                return 'confirm success'
            } else {
                //确认失败
                console.log('confirm fail', receipt.errorMessage);
                return 'confirm fail'
            }
        } else {
            // 提交失败
            console.log('send CITA tx fail');
            return 'send CITA tx fail'
        }

        // 等待 ConfirmRebalance 事件回调
    }

    /**
     * cp 关闭通道
     *
     * @param token
     * @param userAddress
     * @constructor
     */
    async CloseChannel(userAddress: string, token: string = ADDRESS_ZERO) {
        // 从 ETH 获取通道信息
        let channelID = await ethPN.methods.getChannelID(userAddress, token).call();

        // 获取通道信息
        let channel = await appPN.methods.channelMap(channelID).call();

        console.log("channel", channel);

        // 通道状态异常
        if (Number(channel.status) != CHANNEL_STATUS.CHANNEL_STATUS_OPEN) {
            throw new Error("channel status is not open");
        }

        // AppChain 获取缓存数据
        let [{ balance, nonce, additionalHash, partnerSignature },
            { inAmount, inNonce, regulatorSignature, inProviderSignature }] = await Promise.all([
            appPN.methods.balanceProofMap(channelID, cpProvider.address).call(),
            appPN.methods.rebalanceProofMap(channelID).call()
        ]);

        // 生成数据
        let data = await ethPN.methods.closeChannel(
            channelID, balance, nonce, additionalHash, partnerSignature, inAmount, inNonce, regulatorSignature, inProviderSignature
        ).encodeABI();

        // 发送交易
        let hash = await Common.SendEthTransaction(cpProvider.address, ethPN.options.address, 0, data);

        console.log(hash);

        // 等待 ChannelClosed 事件回调
    }

    /**
     * cp 转账操作
     *
     * @description 提交到AppChain的支付合约
     *
     * @param to     接收方地址
     * @param amount 转账金额
     * @param token  token地址
     *
     * @constructor
     */
    async SendAsset (to: string, amount: number | string, token: string = ADDRESS_ZERO) {
        // 获取通道id
        let channelID = await ethPN.methods.getChannelID(to, token).call();

        // 获取通道信息
        let channel = await appPN.methods.channelMap(channelID).call();

        // 通道状态异常
        if (Number(channel.status) != CHANNEL_STATUS.CHANNEL_STATUS_OPEN) {
            throw new Error("channel status is not open");
        }

        // 构造交易结构体
        let tx = await Common.BuildAppChainTX();

        // 金额转成BN
        let amountBN = web3.utils.toBN(amount);

        // get balance proof from appChain contract
        let [{balance, nonce, additionalHash}] = await Promise.all([
            appPN.methods.balanceProofMap(channelID, to).call()
        ]);

        let balanceBN = web3.utils.toBN(balance);

        // 计算金额
        let assetAmountBN = amountBN.add(balanceBN).toString();
        nonce = web3.utils.toBN(nonce).add(web3.utils.toBN(1)).toString();

        additionalHash = '0x0';

        // 签署消息
        // let messageHash = web3.utils.soliditySha3(
        //     {v: ethPN.options.address, t: 'address'},
        //     {v: channelID, t: 'bytes32'},
        //     {v: assetAmountBN, t: 'uint256'},
        //     {v: nonce, t: 'uint256'},
        //     {v: additionalHash, t: 'bytes32'},
        // );

        let messageHash = signHash({
            channelID: channelID,
            balance: assetAmountBN,
            nonce: nonce,
            additionalHash: additionalHash
        });

        // 进行签名
        let signature = Common.SignatureToHex(messageHash);

        // console.log("--balance--", balance);
        // console.log("--nonce--", nonce);
        // console.log("--additionalHash--", additionalHash);
        // console.log("--signature--", signature);
        // console.log("--tx--", tx);
        // return;

        // 发送转账交易
        let rs = await appPN.methods.transfer(to, channelID, assetAmountBN, nonce, additionalHash, signature).send(tx);
        if (rs.hash) {
            let receipt = await CITA.listeners.listenToTransactionReceipt(rs.hash);

            if (!receipt.errorMessage) {
                //确认成功
                console.log("send CITA tx success", receipt);
                return 'confirm success'
            } else {
                //确认失败
                console.log("confirm fail", receipt.errorMessage);
                return 'confirm fail'
            }
        } else {
            // 提交失败
            return 'send CITA tx fail'
        }

        // 等待 Transfer 事件回调
    }

    /**
     *
     * @constructor
     */
    SendMessage() {

    }

    /**
     *
     * @constructor
     */
    async SettleChannel(channelID: string) {
        // channelID
        // 设置定时器， 定时器为 区块号  eth  channelMap[channelID].settleBlock
    }

    /**
     * 外部设置事件回调
     * @param event 外部事件名
     * @param callback 外部设置的回调
     */
    on(event: L2_EVENT, callback: L2_CB) {
        callbacks.set(event, callback);
    }

    /* 查询接口部分 */

    /**
     * 获取支付通道信息
     *
     * @param token token地址
     *
     * @return json 支付通道信息
     */
    async GetPaymentNetwork(token: string = ADDRESS_ZERO) {
        // 获取通道 可用金额
        let [{ userCount, userTotalDeposit, userTotalWithdraw, providerDeposit, providerWithdraw, providerBalance, providerOnchainBalance }] = await Promise.all([ appPN.methods.paymentNetworkMap(token).call() ]);

        return {
            userCount: userCount,
            userTotalDeposit: userTotalDeposit,
            userTotalWithdraw: userTotalWithdraw,
            providerDeposit: providerDeposit,
            providerWithdraw: providerWithdraw,
            providerBalance: providerBalance,
            providerOnChainBalance: providerOnchainBalance,
        };
    }

    async GetChannelInfo(userAddress: string, token: string = ADDRESS_ZERO) {
        // 从 ETH 获取通道信息
        let channelID = await ethPN.methods.getChannelID(userAddress, token).call();

        // 通道未开通检测
        if(!channelID) {
            return {
                channel: {}
            };
        }

        // 获取通道信息
        return await appPN.methods.channelMap(channelID).call();
    }

    async GetAllTXs(token: string = ADDRESS_ZERO) {

        let [inTXs, outTXs] = await Promise.all([
            appPN.getPastEvents('Transfer', { filter: { to: cpProvider.address } }),
            appPN.getPastEvents('Transfer', { filter: { from: cpProvider.address } })
        ]);

        const cmpNonce = (key: string) => {
            return (a: any, b: any) => { return a[key] - b[key] }
        };

        let lastBalance = new BN(0);
        const getTX = (tx: any) => {
            let { channelID, balance, ...rest } = tx.returnValues;
            balance = new BN(balance);
            let amount = balance.sub(lastBalance).toString();
            lastBalance = balance;

            return {
                id: tx.transactionHash,
                amount,
                ...rest,
            }
        };

        inTXs = inTXs.sort(cmpNonce('nonce')).map(tx => getTX(tx));
        outTXs = outTXs.sort(cmpNonce('nonce')).map(tx => getTX(tx));

        return { in: inTXs, out: outTXs };
    }
}