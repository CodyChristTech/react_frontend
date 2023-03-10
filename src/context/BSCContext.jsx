import axios from 'axios'
import React, { useCallback, useEffect, useState } from 'react'
import Web3 from 'web3'
import Web3Modal from 'web3modal'
import WalletConnectProvider from '@walletconnect/web3-provider'
import { getContract, getContractNoABI } from 'common/utils/getContract'
import { ethers } from 'ethers'
import { useDebouncedCallback } from 'common/hooks/useDebouncedCallback'
import wbnbABI from '../ABI/tokenABI/WBNB'

const Contract = require('web3-eth-contract')
// set provider for all later instances to use
Contract.setProvider('wss://ws-nd-219-979-765.p2pify.com/c2317b27ad9bde72c2d30764cf359fa3')

const BSCContext = React.createContext()

const nodes = [
    // # 10+ nodes balanced, US/EU
    'https://bsc-dataseed1.ninicoin.io',
    // # 10+ nodes balanced, US/EU
    'https://bsc-dataseed1.defibit.io',
    // # 10+ nodes balanced in each region, global
    'https://bsc-dataseed.binance.org',
    // # Google Cloud Infrastructure Endpoint - Global
    'https://nodes.pancakeswap.com/',
]

const BSCContextProvider = ({ children }) => {
    const [WBNBContract, setWBNBContract] = useState(null)
    const [currentAccountAddress, setCurrentAccountAddress] = useState('')
    const [loadDexContract, setLoadDexContract] = useState(false)
    const [hasDappBrowser, setHasDappBrowser] = useState(false)
    const [currentBnbBalance, setBNBBalance] = useState('')
    const [currentWbnbBalance, setWBNBBalance] = useState('')
    const [pancakeSwapRouterV2, setPancakeSwapRouterV2] = useState(null)
    const utopiaLimitOrderAddress = '0xFaDB11EC99Bf90A6f32d079f33a37E0Ba1cf4bdE'
    const utopiaStopLossAddress = '0x8f4E2B6CFbC53A68A0DEB6eD1ea8dae678eABAf8'
    const pancakeSwapFactoryAddress = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
    const pancakeSwapRouterV2Address = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
    const WBNBAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    const [tokenBalances, setTokenBalances] = useState([])
    const [refreshTokens, setRefreshTokens] = useState(false)
    const [currentProvider, setProvider] = useState()
    const [signer, setSigner] = useState()

    const debounceGetTokenBalance = useDebouncedCallback(async (address) => {
        if (address && window.web3) {
            const currentTokenBalancesResponse = await axios.get('https://api.bscscan.com/api', {
                params: {
                    module: 'account',
                    action: 'addresstokenbalance',
                    address,
                    tag: 'latest',
                    apikey: 'IEXFMZMTEFKY351A7BG72V18TQE2VS74J1',
                },
            })
            const currentTokenBalances = currentTokenBalancesResponse?.data?.result || []
            const newTokenBalances = currentTokenBalances.map(async (token) => {
                try {
                    const abi = await import(`../ABI/tokenABI/${token.TokenSymbol.toUpperCase()}.js`)
                    const tokenContract = getContract(abi.default, token.TokenAddress, signer)
                    if (tokenContract.balanceOf) {
                        const balance = await tokenContract.balanceOf(address)
                        return {
                            ...token,
                            TokenQuantity: balance.toString(),
                        }
                    }
                } catch (e) {
                    const tokenContract = getContractNoABI(token.TokenAddress, signer)
                    if (tokenContract.balanceOf) {
                        const balance = await tokenContract.balanceOf(address)
                        return {
                            ...token,
                            TokenQuantity: balance.toString(),
                        }
                    }
                }
                return token
            })
            Promise.all(newTokenBalances).then((values) => {
                setTokenBalances(values)
            })
            setRefreshTokens(false)
        }
    }, 2000)

    useEffect(async () => {
        debounceGetTokenBalance(currentAccountAddress)
    }, [currentAccountAddress, refreshTokens, signer])

    const setupNetwork = async () => {
        const provider = window.ethereum
        if (provider) {
            const chainId = 56
            try {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: `0x${chainId.toString(16)}`,
                            chainName: 'Binance Smart Chain Mainnet',
                            nativeCurrency: {
                                name: 'BNB',
                                symbol: 'bnb',
                                decimals: 18,
                            },
                            rpcUrls: nodes,
                            blockExplorerUrls: [`https://bscscan.com/`],
                        },
                    ],
                })
                return true
            } catch (error) {
                console.error('Failed to setup the network in Metamask:', error)
                return false
            }
        } else {
            console.error("Can't setup the BSC network on metamask because window.ethereum is undefined")
            return false
        }
    }

    const loadPancakeSwapFactoryContract = async () => {}

    const loadPancakeSwapRouterV2Contract = async (currSigner) => {
        if (window.web3) {
            const currentContract = await getContractNoABI(pancakeSwapRouterV2Address, currSigner)
            if (!pancakeSwapRouterV2) {
                setPancakeSwapRouterV2(currentContract)
            }
        }
    }

    const loadWBNBContract = async (currSigner) => {
        if (window.web3) {
            const currentContract = await getContractNoABI(WBNBAddress, currSigner)
            if (!WBNBContract) {
                setWBNBContract(currentContract)
            }
        }
    }

    const disconnect = useCallback(async () => {
        await window.web3Modal.clearCachedProvider()
        if (currentProvider?.disconnect && typeof currentProvider.disconnect === 'function') {
            await currentProvider.disconnect()
        }
        setCurrentAccountAddress('')
    }, [currentProvider])

    const loadAccountInfo = async (account, provider) => {
        const newBnbBalance = await window.web3.eth.getBalance(account[0])
        setCurrentAccountAddress(account[0])
        setBNBBalance(newBnbBalance)
        const ethersProvider = new ethers.providers.Web3Provider(provider)
        const currSigner = ethersProvider.getSigner()
        const wbnbContract = new ethers.Contract(WBNBAddress, wbnbABI, currSigner)
        const wbnbBalance = await wbnbContract.balanceOf(account[0])
        setWBNBBalance(wbnbBalance.toString())
        setSigner(currSigner)
        if (loadDexContract) {
            await loadPancakeSwapFactoryContract()
            await loadPancakeSwapRouterV2Contract(currSigner)
        }
        await loadWBNBContract(currSigner)
    }

    const triggerDappModal = async () => {
        const providerOptions = {
            walletconnect: {
                display: {
                    logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMzAwcHgiIGhlaWdodD0iMTg1cHgiIHZpZXdCb3g9IjAgMCAzMDAgMTg1IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgogICAgPCEtLSBHZW5lcmF0b3I6IFNrZXRjaCA0OS4zICg1MTE2NykgLSBodHRwOi8vd3d3LmJvaGVtaWFuY29kaW5nLmNvbS9za2V0Y2ggLS0+CiAgICA8dGl0bGU+V2FsbGV0Q29ubmVjdDwvdGl0bGU+CiAgICA8ZGVzYz5DcmVhdGVkIHdpdGggU2tldGNoLjwvZGVzYz4KICAgIDxkZWZzPjwvZGVmcz4KICAgIDxnIGlkPSJQYWdlLTEiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPgogICAgICAgIDxnIGlkPSJ3YWxsZXRjb25uZWN0LWxvZ28tYWx0IiBmaWxsPSIjM0I5OUZDIiBmaWxsLXJ1bGU9Im5vbnplcm8iPgogICAgICAgICAgICA8cGF0aCBkPSJNNjEuNDM4NTQyOSwzNi4yNTYyNjEyIEMxMTAuMzQ5NzY3LC0xMS42MzE5MDUxIDE4OS42NTA1MywtMTEuNjMxOTA1MSAyMzguNTYxNzUyLDM2LjI1NjI2MTIgTDI0NC40NDgyOTcsNDIuMDE5Njc4NiBDMjQ2Ljg5Mzg1OCw0NC40MTQwODY3IDI0Ni44OTM4NTgsNDguMjk2MTg5OCAyNDQuNDQ4Mjk3LDUwLjY5MDU5OSBMMjI0LjMxMTYwMiw3MC40MDYxMDIgQzIyMy4wODg4MjEsNzEuNjAzMzA3MSAyMjEuMTA2MzAyLDcxLjYwMzMwNzEgMjE5Ljg4MzUyMSw3MC40MDYxMDIgTDIxMS43ODI5MzcsNjIuNDc0OTU0MSBDMTc3LjY2MTI0NSwyOS4wNjY5NzI0IDEyMi4zMzkwNTEsMjkuMDY2OTcyNCA4OC4yMTczNTgyLDYyLjQ3NDk1NDEgTDc5LjU0MjMwMiw3MC45Njg1NTkyIEM3OC4zMTk1MjA0LDcyLjE2NTc2MzMgNzYuMzM3MDAxLDcyLjE2NTc2MzMgNzUuMTE0MjIxNCw3MC45Njg1NTkyIEw1NC45Nzc1MjY1LDUxLjI1MzA1NjEgQzUyLjUzMTk2NTMsNDguODU4NjQ2OSA1Mi41MzE5NjUzLDQ0Ljk3NjU0MzkgNTQuOTc3NTI2NSw0Mi41ODIxMzU3IEw2MS40Mzg1NDI5LDM2LjI1NjI2MTIgWiBNMjgwLjIwNjMzOSw3Ny4wMzAwMDYxIEwyOTguMTI4MDM2LDk0LjU3NjkwMzEgQzMwMC41NzM1ODUsOTYuOTcxMyAzMDAuNTczNTk5LDEwMC44NTMzOCAyOTguMTI4MDY3LDEwMy4yNDc3OTMgTDIxNy4zMTc4OTYsMTgyLjM2ODkyNyBDMjE0Ljg3MjM1MiwxODQuNzYzMzUzIDIxMC45MDczMTQsMTg0Ljc2MzM4IDIwOC40NjE3MzYsMTgyLjM2ODk4OSBDMjA4LjQ2MTcyNiwxODIuMzY4OTc5IDIwOC40NjE3MTQsMTgyLjM2ODk2NyAyMDguNDYxNzA0LDE4Mi4zNjg5NTcgTDE1MS4xMDc1NjEsMTI2LjIxNDM4NSBDMTUwLjQ5NjE3MSwxMjUuNjE1NzgzIDE0OS41MDQ5MTEsMTI1LjYxNTc4MyAxNDguODkzNTIxLDEyNi4yMTQzODUgQzE0OC44OTM1MTcsMTI2LjIxNDM4OSAxNDguODkzNTE0LDEyNi4yMTQzOTMgMTQ4Ljg5MzUxLDEyNi4yMTQzOTYgTDkxLjU0MDU4ODgsMTgyLjM2ODkyNyBDODkuMDk1MDUyLDE4NC43NjMzNTkgODUuMTMwMDEzMywxODQuNzYzMzk5IDgyLjY4NDQyNzYsMTgyLjM2OTAxNCBDODIuNjg0NDEzMywxODIuMzY5IDgyLjY4NDM5OCwxODIuMzY4OTg2IDgyLjY4NDM4MjcsMTgyLjM2ODk3IEwxLjg3MTk2MzI3LDEwMy4yNDY3ODUgQy0wLjU3MzU5NjkzOSwxMDAuODUyMzc3IC0wLjU3MzU5NjkzOSw5Ni45NzAyNzM1IDEuODcxOTYzMjcsOTQuNTc1ODY1MyBMMTkuNzkzNjkyOSw3Ny4wMjg5OTggQzIyLjIzOTI1MzEsNzQuNjM0NTg5OCAyNi4yMDQyOTE4LDc0LjYzNDU4OTggMjguNjQ5ODUzMSw3Ny4wMjg5OTggTDg2LjAwNDgzMDYsMTMzLjE4NDM1NSBDODYuNjE2MjIxNCwxMzMuNzgyOTU3IDg3LjYwNzQ3OTYsMTMzLjc4Mjk1NyA4OC4yMTg4NzA0LDEzMy4xODQzNTUgQzg4LjIxODg3OTYsMTMzLjE4NDM0NiA4OC4yMTg4ODc4LDEzMy4xODQzMzggODguMjE4ODk2OSwxMzMuMTg0MzMxIEwxNDUuNTcxLDc3LjAyODk5OCBDMTQ4LjAxNjUwNSw3NC42MzQ1MzQ3IDE1MS45ODE1NDQsNzQuNjM0NDQ0OSAxNTQuNDI3MTYxLDc3LjAyODc5OCBDMTU0LjQyNzE5NSw3Ny4wMjg4MzE2IDE1NC40MjcyMjksNzcuMDI4ODY1MyAxNTQuNDI3MjYyLDc3LjAyODg5OSBMMjExLjc4MjE2NCwxMzMuMTg0MzMxIEMyMTIuMzkzNTU0LDEzMy43ODI5MzIgMjEzLjM4NDgxNCwxMzMuNzgyOTMyIDIxMy45OTYyMDQsMTMzLjE4NDMzMSBMMjcxLjM1MDE3OSw3Ny4wMzAwMDYxIEMyNzMuNzk1NzQsNzQuNjM1NTk2OSAyNzcuNzYwNzc4LDc0LjYzNTU5NjkgMjgwLjIwNjMzOSw3Ny4wMzAwMDYxIFoiIGlkPSJXYWxsZXRDb25uZWN0Ij48L3BhdGg+CiAgICAgICAgPC9nPgogICAgPC9nPgo8L3N2Zz4=',
                    name: 'Mobile',
                    description: 'Scan qrcode with your mobile wallet',
                },
                package: WalletConnectProvider,
                options: {
                    infuraId: '27e484dcd9e3efcfd25a83a78777cdf1', // required
                    rpc: {
                        1: 'https://mainnet.mycustomnode.com',
                        3: 'https://ropsten.mycustomnode.com',
                        100: 'https://dai.poa.network',
                        56: 'https://bsc-dataseed.binance.org',
                    },
                },
            },
        }

        window.web3Modal = new Web3Modal({
            network: 'binance', // optional
            cacheProvider: false, // optional
            providerOptions, // required
            theme: 'dark',
        })

        const provider = await window.web3Modal.connect()
        setProvider(provider)

        window.web3 = new Web3(provider)
        const accounts = await window.web3.eth.getAccounts()
        const bnbBalance = await window.web3.eth.getBalance(accounts[0])
        setCurrentAccountAddress(accounts[0])
        setBNBBalance(bnbBalance)
        setHasDappBrowser(true)

        provider.on('accountsChanged', async (newAccounts) => {
            await loadAccountInfo(newAccounts, provider)
        })

        loadAccountInfo(accounts, provider)
    }

    const registerToken = async (token) => {
        const tokenAdded = await window.ethereum.request({
            method: 'wallet_watchAsset',
            params: {
                type: 'ERC20',
                options: {
                    address: token.address,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    image: token.logoURI,
                },
            },
        })

        return tokenAdded
    }

    const logout = () => {
        disconnect()
    }

    return (
        <BSCContext.Provider
            value={{
                currentAccountAddress,
                logout,
                setLoadDexContract,
                hasDappBrowser,
                triggerDappModal,
                currentBnbBalance,
                currentWbnbBalance,
                pancakeSwapRouterV2,
                registerToken,
                pancakeSwapFactoryAddress,
                pancakeSwapRouterV2Address,
                tokenBalances,
                setRefreshTokens,
                setupNetwork,
                utopiaLimitOrderAddress,
                utopiaStopLossAddress,
                signer,
                WBNBContract,
            }}
        >
            {children}
        </BSCContext.Provider>
    )
}

export default BSCContext

export { BSCContextProvider }
