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
const MockBottoLiquidityMining02 = artifacts.require(
  "MockBottoLiquidityMining02"
);
const MockERC20 = artifacts.require("MockERC20");

contract("BottoLiquidityMining", (accounts, network) => {
  const [owner, staker1, staker2, staker3] = accounts;
  const initialSupply = toBN("21000000000000000000000000");
  const initialBottoEthSupply = toBN("50000000000000000000000");
  const staker1Initial = toBN("12000000000000");
  const staker2Initial = toBN("24000000000000");
  const totalRewards = toBN("60000000000000000000000");
  const stakingDuration = time.duration.years(1);
  const rewardPerSecond = totalRewards.div(stakingDuration);

  beforeEach(async function () {
    this.botto = await BOTTO.new("Botto", "BOTTO", initialSupply);
    this.bottoEth = await MockERC20.new("BottoEth", "BOTTOETH");
    await this.bottoEth.mint(owner, initialBottoEthSupply);
    this.miningProxy = await deployProxy(BottoLiquidityMining, [
      this.bottoEth.address,
      this.botto.address,
    ]);
  });

  it("has expected BottoEth address", async function () {
    expect(await this.miningProxy.bottoEth()).to.equal(this.bottoEth.address);
  });

  it("owner has expected BottoEth balance", async function () {
    expect(await this.bottoEth.balanceOf(owner)).to.be.bignumber.equal(
      initialBottoEthSupply
    );
  });

  it("has expected BOTTO address", async function () {
    expect(await this.miningProxy.botto()).to.equal(this.botto.address);
  });

  it("has expected owner", async function () {
    expect(await this.miningProxy.owner()).to.equal(owner);
  });

  context("deposit reward tokens", function () {
    beforeEach(async function () {
      start = (await time.latest()).add(time.duration.minutes(5));
      end = start.add(stakingDuration);
      await this.botto.transfer(this.miningProxy.address, totalRewards);
      tx = await this.miningProxy.deposit(totalRewards, start, end);
    });

    it("emits a Deposit event", async function () {
      expectEvent(tx, "Deposit", {
        totalRewards: totalRewards,
        startTime: start,
        endTime: end,
      });
    });

    it("has expected BOTTO balance", async function () {
      expect(
        await this.botto.balanceOf(this.miningProxy.address)
      ).to.be.bignumber.equal(totalRewards);
    });

    it("has expected total rewards", async function () {
      expect(await this.miningProxy.totalRewards()).to.be.bignumber.equal(
        totalRewards
      );
    });

    it("has expected start time", async function () {
      expect(await this.miningProxy.startTime()).to.be.bignumber.equal(start);
    });

    it("has expected end time", async function () {
      expect(await this.miningProxy.endTime()).to.be.bignumber.equal(end);
    });

    it("has expected total stake", async function () {
      expect(await this.miningProxy.totalStake()).to.be.bignumber.equal("0");
    });

    it("has no stakers", async function () {
      expect(await this.miningProxy.totalStakers()).to.be.bignumber.equal("0");
    });

    it("has zero staker1 stake", async function () {
      expect(
        await this.miningProxy.totalUserStake(staker1)
      ).to.be.bignumber.equal("0");
    });

    it("has zero staker2 stake", async function () {
      expect(
        await this.miningProxy.totalUserStake(staker2)
      ).to.be.bignumber.equal("0");
    });

    it("cannot stake with 0 amount", async function () {
      await expectRevert(
        this.miningProxy.stake("0"),
        "LiquidityMining::stake: missing stake"
      );
    });

    it("cannot stake before start time", async function () {
      await expectRevert(
        this.miningProxy.stake(staker1Initial),
        "LiquidityMining::stake: staking isn't live yet"
      );
    });

    context("advance to start time", function () {
      beforeEach(async function () {
        await time.increaseTo(start);
      });

      it("reverts without tokens approved for staking", async function () {
        await expectRevert(
          this.miningProxy.stake(staker1Initial, { from: staker1 }),
          "TransferHelper::transferFrom: transferFrom failed"
        );
      });

      context("staker1 & 2 stake at the same time", function () {
        beforeEach(async function () {
          await this.bottoEth.transfer(staker1, staker1Initial);
          await this.bottoEth.transfer(staker2, staker2Initial);
          await this.bottoEth.approve(
            this.miningProxy.address,
            staker1Initial,
            { from: staker1 }
          );
          await this.bottoEth.approve(
            this.miningProxy.address,
            staker2Initial,
            { from: staker2 }
          );
          tx1 = await this.miningProxy.stake(staker1Initial, { from: staker1 });
          tx2 = await this.miningProxy.stake(staker2Initial, { from: staker2 });
        });

        it("emits Stake events", async function () {
          expectEvent(tx1, "Stake", {
            staker: staker1,
            bottoEthIn: staker1Initial,
          });
          expectEvent(tx2, "Stake", {
            staker: staker2,
            bottoEthIn: staker2Initial,
          });
        });

        it("has expected total stake", async function () {
          expect(await this.miningProxy.totalStake()).to.be.bignumber.equal(
            staker1Initial.add(staker2Initial)
          );
        });

        it("has expected staker1 stake", async function () {
          expect(
            await this.miningProxy.totalUserStake(staker1)
          ).to.be.bignumber.equal(staker1Initial);
        });

        it("has expected staker2 stake", async function () {
          expect(
            await this.miningProxy.totalUserStake(staker2)
          ).to.be.bignumber.equal(staker2Initial);
        });

        it("has expected first stake time", async function () {
          firstStakeTime = String(
            (await web3.eth.getBlock(tx1.receipt.blockNumber)).timestamp
          );
          expect(await this.miningProxy.firstStakeTime()).to.be.bignumber.equal(
            firstStakeTime
          );
        });

        it("has two total stakers", async function () {
          expect(await this.miningProxy.totalStakers()).to.be.bignumber.equal(
            "2"
          );
        });

        context("staker1 calls payout at half time", function () {
          beforeEach(async function () {
            stakingHalfPeriod = stakingDuration.div(toBN("2"));
            await time.increaseTo(start.add(stakingHalfPeriod));
            reward1 = await this.miningProxy.payout.call({ from: staker1 });
            tx = await this.miningProxy.payout({ from: staker1 });
          });

          it("has expected reward", async function () {
            totalStakeForPeriod = staker1Initial.add(staker2Initial);
            expectedReward = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(staker1Initial)
              .div(totalStakeForPeriod);
            expect(reward1).to.be.bignumber.closeTo(
              expectedReward,
              expectedReward.div(toBN("100000"))
            );
          });

          it("emits a Payout event", async function () {
            expectEvent(tx, "Payout", {
              staker: staker1 /* reward: reward1 */,
            });
          });

          it("contract has staker1 claimed rewards", async function () {
            expect(
              await this.miningProxy.userClaimedRewards(staker1)
            ).to.be.bignumber.equal(reward1);
          });

          it("staker1 has expected BOTTO rewards", async function () {
            expect(await this.botto.balanceOf(staker1)).to.be.bignumber.equal(
              reward1
            );
          });

          it("staker1 has not removed stake", async function () {
            expect(
              await this.bottoEth.balanceOf(staker1)
            ).to.be.bignumber.equal("0");
          });

          context("advance to after staking ends", function () {
            beforeEach(async function () {
              await time.increase(stakingDuration);
            });

            it("reverts when staking after end time", async function () {
              await this.bottoEth.transfer(staker3, staker1Initial);
              await this.bottoEth.approve(
                this.miningProxy.address,
                staker1Initial,
                { from: staker3 }
              );
              await expectRevert(
                this.miningProxy.stake(staker1Initial, { from: staker3 }),
                "LiquidityMining::stake: staking is over"
              );
            });

            it("reverts when payout/restake after end", async function () {
              await expectRevert(
                this.miningProxy.payout({ from: staker2 }),
                "LiquidityMining::payout: withdraw instead"
              );
            });

            context("request withdraw for staker 2", function () {
              beforeEach(async function () {
                reward = (
                  await this.miningProxy.withdraw.call({ from: staker2 })
                ).reward;
                tx = await this.miningProxy.withdraw({ from: staker2 });
              });

              it("has expected reward", async function () {
                totalStakeForPeriod = staker1Initial.add(staker2Initial);
                expectedReward = stakingDuration
                  .mul(rewardPerSecond)
                  .mul(staker2Initial)
                  .div(totalStakeForPeriod);
                expect(reward).to.be.bignumber.closeTo(
                  expectedReward,
                  expectedReward.div(toBN("100000"))
                );
              });

              it("emits a Payout & Withdraw event", async function () {
                expectEvent(tx, "Payout", {
                  staker: staker2 /* reward: reward */,
                });
                expectEvent(tx, "Withdraw", {
                  staker: staker2,
                  bottoEthOut: staker2Initial,
                });
              });

              it("contract has staker2 claimed rewards", async function () {
                expect(
                  await this.miningProxy.userClaimedRewards(staker2)
                ).to.be.bignumber.equal(reward);
              });

              it("has one total staker", async function () {
                expect(
                  await this.miningProxy.totalStakers()
                ).to.be.bignumber.equal("1");
              });

              it("staker2 has expected BOTTO rewards", async function () {
                expect(
                  await this.botto.balanceOf(staker2)
                ).to.be.bignumber.equal(reward);
              });

              it("staker2 has expected BottoEth balance", async function () {
                expect(
                  await this.bottoEth.balanceOf(staker2)
                ).to.be.bignumber.equal(staker2Initial);
              });

              context("request withdraw for staker 1", function () {
                beforeEach(async function () {
                  reward2 = (
                    await this.miningProxy.withdraw.call({ from: staker1 })
                  ).reward;
                  tx = await this.miningProxy.withdraw({ from: staker1 });
                });

                it("has expected reward", async function () {
                  totalStakeForPeriod = staker1Initial.add(staker2Initial);
                  expectedReward = stakingHalfPeriod
                    .mul(rewardPerSecond)
                    .mul(staker1Initial)
                    .div(totalStakeForPeriod);
                  expect(reward2).to.be.bignumber.closeTo(
                    expectedReward,
                    expectedReward.div(toBN("100000"))
                  );
                });

                it("emits a Payout & Withdraw event", async function () {
                  expectEvent(tx, "Payout", {
                    staker: staker1 /* reward: reward2 */,
                  });
                  expectEvent(tx, "Withdraw", {
                    staker: staker1,
                    bottoEthOut: staker1Initial,
                  });
                });

                it("staker1 has expected BOTTO rewards", async function () {
                  expect(
                    await this.botto.balanceOf(staker1)
                  ).to.be.bignumber.equal(reward1.add(reward2));
                });

                it("staker1 has expected BottoEth balance", async function () {
                  expect(
                    await this.bottoEth.balanceOf(staker1)
                  ).to.be.bignumber.equal(staker1Initial);
                });

                it("contract has no remaining stakers", async function () {
                  expect(
                    await this.miningProxy.totalStakers()
                  ).to.be.bignumber.equal("0");
                });

                it("contract has no remaining rewards", async function () {
                  expect(
                    await this.botto.balanceOf(this.miningProxy.address)
                  ).to.be.bignumber.closeTo("0", "20000000");
                });

                it("contract has no remaining stakes", async function () {
                  expect(
                    await this.bottoEth.balanceOf(this.miningProxy.address)
                  ).to.be.bignumber.equal("0");
                });
              });
            });
          });
        });
      });
    });

    context("upgrade contract to 02", function () {
      beforeEach(async function () {
        // the upgrade function doesn't change the deployed implementation address on each iteration
        this.miningProxy = await upgradeProxy(
          this.miningProxy.address,
          MockBottoLiquidityMining02
        );
      });

      it("implementation contracts have same proxy address", async function () {
        expect(BottoLiquidityMining.address).to.be.equal(
          MockBottoLiquidityMining02.address
        );
      });

      it("cannot deposit to upgraded contract with non-zero value", async function () {
        await expectRevert(
          this.miningProxy.stake("100"),
          "Invalid amount after upgrade"
        );
      });

      it("cannot recover as non-owner on new contract", async function () {
        await expectRevert(
          this.miningProxy.rescueTokens(this.bottoEth.address, staker3, "1", {
            from: staker3,
          }),
          "Ownable: caller is not the owner"
        );
      });

      it("can call new function as owner", async function () {
        expect(await this.miningProxy.ownershipTest(false)).to.be.true;
      });

      it("cannot call new function as non-owner", async function () {
        await expectRevert(
          this.miningProxy.ownershipTest(true, { from: staker1 }),
          "Ownable: caller is not the owner"
        );
      });

      it("emits new event on stake", async function () {
        tx = await this.miningProxy.stake("2000");
        await expectEvent(tx, "Stake2", { staker: owner, bottoEthIn: "2000" });
      });
    });
  });
});
