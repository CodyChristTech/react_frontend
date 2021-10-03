/* eslint-disable no-restricted-syntax */
import { io } from 'socket.io-client'
import { parseFullSymbol } from './helpers'

const socket = io('https://price-retriever-dot-utopia-315014.uw.r.appspot.com')

const channelToSubscription = new Map()

function getNextDailyBarTime(barTime) {
    const date = new Date(barTime * 1000)
    date.setDate(date.getDate() + 1)
    return date.getTime() / 1000
}

socket.on('connect', () => {
    console.log('[socket] Connected')
})

socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason)
})

socket.on('error', (error) => {
    console.log('[socket] Error:', error)
})

export function subscribeOnStream(symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback, lastDailyBar) {
    const parsedSymbol = parseFullSymbol(symbolInfo.full_name)
    const channelString = `0~${parsedSymbol.exchange}~${symbolInfo.address}~0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`
    const handler = {
        id: subscribeUID,
        callback: onRealtimeCallback,
    }
    let subscriptionItem = channelToSubscription.get(channelString)
    if (subscriptionItem) {
        // already subscribed to the channel, use the existing subscription
        subscriptionItem.handlers.push(handler)
        return
    }
    subscriptionItem = {
        subscribeUID,
        resolution,
        lastDailyBar,
        handlers: [handler],
    }
    channelToSubscription.set(channelString, subscriptionItem)
    console.log('[subscribeBars]: Subscribe to streaming. Channel:', channelString)
    socket.emit('SubAdd', { subs: [channelString] })
}

socket.on('m', (data) => {
    console.log('[socket] Message:', data)
    const [eventTypeStr, exchange, fromSymbol, toSymbol, , , tradeTimeStr, , tradePriceStr] = data.split('~')

    if (parseInt(eventTypeStr, 10) !== 0) {
        // skip all non-TRADE events
        return
    }
    const tradePrice = parseFloat(tradePriceStr)
    const tradeTime = parseInt(tradeTimeStr, 10)
    const channelString = `0~${exchange}~${fromSymbol}~${toSymbol}`
    const subscriptionItem = channelToSubscription.get(channelString)
    if (subscriptionItem === undefined) {
        return
    }
    const { lastDailyBar } = subscriptionItem
    const nextDailyBarTime = getNextDailyBarTime(lastDailyBar.startTime)
    let bar
    if (tradeTime >= nextDailyBarTime) {
        bar = {
            time: nextDailyBarTime,
            open: tradePrice,
            high: tradePrice,
            low: tradePrice,
            close: tradePrice,
        }
        console.log('[socket] Generate new bar', bar)
    } else {
        bar = {
            ...lastDailyBar,
            high: Math.max(lastDailyBar.high, tradePrice),
            low: Math.min(lastDailyBar.low, tradePrice),
            close: tradePrice,
        }
        console.log('[socket] Update the latest bar by price', tradePrice)
    }

    subscriptionItem.lastDailyBar = bar

    // send data to every subscriber of that symbol
    subscriptionItem.handlers.forEach((handler) => handler.callback(bar))
})
export function unsubscribeFromStream(subscriberUID) {
    // find a subscription with id === subscriberUID
    for (const channelString of channelToSubscription.keys()) {
        const subscriptionItem = channelToSubscription.get(channelString)
        const handlerIndex = subscriptionItem.handlers.findIndex((handler) => handler.id === subscriberUID)

        if (handlerIndex !== -1) {
            // remove from handlers
            subscriptionItem.handlers.splice(handlerIndex, 1)

            if (subscriptionItem.handlers.length === 0) {
                // unsubscribe from the channel, if it was the last handler
                console.log('[unsubscribeBars]: Unsubscribe from streaming. Channel:', channelString)
                socket.emit('SubRemove', { subs: [channelString] })
                channelToSubscription.delete(channelString)
                break
            }
        }
    }
}
