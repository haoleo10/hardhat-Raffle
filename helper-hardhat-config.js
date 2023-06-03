const { ethers } = require("hardhat")
const networkConfig = {
    //hardhat network
    31337: {
        //没有vrf,因为我们部署mock
        name: "localhost",
        //VRFCoordinatorV2Mock.sol这个函数里有subscriptionCreated, 返回一个subscriptionId
        subscriptionId: "588",
        //hardhat 的gas lane 随便写
        gasLane: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c", // 30 gwei
        keepersUpdateInterval: "60",
        raffleEntranceFee: ethers.utils.parseEther("0.01"), // 0.01 ETH
        callbackGasLimit: "500000", // 500,000 gas
    },
    // Price Feed Address, values can be obtained at https://docs.chain.link/data-feeds/price-feeds/addresses
    //sepolia network
    11155111: {
        name: "sepolia",
        //chainlink docs to get the vrfcoordinator for sepolia test net
        vrfCoordinatorV2: "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625",
        //https:vrf.chain.link to get the subscriptionId 
        subscriptionId: "2552",
        //chianlink docs to get gaslane address
        gasLane: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c", // 30 gwei
        keepersUpdateInterval: "60",
        raffleEntranceFee: ethers.utils.parseEther("0.01"), // 0.01 ETH
        callbackGasLimit: "500000", // 500,000 gas
    },
}

const developmentChains = ["hardhat", "localhost"]
const DECIMALS = 8
const INITIAL_ANSER = 200000000000

module.exports = {
    networkConfig,
    developmentChains,
    DECIMALS,
    INITIAL_ANSER
}