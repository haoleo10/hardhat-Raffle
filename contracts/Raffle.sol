// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
error Not__enoughETH();
error Raffle__TransferFailed();
error Raffle__NotOpen();
error Raffle__UpkeepNotNeed(uint256 currentBalance, uint256 numPlayers, uint256 reffleState);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /*Type variable*/
    enum RaffleState {
        OPEN,
        CALCULATING
    }//uint256 0 = OPEN, 1 = CALCULATING
    /*state variable*/
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATION = 3;
    uint32 private immutable NUM_WORDS = 1;

    //raffle variable
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    //event
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    //function
    constructor(
        address vrfCoordinatorV2,//contract address
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Not__enoughETH();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__NotOpen();
        }
        s_players.push(payable(msg.sender));
        //emin an event when updating a dynamic array or mapping
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that chainlink keeper nodes call
     * they look for the 'upkeepNeeded' to return true.
     * in order to return true必须满足以下几点：
     * 1. 到达规定的间隔时间
     * 2. 这个游戏至少有一名玩家，并且有ETH
     * 3. Our Subscription is funded with link
     * 4. the Raffle should be in "open"
     * checkUpkeep检查以上4项内容，如果都满足条件，就会trigger the chain link keepers,
     * to request a new random winner
     *
     */

    function checkUpkeep(
        bytes memory /* checkData */
    ) public override returns (bool upkeepNeeded, bytes memory /*performData*/) {
        bool isopen = (RaffleState.OPEN == s_raffleState);
        //block.time - last block.time
        bool timePassed = (block.timestamp - s_lastTimeStamp) > i_interval;
        bool hasPlayers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isopen && timePassed && hasBalance && hasPlayers);
    }

    //这个方法被chainlink keeper network 调用
    //external is a little bit cheaper than public function
    //because solidity know that our own contract can't call this

    function performUpkeep(bytes calldata /*performData*/) external override {
        //1. request a random number
        //2. once we get one, do sth with it
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeed(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }

        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //keyhash
            i_subscriptionId,
            REQUEST_CONFIRMATION,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal override {
        //randomWords[0]是因为我们只要了一个random number
        uint256 indeOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indeOfWinner];
        s_recentWinner = recentWinner;
        //reset raffle state
        s_raffleState = RaffleState.OPEN;
        //reset players
        s_players = new address payable[](0);
        //reset timestamp
        s_lastTimeStamp = block.timestamp;

        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }
        //trace the winners
        emit WinnerPicked(recentWinner);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATION;
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }
}
