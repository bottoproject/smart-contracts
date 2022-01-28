const { expect } = require("chai");
const {
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const { deployProxy, upgradeProxy } = require("@openzeppelin/truffle-upgrades");
const { toBN, fromWei } = web3.utils;

const BOTTO = artifacts.require("BOTTO");
const BottoGovernanceV2 = artifacts.require("BottoGovernanceV2");
const MockBottoGovernance03 = artifacts.require("MockBottoGovernance03");
const MockERC20 = artifacts.require("MockERC20");

contract("BottoGovernanceV2", (accounts) => {
  const [owner, staker1, staker2, staker3, earlyStaker, beneficiary] = accounts;
  const initialSupply = toBN("21000000000000000000000000");
  const staker1Initial = toBN("1000000000");
  const staker2Initial = toBN("25000000000");
  const staker3Initial = staker1Initial;
  const earlyStakerInitial = toBN("1000000000");
  const totalRewards = toBN("60000000000000000000000");
  const stakingDuration = time.duration.years(1);
  const rewardPerSecond = totalRewards.div(stakingDuration);

  beforeEach(async function () {
    this.botto = await BOTTO.new("Botto", "BOTTO", initialSupply);
    this.governanceProxy = await deployProxy(BottoGovernanceV2, [
      this.botto.address,
    ]);
    await this.botto.transfer(staker1, staker1Initial);
    await this.botto.transfer(staker2, staker2Initial);
    await this.botto.transfer(earlyStaker, earlyStakerInitial);
  });

  it("staker 1 has expected balance", async function () {
    expect(await this.botto.balanceOf(staker1)).to.be.bignumber.equal(
      staker1Initial
    );
  });

  it("staker 2 has expected balance", async function () {
    expect(await this.botto.balanceOf(staker2)).to.be.bignumber.equal(
      staker2Initial
    );
  });

  it("contract has zero total staked", async function () {
    expect(await this.governanceProxy.totalStaked()).to.be.bignumber.equal("0");
  });

  context("token staking no active rewards", function () {
    it("has not BOTTO balance", async function () {
      expect(
        await this.botto.balanceOf(this.governanceProxy.address)
      ).to.be.bignumber.equal("0");
    });

    it("has not total rewards", async function () {
      expect(await this.governanceProxy.totalRewards()).to.be.bignumber.equal(
        "0"
      );
    });

    it("has not start rewards time", async function () {
      expect(
        await this.governanceProxy.startRewardsTime()
      ).to.be.bignumber.equal("0");
    });

    it("has not rewards time", async function () {
      expect(await this.governanceProxy.endRewardsTime()).to.be.bignumber.equal(
        "0"
      );
    });

    it("cannot stake with 0 amount", async function () {
      await expectRevert(
        this.governanceProxy.stake("0"),
        "Governance::stake: missing stake"
      );
    });

    it("cannot stake without approval", async function () {
      await expectRevert(
        this.governanceProxy.stake("100", { from: staker2 }),
        "ERC20: transfer amount exceeds allowance."
      );
    });

    context("approval provided", function () {
      beforeEach(async function () {
        staker1Amount = toBN("100000");
        staker2Amount = toBN("25000");
        await this.botto.approve(this.governanceProxy.address, staker1Amount, {
          from: staker1,
        });
        await this.botto.approve(this.governanceProxy.address, staker2Amount, {
          from: staker2,
        });
      });

      it("cannot stake more than approved amount", async function () {
        await expectRevert(
          this.governanceProxy.stake(staker1Amount.add(toBN("1")), {
            from: staker1,
          }),
          "ERC20: transfer amount exceeds allowance."
        );
      });

      context("staker 1 stakes tokens", function () {
        beforeEach(async function () {
          tx = await this.governanceProxy.stake(staker1Amount, {
            from: staker1,
          });
        });

        it("emits a Staked event", async function () {
          expectEvent(tx, "Staked", { staker: staker1, amount: staker1Amount });
        });

        it("has transfered expected tokens to contract", async function () {
          expect(
            await this.botto.balanceOf(this.governanceProxy.address)
          ).to.be.bignumber.equal(staker1Amount);
        });

        it("has registered stake", async function () {
          stakeData = await this.governanceProxy.userStakes(staker1);
          expect(stakeData).to.be.bignumber.equal(staker1Amount);
        });

        it("contract has expected total staked", async function () {
          expect(
            await this.governanceProxy.totalStaked()
          ).to.be.bignumber.equal(staker1Amount);
        });

        context("staker 1 stakes more tokens", function () {
          beforeEach(async function () {
            staker1MoreAmount = toBN("200000");
            await this.botto.approve(
              this.governanceProxy.address,
              staker1MoreAmount,
              { from: staker1 }
            );
            await this.governanceProxy.stake(staker1MoreAmount, {
              from: staker1,
            });
          });

          it("has registered stake with full token amount", async function () {
            stakeData = await this.governanceProxy.userStakes(staker1);
            expect(stakeData).to.be.bignumber.equal(
              staker1Amount.add(staker1MoreAmount)
            );
          });

          it("contract has expected total staked", async function () {
            expect(
              await this.governanceProxy.totalStaked()
            ).to.be.bignumber.equal(staker1Amount.add(staker1MoreAmount));
          });
        });

        context("staker 2 stakes tokens", function () {
          beforeEach(async function () {
            tx = await this.governanceProxy.stake(staker2Amount, {
              from: staker2,
            });
          });

          it("emits a Staked event", async function () {
            expectEvent(tx, "Staked", {
              staker: staker2,
              amount: staker2Amount,
            });
          });

          it("has transfered expected tokens to contract", async function () {
            expect(
              await this.botto.balanceOf(this.governanceProxy.address)
            ).to.be.bignumber.equal(staker1Amount.add(staker2Amount));
          });

          it("contract has expected total staked", async function () {
            expect(
              await this.governanceProxy.totalStaked()
            ).to.be.bignumber.equal(staker1Amount.add(staker2Amount));
          });

          it("has registered stake", async function () {
            stakeData = await this.governanceProxy.userStakes(staker2);
            expect(stakeData).to.be.bignumber.equal(staker2Amount);
          });

          context("staker 2 stakes more tokens", function () {
            beforeEach(async function () {
              staker2MoreAmount = toBN("400000");
              await this.botto.approve(
                this.governanceProxy.address,
                staker2MoreAmount,
                { from: staker2 }
              );
              await this.governanceProxy.stake(staker2MoreAmount, {
                from: staker2,
              });
            });

            it("has registered stake with full token amount", async function () {
              stakeData = await this.governanceProxy.userStakes(staker2);
              expect(stakeData).to.be.bignumber.equal(
                staker2Amount.add(staker2MoreAmount)
              );
            });

            it("contract has expected total staked", async function () {
              expect(
                await this.governanceProxy.totalStaked()
              ).to.be.bignumber.equal(
                staker1Amount.add(staker2Amount).add(staker2MoreAmount)
              );
            });
          });
        });

        it("cannot tranfer ownership as non-owner", async function () {
          await expectRevert(
            this.governanceProxy.transferOwnership(beneficiary, {
              from: beneficiary,
            }),
            "Ownable: caller is not the owner"
          );
        });

        context("upgrade contract to 02", function () {
          beforeEach(async function () {
            // the upgrade function doesn't change the deployed implementation address on each iteration
            this.governanceProxy = await upgradeProxy(
              this.governanceProxy.address,
              MockBottoGovernance03
            );
          });

          it("implementation contracts have same proxy address", async function () {
            expect(BottoGovernanceV2.address).to.be.equal(
              MockBottoGovernance03.address
            );
          });

          it("BOTTO token the same for each contract via proxy", async function () {
            let testGov1 = await BottoGovernanceV2.at(
              this.governanceProxy.address
            );
            let testGov2 = await MockBottoGovernance03.at(
              this.governanceProxy.address
            );
            expect(await testGov1.botto()).to.be.equal(await testGov2.botto());
          });

          it("contract has total staked", async function () {
            expect(
              await this.governanceProxy.totalStaked()
            ).to.be.bignumber.equal(staker1Amount);
          });

          it("cannot stake to upgraded contract with non-zero value", async function () {
            await expectRevert(
              this.governanceProxy.stake("10"),
              "Invalid amount after upgrade"
            );
          });

          it("cannot recover as non-owner on new contract", async function () {
            dummyERC20 = await MockERC20.new("Dummy", "DUM");
            await expectRevert(
              this.governanceProxy.recover(dummyERC20.address, beneficiary, {
                from: beneficiary,
              }),
              "Ownable: caller is not the owner"
            );
          });

          it("can call new function as owner", async function () {
            expect(await this.governanceProxy.ownershipTest(false)).to.be.true;
          });

          it("cannot call new function as non-owner", async function () {
            await expectRevert(
              this.governanceProxy.ownershipTest(true, { from: staker1 }),
              "Ownable: caller is not the owner"
            );
          });

          context("staker 2 stakes tokens via upgraded contract", function () {
            beforeEach(async function () {
              await this.botto.approve(
                this.governanceProxy.address,
                staker2Amount,
                { from: staker2 }
              );
              tx = await this.governanceProxy.stake(staker2Amount, {
                from: staker2,
              });
            });

            it("emits a Staked2 event", async function () {
              expectEvent(tx, "Staked2", {
                staker: staker2,
                amount: staker2Amount,
              });
            });
          });
        });
      });
    });
    context("token unstaking with no active rewards", function () {
      beforeEach(async function () {
        staker1Amount = toBN("100000");
        await this.botto.approve(this.governanceProxy.address, staker1Amount, {
          from: staker1,
        });
        await this.governanceProxy.stake(staker1Amount, { from: staker1 });
      });

      it("cannot unstake from user without a stake", async function () {
        await expectRevert(
          this.governanceProxy.unstake({ from: staker2 }),
          "Governance::_applyReward: no botto staked"
        );
      });

      context("staker 1 unstakes", function () {
        beforeEach(async function () {
          await this.governanceProxy.unstake({ from: staker1 });
        });

        it("staker 1 has expected balance", async function () {
          expect(await this.botto.balanceOf(staker1)).to.be.bignumber.equal(
            staker1Initial
          );
        });

        it("contract has expected balance", async function () {
          expect(
            await this.botto.balanceOf(this.governanceProxy.address)
          ).to.be.bignumber.equal("0");
        });

        it("contract has expected total staked", async function () {
          expect(
            await this.governanceProxy.totalStaked()
          ).to.be.bignumber.equal("0");
        });

        it("cannot unstake again", async function () {
          await expectRevert(
            this.governanceProxy.unstake({ from: staker1 }),
            "Governance::_applyReward: no botto staked"
          );
        });
      });
    });
  });

  context("deposit reward tokens", function () {
    beforeEach(async function () {
      start = (await time.latest()).add(time.duration.minutes(5));
      end = start.add(stakingDuration);
      await this.botto.approve(
        this.governanceProxy.address,
        earlyStakerInitial,
        {
          from: earlyStaker,
        }
      );
      await this.governanceProxy.stake(earlyStakerInitial, {
        from: earlyStaker,
      });
      await this.botto.transfer(this.governanceProxy.address, totalRewards);
      tx = await this.governanceProxy.deposit(totalRewards, start, end);
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
        await this.botto.balanceOf(this.governanceProxy.address)
      ).to.be.bignumber.equal(totalRewards.add(earlyStakerInitial));
    });

    it("has expected total rewards", async function () {
      expect(await this.governanceProxy.totalRewards()).to.be.bignumber.equal(
        totalRewards
      );
    });

    it("has expected start time", async function () {
      expect(
        await this.governanceProxy.startRewardsTime()
      ).to.be.bignumber.equal(start);
    });

    it("has expected end time", async function () {
      expect(await this.governanceProxy.endRewardsTime()).to.be.bignumber.equal(
        end
      );
    });

    it("has expected total stake", async function () {
      expect(await this.governanceProxy.totalStaked()).to.be.bignumber.equal(
        earlyStakerInitial
      );
    });

    it("has zero staker1 stake", async function () {
      expect(
        await this.governanceProxy.userStakes(staker1)
      ).to.be.bignumber.equal("0");
    });

    it("has zero staker2 stake", async function () {
      expect(
        await this.governanceProxy.userStakes(staker2)
      ).to.be.bignumber.equal("0");
    });

    it("cannot stake with 0 amount", async function () {
      await expectRevert(
        this.governanceProxy.stake("0"),
        "Governance::stake: missing stake"
      );
    });

    it("has expected earlyStaker stake", async function () {
      expect(
        await this.governanceProxy.userStakes(earlyStaker)
      ).to.be.bignumber.equal(earlyStakerInitial);
    });

    context("early staker unstake before rewards time starts", function () {
      beforeEach(async function () {
        await time.increase(time.duration.minutes(2));
        earlyReward = await this.governanceProxy.payout.call({
          from: earlyStaker,
        });
        tx = await this.governanceProxy.unstake({ from: earlyStaker });
      });
      it("emits a Unstake event", async function () {
        expectEvent(tx, "Unstaked", {
          staker: earlyStaker,
          amount: earlyStakerInitial,
        });
      });
      it("has expected 0 rewards", async function () {
        expect(earlyReward).to.be.bignumber.equal("0");
      });
      it("early staker has expected BOTTO balance", async function () {
        expect(await this.botto.balanceOf(earlyStaker)).to.be.bignumber.equal(
          earlyStakerInitial
        );
      });
      it("staker2 has removed stake", async function () {
        expect(
          await this.governanceProxy.userStakes(earlyStaker)
        ).to.be.bignumber.equal("0");
      });
    });

    context("advance to start rewards time", function () {
      beforeEach(async function () {
        await time.increaseTo(start);
      });

      it("reverts without tokens approved for staking", async function () {
        await expectRevert(
          this.governanceProxy.stake(staker1Initial, { from: staker1 }),
          "ERC20: transfer amount exceeds allowance."
        );
      });

      context("staker 1 & 2 stake at the same time", function () {
        beforeEach(async function () {
          await this.botto.approve(
            this.governanceProxy.address,
            staker1Initial,
            { from: staker1 }
          );
          await this.botto.approve(
            this.governanceProxy.address,
            staker2Initial,
            { from: staker2 }
          );
          tx1 = await this.governanceProxy.stake(staker1Initial, {
            from: staker1,
          });
          tx2 = await this.governanceProxy.stake(staker2Initial, {
            from: staker2,
          });
        });

        it("emits Stake events", async function () {
          expectEvent(tx1, "Staked", {
            staker: staker1,
            amount: staker1Initial,
          });
          expectEvent(tx2, "Staked", {
            staker: staker2,
            amount: staker2Initial,
          });
        });

        it("has expected total stake", async function () {
          expect(
            await this.governanceProxy.totalStaked()
          ).to.be.bignumber.equal(
            staker1Initial.add(staker2Initial).add(earlyStakerInitial)
          );
        });

        it("has expected staker1 stake", async function () {
          expect(
            await this.governanceProxy.userStakes(staker1)
          ).to.be.bignumber.equal(staker1Initial);
        });

        it("has expected staker2 stake", async function () {
          expect(
            await this.governanceProxy.userStakes(staker2)
          ).to.be.bignumber.equal(staker2Initial);
        });

        it("has expected first stake time", async function () {
          firstStakeRewardsTime = String(
            (await web3.eth.getBlock(tx1.receipt.blockNumber)).timestamp
          );
          expect(
            await this.governanceProxy.firstStakeRewardsTime()
          ).to.be.bignumber.equal(firstStakeRewardsTime);
        });

        context("staker1 calls payout at half time", function () {
          beforeEach(async function () {
            stakingHalfPeriod = stakingDuration.div(toBN("2"));
            await time.increaseTo(start.add(stakingHalfPeriod));
            reward0Staker1 = await this.governanceProxy.payout.call({
              from: staker1,
            });
            tx = await this.governanceProxy.payout({ from: staker1 });
          });
          it("emits a Payout event", async function () {
            expectEvent(tx, "Payout", {
              staker: staker1 /* reward: reward1 */,
            });
          });
          it("has expected staker1 reward", async function () {
            totalStakeForPeriod = staker1Initial
              .add(staker2Initial)
              .add(earlyStakerInitial);
            expectedReward = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(staker1Initial)
              .div(totalStakeForPeriod);
            expect(reward0Staker1).to.be.bignumber.closeTo(
              expectedReward,
              expectedReward.div(toBN("100000"))
            );
          });
          it("contract has staker1 claimed rewards", async function () {
            expect(
              await this.governanceProxy.userClaimedRewards(staker1)
            ).to.be.bignumber.equal(reward0Staker1);
          });
          it("staker1 has expected BOTTO rewards", async function () {
            totalStakeForPeriod = staker1Initial
              .add(staker2Initial)
              .add(earlyStakerInitial);
            expectedReward = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(staker1Initial)
              .div(totalStakeForPeriod);

            expect(await this.botto.balanceOf(staker1)).to.be.bignumber.closeTo(
              reward0Staker1,
              expectedReward.div(toBN("100000"))
            );
          });

          it("staker1 has not removed stake", async function () {
            expect(
              await this.governanceProxy.userStakes(staker1)
            ).to.be.bignumber.equal(staker1Initial);
          });
        });

        context("early staker calls payout at half time", function () {
          beforeEach(async function () {
            stakingHalfPeriod = stakingDuration.div(toBN("2"));
            await time.increaseTo(start.add(stakingHalfPeriod));
            reward0Staker1 = await this.governanceProxy.payout.call({
              from: staker1,
            });
            tx = await this.governanceProxy.payout({ from: staker1 });
            earlyReward = await this.governanceProxy.payout.call({
              from: earlyStaker,
            });
            tx2 = await this.governanceProxy.payout({
              from: earlyStaker,
            });
          });

          it("emits a Payout event", async function () {
            expectEvent(tx2, "Payout", {
              staker: earlyStaker /* reward: reward1 */,
            });
          });

          it("has expected early staker reward", async function () {
            totalStakeForPeriod = staker1Initial
              .add(staker2Initial)
              .add(earlyStakerInitial);
            expectedRewardEarly = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(earlyStakerInitial)
              .div(totalStakeForPeriod);
            expect(earlyReward).to.be.bignumber.closeTo(
              expectedRewardEarly,
              expectedRewardEarly.div(toBN("100000"))
            );
          });

          it("contract has early staker claimed rewards", async function () {
            expect(
              await this.governanceProxy.userClaimedRewards(earlyStaker)
            ).to.be.bignumber.equal(earlyReward);
          });

          it("early staker has expected BOTTO rewards", async function () {
            totalStakeForPeriod = staker1Initial
              .add(staker2Initial)
              .add(earlyStakerInitial);
            expectedRewardEarly = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(earlyStakerInitial)
              .div(totalStakeForPeriod);

            const earlyStakerBalance = await this.botto.balanceOf(earlyStaker);
            expect(earlyStakerBalance).to.be.bignumber.closeTo(
              earlyReward,
              expectedRewardEarly.div(toBN("100000"))
            );
          });

          it("early staker has not removed stake", async function () {
            expect(
              await this.governanceProxy.userStakes(earlyStaker)
            ).to.be.bignumber.equal(earlyStakerInitial);
          });
        });

        context("staker2 calls unstake at half time", function () {
          beforeEach(async function () {
            stakingHalfPeriod = stakingDuration.div(toBN("2"));
            await time.increaseTo(start.add(stakingHalfPeriod));
            reward0Staker2 = await this.governanceProxy.payout.call({
              from: staker2,
            });
            tx2 = await this.governanceProxy.unstake({ from: staker2 });
          });
          it("emits a Payout event", async function () {
            expectEvent(tx2, "Payout", {
              staker: staker2 /* reward: reward1 */,
            });
            expectEvent(tx2, "Unstaked", {
              staker: staker2,
              amount: staker2Initial,
            });
          });

          it("has expected staker2 reward", async function () {
            totalStakeForPeriod = staker1Initial
              .add(staker2Initial)
              .add(earlyStakerInitial);
            expectedReward = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(staker2Initial)
              .div(totalStakeForPeriod);
            expect(reward0Staker2).to.be.bignumber.closeTo(
              expectedReward,
              expectedReward.div(toBN("100000"))
            );
          });

          it("contract has staker2 claimed rewards", async function () {
            expect(
              await this.governanceProxy.userClaimedRewards(staker2)
            ).to.be.bignumber.equal(reward0Staker2);
          });

          it("staker2 has expected BOTTO rewards", async function () {
            totalStakeForPeriod = staker1Initial
              .add(staker2Initial)
              .add(earlyStakerInitial);
            expectedReward = stakingHalfPeriod
              .mul(rewardPerSecond)
              .mul(staker2Initial)
              .div(totalStakeForPeriod);

            expect(await this.botto.balanceOf(staker2)).to.be.bignumber.closeTo(
              reward0Staker2.add(staker2Initial),
              expectedReward.div(toBN("100000"))
            );
          });

          it("staker2 has removed stake", async function () {
            expect(
              await this.governanceProxy.userStakes(staker2)
            ).to.be.bignumber.equal("0");
          });
        });

        context("advance to after rewards ends", function () {
          beforeEach(async function () {
            await time.increase(stakingDuration);
          });
          context("staker3 stakes after staking rewards ends", function () {
            beforeEach(async function () {
              await this.botto.transfer(staker3, staker3Initial);
              await this.botto.approve(
                this.governanceProxy.address,
                staker3Initial,
                { from: staker3 }
              );
              tx3 = await this.governanceProxy.stake(staker3Initial, {
                from: staker3,
              });
            });
            it("emits Stake events", async function () {
              expectEvent(tx3, "Staked", {
                staker: staker3,
                amount: staker3Initial,
              });
            });

            it("has reached endRewardsTime", async function () {
              stakeTime = String(
                (await web3.eth.getBlock(tx3.receipt.blockNumber)).timestamp
              );
              endRewardsTime = await this.governanceProxy.endRewardsTime();
              expect(stakeTime).to.be.bignumber.at.least(endRewardsTime);
            });

            it("has expected total stake", async function () {
              expect(
                await this.governanceProxy.totalStaked()
              ).to.be.bignumber.equal(
                staker1Initial
                  .add(staker2Initial)
                  .add(staker3Initial)
                  .add(earlyStakerInitial)
              );
            });

            it("has expected staker3 stake", async function () {
              expect(
                await this.governanceProxy.userStakes(staker3)
              ).to.be.bignumber.equal(staker3Initial);
            });

            context("staker3 unstakes after some time", function () {
              beforeEach(async function () {
                await time.increase(time.duration.days(10));
                reward3 = await this.governanceProxy.payout.call({
                  from: staker3,
                });
                tx4 = await this.governanceProxy.unstake({
                  from: staker3,
                });
              });

              it("emits Unstake event", async function () {
                expectEvent(tx4, "Unstaked", {
                  staker: staker3,
                  amount: staker3Initial,
                });
              });

              it("staker3 has no rewards", async function () {
                expect(reward3).to.be.bignumber.equal("0");
              });

              it("contract has no staker3 claimed rewards", async function () {
                expect(
                  await this.governanceProxy.userClaimedRewards(staker3)
                ).to.be.bignumber.equal("0");
              });

              it("staker3 has no expected BOTTO rewards", async function () {
                expect(
                  await this.botto.balanceOf(staker3)
                ).to.be.bignumber.equal(staker3Initial);
              });

              it("staker3 has removed stake", async function () {
                expect(
                  await this.governanceProxy.userStakes(staker3)
                ).to.be.bignumber.equal("0");
              });
            });
          });
          context("staker1 unstakes after rewards ends", function () {
            beforeEach(async function () {
              reward1Staker1 = await this.governanceProxy.payout.call({
                from: staker1,
              });
              tx4 = await this.governanceProxy.unstake({
                from: staker1,
              });
            });
            it("emits a Payout event", async function () {
              expectEvent(tx4, "Payout", {
                staker: staker1 /* reward: reward1 */,
              });
              expectEvent(tx4, "Unstaked", {
                staker: staker1,
                amount: staker1Initial,
              });
            });

            it("has expected staker1 reward", async function () {
              totalStakeForPeriod = staker1Initial
                .add(staker2Initial)
                .add(earlyStakerInitial);
              expectedReward = stakingDuration
                .mul(rewardPerSecond)
                .mul(staker1Initial)
                .div(totalStakeForPeriod);
              expect(reward1Staker1).to.be.bignumber.closeTo(
                expectedReward,
                expectedReward.div(toBN("100000"))
              );
            });

            it("contract has staker1 claimed rewards", async function () {
              expect(
                await this.governanceProxy.userClaimedRewards(staker1)
              ).to.be.bignumber.equal(reward1Staker1);
            });

            it("staker1 has expected BOTTO rewards", async function () {
              totalStakeForPeriod = staker1Initial
                .add(staker2Initial)
                .add(earlyStakerInitial);
              expectedReward = stakingDuration
                .mul(rewardPerSecond)
                .mul(staker1Initial)
                .div(totalStakeForPeriod);

              expect(
                await this.botto.balanceOf(staker1)
              ).to.be.bignumber.closeTo(
                reward1Staker1.add(staker1Initial),
                expectedReward.div(toBN("100000"))
              );
            });

            it("staker1 has removed stake", async function () {
              expect(
                await this.governanceProxy.userStakes(staker1)
              ).to.be.bignumber.equal("0");
            });
          });
          context("early staker calls payout after rewards ends", function () {
            beforeEach(async function () {
              earlyStakerReward1 = await this.governanceProxy.payout.call({
                from: earlyStaker,
              });
              tx5 = await this.governanceProxy.payout({
                from: earlyStaker,
              });
            });
            it("emits a Payout event", async function () {
              expectEvent(tx5, "Payout", {
                staker: earlyStaker /* reward: reward1 */,
              });
            });
            it("has expected early staker reward", async function () {
              totalStakeForPeriod = staker1Initial
                .add(staker2Initial)
                .add(earlyStakerInitial);
              expectedReward = stakingDuration
                .mul(rewardPerSecond)
                .mul(staker1Initial)
                .div(totalStakeForPeriod);
              expect(earlyStakerReward1).to.be.bignumber.closeTo(
                expectedReward,
                expectedReward.div(toBN("100000"))
              );
            });

            it("contract has early staker claimed rewards", async function () {
              expect(
                await this.governanceProxy.userClaimedRewards(earlyStaker)
              ).to.be.bignumber.equal(earlyStakerReward1);
            });

            it("early staker has expected BOTTO rewards", async function () {
              totalStakeForPeriod = staker1Initial
                .add(staker2Initial)
                .add(earlyStakerInitial);
              expectedReward = stakingDuration
                .mul(rewardPerSecond)
                .mul(staker1Initial)
                .div(totalStakeForPeriod);

              expect(
                await this.botto.balanceOf(earlyStaker)
              ).to.be.bignumber.closeTo(
                earlyStakerReward1.add(earlyStakerInitial),
                expectedReward.div(toBN("100000"))
              );
            });

            it("staker2 has not removed stake", async function () {
              expect(
                await this.governanceProxy.userStakes(earlyStaker)
              ).to.be.bignumber.equal(earlyStakerInitial);
            });
          });
        });
      });
    });

    context("recover tokens", function () {
      beforeEach(async function () {
        extraAmount = toBN("1234567");
        await this.botto.transfer(this.governanceProxy.address, extraAmount);
        this.dummyERC20 = await MockERC20.new("Dummy", "DUM");
        await this.dummyERC20.mint(this.governanceProxy.address, extraAmount);
      });

      it("cannot recover as non-owner", async function () {
        await expectRevert(
          this.governanceProxy.recover(this.botto.address, owner, {
            from: staker1,
          }),
          "Ownable: caller is not the owner"
        );
      });

      context("recovers excess ERC20 tokens", function () {
        beforeEach(async function () {
          tx = await this.governanceProxy.recover(
            this.dummyERC20.address,
            beneficiary
          );
        });

        it("emits RecoveryTransfer event", async function () {
          await expectEvent(tx, "RecoveryTransfer", {
            token: this.dummyERC20.address,
            amount: extraAmount,
            recipient: beneficiary,
          });
        });

        it("contract has expected total balance", async function () {
          expect(
            await this.dummyERC20.balanceOf(this.governanceProxy.address)
          ).to.be.bignumber.equal("0");
        });

        it("beneficiary has expected token balance", async function () {
          expect(
            await this.dummyERC20.balanceOf(beneficiary)
          ).to.be.bignumber.equal(extraAmount);
        });
      });

      context("recovers excess BOTTO", function () {
        beforeEach(async function () {
          tx = await this.governanceProxy.recover(
            this.botto.address,
            beneficiary
          );
        });

        it("emits RecoveryTransfer event", async function () {
          await expectEvent(tx, "RecoveryTransfer", {
            token: this.botto.address,
            amount: extraAmount,
            recipient: beneficiary,
          });
        });

        it("contract has expected total balance", async function () {
          expect(
            await this.botto.balanceOf(this.governanceProxy.address)
          ).to.be.bignumber.equal(earlyStakerInitial.add(totalRewards));
        });

        it("beneficiary has expected BOTTO balance", async function () {
          expect(await this.botto.balanceOf(beneficiary)).to.be.bignumber.equal(
            extraAmount
          );
        });
      });
    });
  });
});
