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
const BottoLiquidityMiningV2 = artifacts.require("BottoLiquidityMiningV2");
const BottoLiquidityMiningV3 = artifacts.require("BottoLiquidityMiningV3");
const MockBottoLiquidityMiningV3 = artifacts.require(
  "MockBottoLiquidityMiningV3"
);
const MockAtClaimDeadlineBottoLiquidityMiningV3 = artifacts.require(
  "MockAtClaimDeadlineBottoLiquidityMiningV3"
);
const MockERC20 = artifacts.require("MockERC20");

contract("BottoLiquidityMiningV3", (accounts) => {
  const [owner, staker1, staker2, recipient] = accounts;
  const DAO_TREASURY = "0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49";
  const CLAIM_DEADLINE = toBN("1774915199");
  const initialSupply = toBN("21000000000000000000000000");
  const totalRewards = toBN("60000000000000000000000");
  const staker1Stake = toBN("12000000000000");
  const staker2Stake = toBN("24000000000000");

  beforeEach(async function () {
    this.botto = await BOTTO.new("Botto", "BOTTO", initialSupply);
    this.bottoEth = await MockERC20.new("BottoEth", "BOTTOETH");
    this.otherToken = await MockERC20.new("Other", "OTHER");
    await this.bottoEth.mint(
      owner,
      staker1Stake.add(staker2Stake).mul(toBN("2"))
    );

    this.miningProxy = await deployProxy(BottoLiquidityMining, [
      this.bottoEth.address,
      this.botto.address,
    ]);

    const start = (await time.latest()).add(time.duration.minutes(5));
    const end = start.add(time.duration.days(7));
    await this.botto.transfer(this.miningProxy.address, totalRewards);
    await this.miningProxy.deposit(totalRewards, start, end);
    await time.increaseTo(start);

    await this.bottoEth.transfer(staker1, staker1Stake);
    await this.bottoEth.transfer(staker2, staker2Stake);
    await this.bottoEth.approve(this.miningProxy.address, staker1Stake, {
      from: staker1,
    });
    await this.bottoEth.approve(this.miningProxy.address, staker2Stake, {
      from: staker2,
    });
    await this.miningProxy.stake(staker1Stake, { from: staker1 });
    await this.miningProxy.stake(staker2Stake, {
      from: staker2,
      gas: 500000,
    });
    await time.increase(time.duration.days(1));

    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      BottoLiquidityMiningV2
    );
    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      BottoLiquidityMiningV3
    );
  });

  it("preserves V2 state through the upgrade", async function () {
    expect(await this.miningProxy.owner()).to.equal(owner);
    expect(await this.miningProxy.botto()).to.equal(this.botto.address);
    expect(await this.miningProxy.bottoEth()).to.equal(this.bottoEth.address);
    expect(await this.miningProxy.totalStakers()).to.be.bignumber.equal("2");
    expect(await this.miningProxy.totalStake()).to.be.bignumber.equal(
      staker1Stake.add(staker2Stake)
    );
    expect(
      await this.miningProxy.totalUserStake(staker1)
    ).to.be.bignumber.equal(staker1Stake);
    expect(
      await this.miningProxy.totalUserStake(staker2)
    ).to.be.bignumber.equal(staker2Stake);
  });

  it("exposes the governance deadline and fixed treasury", async function () {
    expect(await this.miningProxy.CLAIM_DEADLINE()).to.be.bignumber.equal(
      CLAIM_DEADLINE
    );
    expect(await this.miningProxy.DAO_TREASURY()).to.equal(DAO_TREASURY);
  });

  it("rejects reward recovery by a non-owner", async function () {
    await expectRevert(
      this.miningProxy.recoverUnclaimedRewards({ from: staker1 }),
      "Ownable: caller is not the owner"
    );
  });

  it("rejects owner recovery while the claim period is active", async function () {
    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      MockBottoLiquidityMiningV3
    );
    const futureDeadline = (await time.latest()).add(time.duration.days(1));
    await this.miningProxy.setMockClaimDeadline(futureDeadline);

    await expectRevert(
      this.miningProxy.recoverUnclaimedRewards({ from: owner }),
      "LiquidityMiningV3::recoverUnclaimedRewards: claim period active"
    );
  });

  it("rejects owner recovery at the claim deadline and allows it one second later", async function () {
    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      MockBottoLiquidityMiningV3
    );
    const deadline = (await time.latest()).add(time.duration.hours(1));
    const recovered = await this.botto.balanceOf(this.miningProxy.address);
    const treasuryBefore = await this.botto.balanceOf(DAO_TREASURY);
    await this.miningProxy.setMockClaimDeadline(deadline);
    await time.increaseTo(deadline);

    await expectRevert(
      this.miningProxy.recoverUnclaimedRewards({ from: owner }),
      "LiquidityMiningV3::recoverUnclaimedRewards: claim period active"
    );

    await time.increaseTo(deadline.add(time.duration.seconds(1)));

    const tx = await this.miningProxy.recoverUnclaimedRewards({ from: owner });

    expectEvent(tx, "UnclaimedRewardsRecovered", {
      treasury: DAO_TREASURY,
      amount: recovered,
    });
    expect(await this.botto.balanceOf(DAO_TREASURY)).to.be.bignumber.equal(
      treasuryBefore.add(recovered)
    );
  });

  it("pays rewards when withdrawal is evaluated at the deadline", async function () {
    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      MockAtClaimDeadlineBottoLiquidityMiningV3
    );

    const bottoBefore = await this.botto.balanceOf(staker1);
    const userClaimedBefore = await this.miningProxy.userClaimedRewards(
      staker1
    );
    const totalClaimedBefore = await this.miningProxy.totalClaimedRewards();
    const result = await this.miningProxy.withdraw.call({ from: staker1 });
    const tx = await this.miningProxy.withdraw({ from: staker1 });
    const paidReward = tx.logs.find((log) => log.event === "Payout").args
      .reward;

    expect(result.bottoEthOut).to.be.bignumber.equal(staker1Stake);
    expect(result.reward).to.be.bignumber.gt(toBN("0"));
    expect(paidReward).to.be.bignumber.gt(toBN("0"));
    expectEvent(tx, "Payout", {
      staker: staker1,
      reward: paidReward,
    });
    expectEvent(tx, "Withdraw", {
      staker: staker1,
      bottoEthOut: staker1Stake,
    });
    expect(await this.botto.balanceOf(staker1)).to.be.bignumber.equal(
      bottoBefore.add(paidReward)
    );
    expect(await this.bottoEth.balanceOf(staker1)).to.be.bignumber.equal(
      staker1Stake
    );
    expect(
      await this.miningProxy.userClaimedRewards(staker1)
    ).to.be.bignumber.equal(userClaimedBefore.add(paidReward));
    expect(await this.miningProxy.totalClaimedRewards()).to.be.bignumber.equal(
      totalClaimedBefore.add(paidReward)
    );
    expect(
      await this.miningProxy.totalUserStake(staker1)
    ).to.be.bignumber.equal("0");
  });

  it("retains payout behavior when evaluated at the deadline", async function () {
    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      MockAtClaimDeadlineBottoLiquidityMiningV3
    );

    const bottoBefore = await this.botto.balanceOf(staker1);
    const userClaimedBefore = await this.miningProxy.userClaimedRewards(
      staker1
    );
    const totalClaimedBefore = await this.miningProxy.totalClaimedRewards();
    const reward = await this.miningProxy.payout.call({ from: staker1 });
    const tx = await this.miningProxy.payout({ from: staker1 });
    const paidReward = tx.logs.find((log) => log.event === "Payout").args
      .reward;

    expect(reward).to.be.bignumber.gt(toBN("0"));
    expect(paidReward).to.be.bignumber.gt(toBN("0"));
    expectEvent(tx, "Payout", { staker: staker1, reward: paidReward });
    expect(await this.botto.balanceOf(staker1)).to.be.bignumber.equal(
      bottoBefore.add(paidReward)
    );
    expect(
      await this.miningProxy.userClaimedRewards(staker1)
    ).to.be.bignumber.equal(userClaimedBefore.add(paidReward));
    expect(await this.miningProxy.totalClaimedRewards()).to.be.bignumber.equal(
      totalClaimedBefore.add(paidReward)
    );
    expect(
      await this.miningProxy.totalUserStake(staker1)
    ).to.be.bignumber.equal(staker1Stake);
  });

  it("rejects payout one second after the claim deadline", async function () {
    this.miningProxy = await upgradeProxy(
      this.miningProxy.address,
      MockBottoLiquidityMiningV3
    );
    const deadline = (await time.latest()).add(time.duration.hours(1));
    await this.miningProxy.setMockClaimDeadline(deadline);
    await time.increaseTo(deadline.add(time.duration.seconds(1)));

    await expectRevert(
      this.miningProxy.payout({ from: staker1 }),
      "LiquidityMiningV3::payout: claim period expired"
    );
  });

  it("recovers the full BOTTO balance only to the DAO treasury", async function () {
    const recovered = await this.botto.balanceOf(this.miningProxy.address);
    const treasuryBefore = await this.botto.balanceOf(DAO_TREASURY);
    const lpBalanceBefore = await this.bottoEth.balanceOf(
      this.miningProxy.address
    );
    const totalStakeBefore = await this.miningProxy.totalStake();

    const tx = await this.miningProxy.recoverUnclaimedRewards({ from: owner });

    expectEvent(tx, "UnclaimedRewardsRecovered", {
      treasury: DAO_TREASURY,
      amount: recovered,
    });
    expect(
      await this.botto.balanceOf(this.miningProxy.address)
    ).to.be.bignumber.equal("0");
    expect(await this.botto.balanceOf(DAO_TREASURY)).to.be.bignumber.equal(
      treasuryBefore.add(recovered)
    );
    expect(
      await this.bottoEth.balanceOf(this.miningProxy.address)
    ).to.be.bignumber.equal(lpBalanceBefore);
    expect(await this.miningProxy.totalStake()).to.be.bignumber.equal(
      totalStakeBefore
    );
  });

  it("rejects recovery when no BOTTO remains", async function () {
    await this.miningProxy.recoverUnclaimedRewards({ from: owner });
    await expectRevert(
      this.miningProxy.recoverUnclaimedRewards({ from: owner }),
      "LiquidityMiningV3::recoverUnclaimedRewards: no BOTTO to recover"
    );
  });

  it("recovers BOTTO received after an earlier recovery", async function () {
    await this.miningProxy.recoverUnclaimedRewards({ from: owner });
    const laterAmount = toBN("123456789");
    const treasuryBefore = await this.botto.balanceOf(DAO_TREASURY);
    await this.botto.transfer(this.miningProxy.address, laterAmount);

    await this.miningProxy.recoverUnclaimedRewards({ from: owner });

    expect(await this.botto.balanceOf(DAO_TREASURY)).to.be.bignumber.equal(
      treasuryBefore.add(laterAmount)
    );
  });

  it("returns LP principal but zero expired rewards after recovery", async function () {
    await this.miningProxy.recoverUnclaimedRewards({ from: owner });
    const totalClaimedBefore = await this.miningProxy.totalClaimedRewards();
    const userClaimedBefore = await this.miningProxy.userClaimedRewards(
      staker1
    );

    const result = await this.miningProxy.withdraw.call({ from: staker1 });
    expect(result.bottoEthOut).to.be.bignumber.equal(staker1Stake);
    expect(result.reward).to.be.bignumber.equal("0");

    const tx = await this.miningProxy.withdraw({ from: staker1 });
    expectEvent(tx, "RewardsForfeited", { staker: staker1 });
    expectEvent(tx, "Withdraw", {
      staker: staker1,
      bottoEthOut: staker1Stake,
    });
    expect(await this.bottoEth.balanceOf(staker1)).to.be.bignumber.equal(
      staker1Stake
    );
    expect(await this.botto.balanceOf(staker1)).to.be.bignumber.equal("0");
    expect(await this.miningProxy.totalClaimedRewards()).to.be.bignumber.equal(
      totalClaimedBefore
    );
    expect(
      await this.miningProxy.userClaimedRewards(staker1)
    ).to.be.bignumber.equal(userClaimedBefore);
    expect(
      await this.miningProxy.totalUserStake(staker1)
    ).to.be.bignumber.equal("0");
    expect(await this.miningProxy.totalStake()).to.be.bignumber.equal(
      staker2Stake
    );
    expect(await this.miningProxy.totalStakers()).to.be.bignumber.equal("1");

    await expectRevert(
      this.miningProxy.withdraw({ from: staker1 }),
      "LiquidityMining::_applyReward: no coins staked"
    );
  });

  it("lets every remaining staker recover LP after BOTTO recovery", async function () {
    await this.miningProxy.recoverUnclaimedRewards({ from: owner });
    await this.miningProxy.withdraw({ from: staker1 });
    await this.miningProxy.withdraw({ from: staker2 });

    expect(await this.bottoEth.balanceOf(staker1)).to.be.bignumber.equal(
      staker1Stake
    );
    expect(await this.bottoEth.balanceOf(staker2)).to.be.bignumber.equal(
      staker2Stake
    );
    expect(await this.miningProxy.totalStake()).to.be.bignumber.equal("0");
    expect(await this.miningProxy.totalStakers()).to.be.bignumber.equal("0");
  });

  it("cannot bypass treasury recovery through generic BOTTO rescue", async function () {
    await expectRevert(
      this.miningProxy.rescueTokens(this.botto.address, recipient, "1", {
        from: owner,
      }),
      "LiquidityMiningV3::rescueTokens: use recoverUnclaimedRewards"
    );
  });

  it("protects staked LP while allowing genuine excess LP rescue", async function () {
    await expectRevert(
      this.miningProxy.rescueTokens(this.bottoEth.address, recipient, "1", {
        from: owner,
      }),
      "LiquidityMiningV3::rescueTokens: that BottoEth belongs to stakers"
    );

    const excess = toBN("1000");
    await this.bottoEth.transfer(this.miningProxy.address, excess);
    await this.miningProxy.rescueTokens(
      this.bottoEth.address,
      recipient,
      excess,
      { from: owner }
    );

    expect(await this.bottoEth.balanceOf(recipient)).to.be.bignumber.equal(
      excess
    );
    expect(
      await this.bottoEth.balanceOf(this.miningProxy.address)
    ).to.be.bignumber.equal(staker1Stake.add(staker2Stake));
  });

  it("retains owner rescue for unrelated ERC20 tokens", async function () {
    const amount = toBN("777");
    await this.otherToken.mint(this.miningProxy.address, amount);

    await expectRevert(
      this.miningProxy.rescueTokens(
        this.otherToken.address,
        recipient,
        amount,
        { from: staker1 }
      ),
      "Ownable: caller is not the owner"
    );
    await this.miningProxy.rescueTokens(
      this.otherToken.address,
      recipient,
      amount,
      { from: owner }
    );

    expect(await this.otherToken.balanceOf(recipient)).to.be.bignumber.equal(
      amount
    );
  });
});
