const { expect } = require("chai");
const {
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const { deployProxy, upgradeProxy } = require("@openzeppelin/truffle-upgrades");
const { toBN } = web3.utils;

const BOTTO = artifacts.require("BOTTO");
const BottoGovernance = artifacts.require("BottoGovernance");
const MockBottoGovernance02 = artifacts.require("MockBottoGovernance02");
const MockERC20 = artifacts.require("MockERC20");

contract("BottoGovernance", (accounts) => {
  const [owner, staker1, staker2, beneficiary] = accounts;
  const initialSupply = toBN("21000000000000000000000000");
  const staker1Initial = toBN("1000000000");
  const staker2Initial = toBN("25000000000");

  beforeEach(async function () {
    this.botto = await BOTTO.new("Botto", "BOTTO", initialSupply);
    this.governanceProxy = await deployProxy(BottoGovernance, [
      this.botto.address,
    ]);
    await this.botto.transfer(staker1, staker1Initial);
    await this.botto.transfer(staker2, staker2Initial);
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

  context("token staking", function () {
    it("cannot stake with 0 amount", async function () {
      await expectRevert(this.governanceProxy.stake("0"), "Invalid amount");
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
              MockBottoGovernance02
            );
          });

          it("implementation contracts have same proxy address", async function () {
            expect(BottoGovernance.address).to.be.equal(
              MockBottoGovernance02.address
            );
          });

          it("BOTTO token the same for each contract via proxy", async function () {
            let testGov1 = await BottoGovernance.at(
              this.governanceProxy.address
            );
            let testGov2 = await MockBottoGovernance02.at(
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

    context("token unstaking", function () {
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
          "No existing stake"
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
            "No existing stake"
          );
        });
      });
    });

    context("recover tokens", function () {
      beforeEach(async function () {
        staker1Amount = toBN("100000");
        extraAmount = toBN("1234567");
        await this.botto.approve(this.governanceProxy.address, staker1Amount, {
          from: staker1,
        });
        await this.governanceProxy.stake(staker1Amount, { from: staker1 });
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
          ).to.be.bignumber.equal(staker1Amount);
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
