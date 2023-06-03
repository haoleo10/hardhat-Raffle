const { network, getNamedAccounts, ethers, deployments } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle unit test", async () => {
          let raffle, raffleContract, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId
          beforeEach(async () => {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              //   deployer = accounts[0]
              player = accounts[1]
              //deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              raffleContract = await ethers.getContract("Raffle") // Returns a new connection to the Raffle contract
              raffle = raffleContract.connect(player) // Returns a new instance of the Raffle contract connected to player
              //raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })
          describe("constructor", async () => {
              it("是否成功初始化Raffle", async () => {
                  const raffleState = (await raffle.getRaffleState()).toString()
                  //const interval = await raffle.getInterval()
                  //raffleState is a bigNumber
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"])
              })
          })
          describe("enterRaffle", async () => {
              it("钱不够就revert", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Not__enoughETH")
              })
              //这边要弄清楚谁是谁
              it("记录参加游戏的人", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, player.address)
              })
              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      // emits RaffleEnter event if entered to index player(s) address
                      raffle,
                      "RaffleEnter"
                  )
              })
              //我们需要upkeepNeeded is true
              //我们需要模拟interval，因为interval如果是10天的话，我们不可能等10天
              //此时我们就需要==》hardhat network reference
              //special testing/debugging methods
              it("doesn't allow entrance when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  // we pretend to be a keeper for a second
                  await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      // is reverted as raffle is calculating
                      "Raffle__NotOpen"
                  )
              })
          })
          //现在测试checkUpKeep函数
          //checkUpKeep is a public function
          describe("checkUpkeep", async () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //await raffle.checkUpkeep：会启动一笔交易，但我不想发送交易，我想模拟一笔交易
                  //----->callstatic,模拟交易
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  await raffle.performUpkeep([]) // changes the state to calculating
                  const raffleState = await raffle.getRaffleState() // stores the new state
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("can only run if checkupkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })
              it("reverts if checkup is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                      "Raffle__UpkeepNotNeed"
                  )
              })
              it("updates the raffle state and emits a requestId", async () => {
                  // Too many asserts in this test!
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x") // emits requestId
                  const txReceipt = await txResponse.wait(1) // waits 1 block
                  const raffleState = await raffle.getRaffleState() // updates state
                  const requestId = txReceipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1) // 0 = open, 1 = calculating
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it("can only be called after performupkeep", async () => {
                  await expect(
                      //看vrfCoordinatorV2Mock源码
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
              })

              // This test is too big...
              // This test simulates users entering the raffle and wraps the entire functionality of the raffle
              // inside a promise that will resolve if everything is successful.
              // An event listener for the WinnerPicked is set up
              // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
              // All the assertions are done once the WinnerPicked event is fired
              //这部分要理清楚
              //一帮人进入游戏，然后我们想call performUpkeep and fulfillRandomWprds
              //模拟随机数被选出来了，
              //在一个测试网上，我们不知道交易什么时候完成，我们需要等，需要listen event
              //在这里local test,我们模拟了测试网上会发生的事情
              //once我们发现了event，我们开始测试，如果没有，就reject，如果超过某个时间还没有，就取消
              it("picks a winner, resets the raffle, and sends money", async () => {
                  const additionalEntrances = 3 // to test
                  const startingIndex = 2
                  //const accounts = await ethers.getSigners()
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      // i = 2; i < 5; i=i+1
                      raffle = raffleContract.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp() // stores starting timestamp (before we fire our event)

                  //需要一个listener
                  // This will be more important for our staging tests...
                  await new Promise(async (resolve, reject) => {
                      //listen to this WinnerPicked event事件，若此事发生，do sth
                      //在config的mocha设置时间，如果此事件在500s内没有被触发，就被视为失败
                      raffle.once("WinnerPicked", async () => {
                          // event listener for WinnerPicked
                          console.log("发现WinnerPicked event!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              // Now lets get the ending values...
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[2].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // Comparisons to check if our ending values are correct:
                              assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrances)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve() // if try passes, resolves the promise
                          } catch (e) {
                              reject(e) // if try fails, rejects the promise
                          }
                      })

                      // kicking off the event by mocking the chainlink keepers and vrf coordinator
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      const startingBalance = await accounts[2].getBalance()
                      //一旦fulfillRandomWords函数被调用，则应该emit a event,
                      //然后上面的raffle。once被setup
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
