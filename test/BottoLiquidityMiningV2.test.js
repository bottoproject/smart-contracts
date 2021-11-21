const { expect } = require("chai");
const {
    expectEvent,
    expectRevert,
    time,
} = require("@openzeppelin/test-helpers");
const { deployProxy, upgradeProxy } = require("@openzeppelin/truffle-upgrades");
const { toBN } = web3.utils;

const BOTTO = artifacts.require("BOTTO");
const BottoLiquidityMining = artifacts.require("BottoLiquidityMining");
const BottoLiquidityMiningV2 = artifacts.require(
    "BottoLiquidityMiningV2"
);
const MockERC20 = artifacts.require("MockERC20");

contract("BottoLiquidityMiningV2", (accounts, network) => {
    const [owner, staker1, staker2] = accounts;
    const initialSupply = toBN("21000000000000000000000000");
    const initialBottoEthSupply = toBN("50000000000000000000000");
    const staker1Initial = toBN("12000000000000");
    const staker2Initial = toBN("24000000000000");
    const totalRewards = toBN("60000000000000000000000");
    const stakingDuration = time.duration.years(2);

    beforeEach(async function() {
        this.botto = await BOTTO.new("Botto", "BOTTO", initialSupply);
        this.bottoEth = await MockERC20.new("BottoEth", "BOTTOETH");
        await this.bottoEth.mint(owner, initialBottoEthSupply);
        this.miningProxy = await deployProxy(BottoLiquidityMining, [
            this.bottoEth.address,
            this.botto.address,
        ]);
    });

    context("deposit reward tokens", function() {
        beforeEach(async function() {
            start = (await time.latest()).add(time.duration.minutes(5));
            end = start.add(stakingDuration);
            await this.botto.transfer(this.miningProxy.address, totalRewards);
            tx = await this.miningProxy.deposit(totalRewards, start, end);
        });

        context("advance to start time", function() {
            beforeEach(async function() {
                await time.increaseTo(start);
            });

            context("staker1 stakes", function() {
                beforeEach(async function() {
                    await this.bottoEth.transfer(staker1, staker1Initial);
                    await this.bottoEth.approve(
                        this.miningProxy.address,
                        staker1Initial,
                        { from: staker1 }
                    );
                    tx1 = await this.miningProxy.stake(staker1Initial, { from: staker1 });
                });

                it("has expected total stake", async function() {
                    expect(await this.miningProxy.totalStake()).to.be.bignumber.equal(
                        staker1Initial
                    );
                });

                it("has expected staker1 stake", async function() {
                    expect(
                        await this.miningProxy.totalUserStake(staker1)
                    ).to.be.bignumber.equal(staker1Initial);
                });

                it("has expected first stake time", async function() {
                    firstStakeTime = String(
                        (await web3.eth.getBlock(tx1.receipt.blockNumber)).timestamp
                    );
                    expect(await this.miningProxy.firstStakeTime()).to.be.bignumber.equal(
                        firstStakeTime
                    );
                });

                context("staker2 stakes", function() {
                    /*
                    beforeEach(async function () {
                      await this.bottoEth.transfer(staker2, staker2Initial);
                      await this.bottoEth.approve(
                        this.miningProxy.address,
                        staker2Initial,
                        { from: staker2 }
                      );
                      tx2 = await this.miningProxy.stake(staker2Initial, { from: staker2 });
                    });
            
                    it("has expected total stake", async function () {
                      expect(await this.miningProxy.totalStake()).to.be.bignumber.equal(
                      staker1Initial.add(staker2Initial)
                      );
                    });
            
                    it("has expected staker2 stake", async function () {
                      expect(
                        await this.miningProxy.totalUserStake(staker2)
                      ).to.be.bignumber.equal(staker2Initial);
                    });
                    */

                    context("advance to half stake time", function() {
                        beforeEach(async function() {
                            // totalStakeForPeriod = staker1Initial.add(staker2Initial);
                            totalStakeForPeriod = staker1Initial;
                            rewardPerSecond = totalRewards.div(stakingDuration);
                            stakingHalfPeriod = stakingDuration.div(toBN("2"));
                            await time.increaseTo(start.add(stakingHalfPeriod));
                            reward1 = await this.miningProxy.payout.call({ from: staker1 });
                            // reward2 = await this.miningProxy.payout.call({ from: staker2 });
                        });

                        it("staker1 has expected rewards", async function() {
                            expectedReward = stakingHalfPeriod.mul(rewardPerSecond).mul(staker1Initial).div(totalStakeForPeriod);
                            expect(reward1).to.be.bignumber.closeTo(
                                expectedReward, expectedReward.div(toBN("100000"))
                            );
                        });

                        context("upgrade contract", function() {
                            beforeEach(async function() {
                                miningProxy = await upgradeProxy(this.miningProxy.address, BottoLiquidityMiningV2);
                            });

                            it("staker1 has same rewards", async function() {
                                newReward1 = await miningProxy.payout.call({ from: staker1 });
                                expect(newReward1).to.be.bignumber.closeTo(reward1, reward1.div(toBN("100000")));
                            });

                            context("extend stake time", function() {
                                beforeEach(async function() {
                                    newEndTime = end.add(time.duration.years(2));
                                    txEndTime = await miningProxy.updateEndTime(newEndTime);
                                });

                                it("has expected first stake time", async function() {
                                    firstStakeTime = String(
                                        (await web3.eth.getBlock(txEndTime.receipt.blockNumber)).timestamp
                                    );
                                    expect(await miningProxy.firstStakeTime()).to.be.bignumber.equal(
                                        firstStakeTime
                                    );
                                });

                                it("has expected end time", async function() {
                                    expect(await this.miningProxy.endTime.call()).to.be.bignumber.equal(newEndTime);
                                });

                                it("staker1 has same rewards", async function() {
                                    newReward1 = await this.miningProxy.payout.call({ from: staker1 });
                                    expect(newReward1).to.be.bignumber.closeTo(reward1, reward1.div(toBN("100000")));
                                });

                                it("should have same total deposit rewards as the initial", async function() {
                                    let totalDepositRewards = await miningProxy.totalDepositRewards();
                                    expect(totalDepositRewards).to.be.bignumber.equal(totalRewards);
                                })

                                context("has expected rewards after extending the time", async function() {
                                    beforeEach(async function() {
                                        reward1 = await this.miningProxy.payout.call({ from: staker1 });
                                        firstStakeTime = await miningProxy.firstStakeTime();
                                        let endTime = await miningProxy.endTime();
                                        let totalRewards = await miningProxy.totalRewards();
                                        newStakingDuration = endTime.sub(firstStakeTime)
                                        rewardPerSecond = totalRewards.div(newStakingDuration)

                                        await time.increase(newStakingDuration.div(toBN("2")));
                                    });
                                    it("staker1 has expected rewards", async function() {
                                        let currentRewards = await this.miningProxy.payout.call({ from: staker1 });
                                        expectedReward = newStakingDuration
                                            .div(toBN("2"))
                                            .mul(rewardPerSecond)
                                            .mul(staker1Initial)
                                            .div(totalStakeForPeriod)
                                            .add(reward1)
                                        expect(currentRewards).to.be.bignumber.closeTo(
                                            expectedReward, expectedReward.div(toBN("100000"))
                                        );
                                    });
                                });
                                context("has expected rewards at endtime", async function() {
                                    beforeEach(async function() {
                                        let endTime = await miningProxy.endTime();
                                        await time.increaseTo(endTime);
                                    });
                                    it("staker1 has expected rewards", async function() {
                                        let { reward } = (await miningProxy.withdraw.call({ from: staker1 }));

                                        expect(reward).to.be.bignumber.closeTo(
                                            totalRewards, totalRewards.div(toBN("100000"))
                                        )
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
