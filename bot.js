const { parseEther } = require("@ethersproject/units")
const sleep = require('util').promisify(setTimeout)
const { getStats, predictionContract, getBNBPrice, checkBalance, reduceWaitingTimeByTwoBlocks, saveRound,claimRewards } = require("./lib")
const { TradingViewScan, SCREENERS_ENUM, EXCHANGES_ENUM, INTERVALS_ENUM } = require("trading-view-recommends-parser-nodejs")
const axios = require('axios')
// Global Config
const GLOBAL_CONFIG = {
    BET_AMOUNT: 10, // in USD
    DAILY_GOAL: 2000, // in USD,
    WAITING_TIME: 261000, // in Miliseconds (4.3 Minutes)
    THRESHOLD: 50 // Minimum % of certainty of signals (50 - 100)
}

//Bet UP
const betUp = async (amount, epoch) => {
    try {
        const tx = await predictionContract.betBull(epoch, {
            value: parseEther(amount.toFixed(18).toString()),
        })
        await tx.wait()
        console.log(`🤞 Successful bet of ${amount} BNB to UP 🍀`)
    } catch (error) {
        console.log("Transaction Error", error)
        GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(GLOBAL_CONFIG.WAITING_TIME)
    }
}

//Bet DOWN
const betDown = async (amount, epoch) => {
    try {
        const tx = await predictionContract.betBear(epoch, {
            value: parseEther(amount.toFixed(18).toString()),
        })
        await tx.wait()
        console.log(`🤞 Successful bet of ${amount} BNB to DOWN 🍁`)
    } catch (error) {
        console.log("Transaction Error", error)
        GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(GLOBAL_CONFIG.WAITING_TIME)
    }
}

//Check Signals
const getSignals = async () => {
    //1 Minute signals
    let resultMin = await new TradingViewScan(
        SCREENERS_ENUM["crypto"],
        EXCHANGES_ENUM["BINANCE"],
        "BNBUSDT",
        INTERVALS_ENUM["1m"]
    ).analyze()
    let minObj = JSON.stringify(resultMin.summary)
    let minRecomendation = JSON.parse(minObj)

    //5 Minute signals
    let resultMed = await new TradingViewScan(
        SCREENERS_ENUM["crypto"],
        EXCHANGES_ENUM["BINANCE"],
        "BNBUSDT",
        INTERVALS_ENUM["5m"]
    ).analyze()
    let medObj = JSON.stringify(resultMed.summary)
    let medRecomendation = JSON.parse(medObj)
    let indicators5 = JSON.stringify(resultMed.indicators)
    let ind5 = JSON.parse(indicators5)
    const EMA_5_5 = parseFloat(ind5["EMA5"].toFixed(4))
    const EMA_5_10 = parseFloat(ind5["EMA10"].toFixed(4))
    const EMA_5_20 = parseFloat(ind5["EMA20"].toFixed(4))
    const SMA_5_20 = parseFloat(ind5["SMA20"].toFixed(4))
    const EMA_5_50 = parseFloat(ind5["EMA50"].toFixed(4))
    const EMA_5_100 = parseFloat(ind5["EMA100"].toFixed(4))
    const RSI_5 = parseFloat(ind5["RSI"].toFixed(4))
    const StochK_5 = parseFloat(ind5["Stoch.K"].toFixed(4))
    const StochD_5 = parseFloat(ind5["Stoch.D"].toFixed(4))
    const RSI_5_1 = parseFloat(ind5['RSI[1]'].toFixed(4))
    const StochK_5_1 = parseFloat(ind5["Stoch.K[1]"].toFixed(4))
    const StochD_5_1 = parseFloat(ind5["Stoch.D[1]"].toFixed(4))
    const StochRSIK_5= parseFloat(ind5["Stoch.RSI.K"].toFixed(4))
    const MACDmacd_5 = parseFloat(ind5["MACD.macd"].toFixed(4))
    const MACDsignal_5 = parseFloat(ind5["MACD.signal"].toFixed(4))
    const OpenMed  = parseFloat(ind5["open"])
    const CloseMed = parseFloat(ind5["close"])
    const ADX_5 = parseFloat(ind5["ADX"].toFixed(4))
    const ADXU_5 = parseFloat(ind5["ADX+DI"].toFixed(4))
    const ADXD_5 = parseFloat(ind5["ADX-DI"].toFixed(4))
    const ADXU_5_1 = parseFloat(ind5["ADX+DI[1]"].toFixed(4))
    const ADXD_5_1 = parseFloat(ind5["ADX-DI[1]"].toFixed(4))
    const CCI_5 = parseFloat(ind5["CCI20"].toFixed(4))
    const CCI_5_1 = parseFloat(ind5["CCI20[1]"].toFixed(4))
    const BOLL_5 = parseFloat(ind5["BBPower"].toFixed(4))
    const WR_5 = parseFloat(ind5["W.R"].toFixed(4))
    //Average signals
    if (minRecomendation && medRecomendation) {
        let averageBuy = (parseInt(minRecomendation.BUY) + parseInt(medRecomendation.BUY)) / 2 
        let averageSell = (parseInt(minRecomendation.SELL) + parseInt(medRecomendation.SELL)) / 2 
        let averageNeutral = (parseInt(minRecomendation.NEUTRAL) + parseInt(medRecomendation.NEUTRAL)) / 2 
        return {
            buy: averageBuy,
            sell: averageSell,
            neutral: averageNeutral,
            RSI_5_1,
            CCI_5,
            CCI_5_1,
            StochK_5_1,
            StochD_5_1,

        }
    } else {
        return false
    }
}

//Percentage difference
const percentage = (a, b) => {
    return parseInt(100 * a / (a + b))
}

//Strategy of betting
const strategy = async (minAcurracy, epoch) => {
    let BNBPrice
    let earnings = await getStats()
    if (earnings.profit_USD >= GLOBAL_CONFIG.DAILY_GOAL) {
        console.log("🧞 Daily goal reached. Shuting down... ✨")
        process.exit()
    }
    try {
        BNBPrice = await getBNBPrice()
    } catch (err) {
        return
    }
    let signals = await getSignals()
    console.log("siganl:",signals)
    if (signals) {
        if (signals.RSI_5_1 < 35 && signals.CCI_5_1<-100 && percentage(signals.sell, signals.buy) > minAcurracy) {
            console.log(`${epoch.toString()} 🔮 Prediction: UPP 🟢 ${percentage(signals.sell, signals.buy)}%`)
            await betUp((GLOBAL_CONFIG.BET_AMOUNT / BNBPrice), epoch)
            await saveRound(epoch.toString(), [{ round: epoch.toString(), betAmount: (GLOBAL_CONFIG.BET_AMOUNT / BNBPrice).toString(), bet: "bull" }])
        } else if (signals.RSI_5_1 > 65 && signals.CCI_5_1>100 && percentage(signals.buy, signals.sell) > minAcurracy) {
            console.log(`${epoch.toString()} 🔮 Prediction: DOWN 🔴 ${percentage(signals.buy, signals.sell)}%`)
            await betDown((GLOBAL_CONFIG.BET_AMOUNT / BNBPrice), epoch)
            await saveRound(epoch.toString(), [{ round: epoch.toString(), betAmount: (GLOBAL_CONFIG.BET_AMOUNT / BNBPrice).toString(), bet: "bear" }])
        } else {
            let lowPercentage
            if (signals.buy > signals.sell) {
                lowPercentage = percentage(signals.buy, signals.sell)
            } else {
                lowPercentage = percentage(signals.sell, signals.buy)
            }
            console.log("Waiting for next round 🕑 ", lowPercentage + "%")
        }
    } else {
        console.log("Error obtaining signals")
    }
}

//Check balance
checkBalance(GLOBAL_CONFIG.AMOUNT_TO_BET)
console.log('🤗 Welcome! Waiting for next round... ')

//Betting
predictionContract.on("StartRound", async (epoch) => {
    console.log("🥞 Starting round " + epoch.toString())
    console.log("🕑 Waiting " + (GLOBAL_CONFIG.WAITING_TIME / 60000).toFixed(1) + " minutes")
    await sleep(GLOBAL_CONFIG.WAITING_TIME)
    await strategy(GLOBAL_CONFIG.THRESHOLD, epoch)
})

//Show stats
predictionContract.on("EndRound", async (epoch) => {
    await saveRound(epoch)
    let stats = await getStats()
    console.log('--------------------------------')
    console.log(`🍀 Fortune: ${stats.percentage} `)
    console.log(`👍 ${stats.win}|${stats.loss} 👎`)
    console.log(`💰 Profit: ${stats.profit_USD.toFixed(3)} USD`)
    console.log('--------------------------------')
})
