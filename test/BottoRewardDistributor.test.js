const { expect } = require("chai");
const { expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const { deployProxy, upgradeProxy } = require("@openzeppelin/truffle-upgrades");
const { toBN } = web3.utils;
const { getBalance } = web3.eth;

const BottoRewardDistributor = artifacts.require("BottoRewardDistributor");
const MockBottoRewardDistributor02 = artifacts.require(
  "MockBottoRewardDistributor02"
);
const MockERC20 = artifacts.require("MockERC20");

const makeRewards = function (accounts) {
  let amounts = [];
  accounts.forEach((address, i) => (amounts[i] = String(100 + i)));
  return { addresses: accounts, amounts: amounts };
};

contract("BottoRewardDistributor", (accounts, network) => {
  const [owner, claimant1, claimant2, beneficiary] = accounts;
  const rewards = makeRewards(accounts);
  const initialDeposit = toBN(
    String(
      rewards.amounts.reduce((carry, amount) => (carry += parseInt(amount)), 0)
    )
  );

  beforeEach(async function () {
    this.distributorProxy = await deployProxy(BottoRewardDistributor, []);
  });

  it("has no ETH balance", async function () {
    expect(
      await getBalance(this.distributorProxy.address)
    ).to.be.bignumber.equal("0");
  });

  it("has nothing to claim", async function () {
    expect(
      await this.distributorProxy.rewards(claimant1)
    ).to.be.bignumber.equal("0");
  });

  it("cannot claim anything", async function () {
    await expectRevert(
      this.distributorProxy.claim(claimant1, { from: claimant1 }),
      "Nothing to reward"
    );
  });

  it("reverts if deposit 0", async function () {
    await expectRevert(
      this.distributorProxy.deposit([], []),
      "Invalid ETH amount"
    );
  });

  it("reverts if value incorrect", async function () {
    await expectRevert(
      this.distributorProxy.deposit(rewards.addresses, rewards.amounts, {
        value: "123",
      }),
      "Reward total must match deposited value"
    );
  });

  context("deposits funds", function () {
    beforeEach(async function () {
      tx = await this.distributorProxy.deposit(
        rewards.addresses,
        rewards.amounts,
        { value: initialDeposit }
      );
    });

    it("emits a Deposit event", async function () {
      expectEvent(tx, "Deposit", { depositor: owner, amount: initialDeposit });
    });

    it("claimants have rewards", async function () {
      rewards.addresses.forEach(async (address, i) => {
        expect(
          await this.distributorProxy.rewards(address)
        ).to.be.bignumber.equal(rewards.amounts[i]);
      });
    });

    it("has expected ETH balance", async function () {
      expect(
        await getBalance(this.distributorProxy.address)
      ).to.be.bignumber.equal(initialDeposit);
    });

    context("claims reward for self", function () {
      beforeEach(async function () {
        claimant1Balance = toBN(await getBalance(claimant1));
        tx = await this.distributorProxy.claim(claimant1, {
          from: claimant1,
          gasPrice: "2000000000",
        });
        txFee = toBN(await web3.eth.getGasPrice()).mul(
          toBN(tx.receipt.gasUsed)
        );
        expectedReward = toBN(rewards.amounts[1]);
      });

      it("claimant has expected balance", async function () {
        let newClaimant1Balance = claimant1Balance
          .sub(txFee)
          .add(expectedReward);
        expect(await getBalance(claimant1)).to.be.bignumber.equal(
          newClaimant1Balance
        );
      });

      it("emits Claim event", async function () {
        expectEvent(tx, "Claim", {
          claimant: claimant1,
          amount: expectedReward,
        });
      });

      it("contract has remaining balance", async function () {
        let remainingBalance = initialDeposit.sub(expectedReward);
        expect(
          await getBalance(this.distributorProxy.address)
        ).to.be.bignumber.equal(remainingBalance);
      });

      it("claimant has no remaining reward", async function () {
        expect(
          await this.distributorProxy.rewards(claimant1)
        ).to.be.bignumber.equal("0");
      });
    });

    context("claims reward for other after another deposit", function () {
      beforeEach(async function () {
        totalDeposit = initialDeposit.mul(toBN("2"));
        await this.distributorProxy.deposit(
          rewards.addresses,
          rewards.amounts,
          { value: initialDeposit }
        );
        claimant1Balance = toBN(await getBalance(claimant1));
        tx = await this.distributorProxy.claim(claimant1, { from: claimant2 });
        expectedReward = toBN(rewards.amounts[1]).mul(toBN("2"));
      });

      it("claimant has expected balance", async function () {
        let newClaimant1Balance = claimant1Balance.add(expectedReward);
        expect(await getBalance(claimant1)).to.be.bignumber.equal(
          newClaimant1Balance
        );
      });

      it("emits Claim event", async function () {
        expectEvent(tx, "Claim", {
          claimant: claimant1,
          amount: expectedReward,
        });
      });

      it("contract has remaining balance", async function () {
        let remainingBalance = totalDeposit.sub(expectedReward);
        expect(
          await getBalance(this.distributorProxy.address)
        ).to.be.bignumber.equal(remainingBalance);
      });

      it("claimant has no remaining reward", async function () {
        expect(
          await this.distributorProxy.rewards(claimant1)
        ).to.be.bignumber.equal("0");
      });
    });

    context("upgrade contract to 02", function () {
      beforeEach(async function () {
        // the upgrade function doesn't change the deployed implementation address on each iteration
        this.distributorProxy = await upgradeProxy(
          this.distributorProxy.address,
          MockBottoRewardDistributor02
        );
      });

      it("implementation contracts have same proxy address", async function () {
        expect(BottoRewardDistributor.address).to.be.equal(
          MockBottoRewardDistributor02.address
        );
      });

      it("cannot deposit to upgraded contract with non-zero value", async function () {
        await expectRevert(
          this.distributorProxy.deposit(rewards.addresses, rewards.amounts, {
            value: "100",
          }),
          "Invalid ETH after upgrade"
        );
      });

      it("cannot recover as non-owner on new contract", async function () {
        dummyERC20 = await MockERC20.new("Dummy", "DUM");
        await expectRevert(
          this.distributorProxy.recover(dummyERC20.address, beneficiary, {
            from: beneficiary,
          }),
          "Ownable: caller is not the owner"
        );
      });

      it("can call new function as owner", async function () {
        expect(await this.distributorProxy.ownershipTest(false)).to.be.true;
      });

      it("cannot call new function as non-owner", async function () {
        await expectRevert(
          this.distributorProxy.ownershipTest(true, { from: claimant1 }),
          "Ownable: caller is not the owner"
        );
      });

      it("emits new event on deposit", async function () {
        tx = await this.distributorProxy.deposit([], [], { value: "2000" });
        await expectEvent(tx, "Deposit2", { depositor: owner, amount: "2000" });
      });
    });
  });

  context("recover tokens", function () {
    beforeEach(async function () {
      extraAmount = toBN("1234567");
      this.dummyERC20 = await MockERC20.new("Dummy", "DUM");
      await this.dummyERC20.mint(this.distributorProxy.address, extraAmount);
    });

    it("cannot recover as non-owner", async function () {
      await expectRevert(
        this.distributorProxy.recover(this.dummyERC20.address, owner, {
          from: claimant1,
        }),
        "Ownable: caller is not the owner"
      );
    });

    context("recovers excess ERC20 tokens", function () {
      beforeEach(async function () {
        tx = await this.distributorProxy.recover(
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
          await this.dummyERC20.balanceOf(this.distributorProxy.address)
        ).to.be.bignumber.equal("0");
      });

      it("beneficiary has expected token balance", async function () {
        expect(
          await this.dummyERC20.balanceOf(beneficiary)
        ).to.be.bignumber.equal(extraAmount);
      });
    });
  });
});
