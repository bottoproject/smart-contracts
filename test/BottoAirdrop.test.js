const { expect } = require("chai");
const {
  constants,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const { merklize, makeElement } = require("../helpers/merkle.js");
const { toBN } = web3.utils;

const BOTTO = artifacts.require("BOTTO");
const BottoAirdrop = artifacts.require("BottoAirdrop");
const MockERC20 = artifacts.require("MockERC20");

contract("BottoAirdrop", (accounts, network) => {
  const [owner, address1, address2] = accounts;
  const claims = accounts.map((account, i) => ({
    account,
    amount: toBN(100 + i),
  }));
  const merkleTree = merklize(claims);
  const merkleRoot = "0x" + merkleTree.getRoot().toString("hex");
  const initialSupply = toBN((21_000_000e18).toString(16));
  const airdropSupply = claims.reduce((a, c) => a.add(c.amount), toBN(0));
  const endsAfter = String(Math.floor(Date.now() / 1000) + 1000);

  beforeEach(async function () {
    this.botto = await BOTTO.new("Botto", "BOTTO", initialSupply);
    this.airdrop = await BottoAirdrop.new(
      this.botto.address,
      merkleRoot,
      endsAfter
    );
    await this.botto.transfer(this.airdrop.address, airdropSupply);
  });

  it("has expected owner", async function () {
    expect(await this.airdrop.owner()).to.equal(owner);
  });

  it("has expected BOTTO address", async function () {
    expect(await this.airdrop.botto()).to.equal(this.botto.address);
  });

  it("has BOTTO token balance", async function () {
    expect(await this.airdrop.getBalance()).to.be.bignumber.equal(
      airdropSupply
    );
  });

  it("has expected merkle root", async function () {
    expect(await this.airdrop.merkleRoot()).to.equal(merkleRoot);
  });

  it("has expected end timestamp", async function () {
    expect(await this.airdrop.endsAfter()).to.be.bignumber.equal(endsAfter);
  });

  it("has expected total claimed", async function () {
    expect(await this.airdrop.totalClaimed()).to.be.bignumber.equal("0");
  });

  context("verifies claims", function () {
    it("does not verify claim with incorrect proof", async function () {
      const claimant = claims[1];
      proof = merkleTree.getProof(
        makeElement(claimant.account, claimant.amount.toString())
      );
      expect(
        await this.airdrop.verify(proof, claimant.account, 123456)
      ).to.be.false;
    });

    it("does not verify claim with invalid proof", async function () {
      proof = [makeElement(constants.ZERO_ADDRESS, 10)];
      expect(
        await this.airdrop.verify(proof, constants.ZERO_ADDRESS, 10)
      ).to.be.false;
    });

    it("verifies participant claim", async function () {
      const claimant = claims[0];
      proof = merkleTree.getProof(
        makeElement(claimant.account, claimant.amount.toString())
      );
      expect(
        await this.airdrop.verify(
          proof,
          claimant.account,
          claimant.amount.toString()
        )
      ).to.be.true;
    });
  });

  context("claims tokens", function () {
    it("does not claim with incorrect proof", async function () {
      claimant = claims[1];
      proof = merkleTree.getProof(
        makeElement(claimant.account, claimant.amount.toString())
      );
      await expectRevert(
        this.airdrop.claim(proof, claimant.account, 123456),
        "Invalid proof"
      );
    });

    it("does not claim with invalid proof", async function () {
      proof = [makeElement(constants.ZERO_ADDRESS, 10)];
      await expectRevert(
        this.airdrop.claim(proof, constants.ZERO_ADDRESS, 10),
        "Invalid proof"
      );
    });

    context("claim by owner for claimant", function () {
      beforeEach(async function () {
        claimant = claims[1];
        proof = merkleTree.getProof(
          makeElement(claimant.account, claimant.amount.toString())
        );
        tx = await this.airdrop.claim(
          proof,
          claimant.account,
          claimant.amount.toString()
        );
      });

      it("emits AirdropTransfer event", async function () {
        expectEvent(tx, "AirdropTransfer", {
          to: claimant.account,
          amount: claimant.amount,
        });
      });

      it("claimant has expected tokens", async function () {
        expect(
          await this.botto.balanceOf(claimant.account)
        ).to.be.bignumber.equal(claimant.amount);
      });

      it("has expected total claimed", async function () {
        expect(await this.airdrop.totalClaimed()).to.be.bignumber.equal(
          claimant.amount
        );
      });
    });

    context("claim by claimaint", function () {
      beforeEach(async function () {
        totalClaimed = await this.airdrop.totalClaimed();
        claimant = claims[2];
        proof = merkleTree.getProof(
          makeElement(claimant.account, claimant.amount.toString())
        );
        tx = await this.airdrop.claim(
          proof,
          claimant.account,
          claimant.amount.toString(),
          { from: claimant.account }
        );
      });

      it("emits AirdropTransfer event", async function () {
        expectEvent(tx, "AirdropTransfer", {
          to: claimant.account,
          amount: claimant.amount,
        });
      });

      it("claimant has expected tokens", async function () {
        expect(
          await this.botto.balanceOf(claimant.account)
        ).to.be.bignumber.equal(claimant.amount);
      });

      it("has expected total claimed", async function () {
        expect(await this.airdrop.totalClaimed()).to.be.bignumber.equal(
          totalClaimed.add(claimant.amount)
        );
      });

      it("tries to claim again", async function () {
        await expectRevert(
          this.airdrop.claim(
            proof,
            claimant.account,
            claimant.amount.toString()
          ),
          "Already claimed"
        );
      });
    });
  });

  context("recover tokens", function () {
    beforeEach(async function () {
      dummySupply = toBN("10000");
      dummyERC20 = await MockERC20.new("Test", "TEST");
      await dummyERC20.mint(this.airdrop.address, dummySupply);
      ownerBalance = await this.botto.balanceOf(owner);
      currentBalance = await this.airdrop.getBalance();
    });

    it("is reverted for non-owner", async function () {
      await expectRevert(
        this.airdrop.recover(dummyERC20.address, currentBalance, owner, {
          from: address1,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("is reverted when token is BOTTO", async function () {
      await expectRevert(
        this.airdrop.recover(this.botto.address, currentBalance, owner),
        "Recover BOTTO on end"
      );
    });

    it("is reverted when insufficient tokens", async function () {
      await expectRevert(
        this.airdrop.recover(
          dummyERC20.address,
          dummySupply.add(toBN("1")),
          owner
        ),
        "TransferHelper::safeTransfer: transfer failed"
      );
    });

    context("owner recovers other token", function () {
      beforeEach(async function () {
        tx = await this.airdrop.recover(dummyERC20.address, dummySupply, owner);
      });

      it("emits RecoveryTransfer event", async function () {
        expectEvent(tx, "RecoveryTransfer", {
          token: dummyERC20.address,
          amount: dummySupply,
          recipient: owner,
        });
      });

      it("owner has expected token balance", async function () {
        expect(await dummyERC20.balanceOf(owner)).to.be.bignumber.equal(
          dummySupply
        );
      });

      it("owner has no change in botto balance", async function () {
        expect(await this.botto.balanceOf(owner)).to.be.bignumber.equal(
          ownerBalance
        );
      });
    });
  });

  context("end airdrop", function () {
    beforeEach(async function () {
      currentBalance = await this.airdrop.getBalance();
      recipientBalance = await this.botto.balanceOf(address2);
    });

    it("is reverted before end timestamp", async function () {
      await expectRevert(this.airdrop.end(address2), "Cannot end yet");
    });

    context("time is advanced", function () {
      beforeEach(async function () {
        await time.increase(time.duration.days(1));
      });

      it("is reverted for non-owner", async function () {
        await expectRevert(
          this.airdrop.end(address2, { from: address2 }),
          "Ownable: caller is not the owner"
        );
      });

      context("owner ends airdrop", function () {
        beforeEach(async function () {
          tx = await this.airdrop.end(address2);
        });

        it("emits RecoveryTransfer event", async function () {
          expectEvent(tx, "RecoveryTransfer", {
            token: this.botto.address,
            amount: currentBalance,
            recipient: address2,
          });
        });

        it("contract is destructed", async function () {
          expect(await web3.eth.getCode(this.airdrop.address)).to.equal("0x");
        });

        it("owner has token balance", async function () {
          expect(await this.botto.balanceOf(address2)).to.be.bignumber.equal(
            currentBalance.add(recipientBalance)
          );
        });
      });
    });
  });
});
