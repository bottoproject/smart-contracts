require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const BOTTO = artifacts.require("BOTTO");

contract("BOTTO", (accounts) => {
  const [owner] = accounts;
  const name = "BottoTest";
  const symbol = "BOTTOT";
  const initialSupply = "21000000000000000000000000";

  beforeEach(async function () {
    this.botto = await BOTTO.new(name, symbol, initialSupply);
  });

  it("has expected name", async function () {
    expect(await this.botto.name()).to.equal(name);
  });

  it("has expected symbol", async function () {
    expect(await this.botto.symbol()).to.equal(symbol);
  });

  it("has expected decimals", async function () {
    expect(await this.botto.decimals()).to.be.bignumber.equal("18");
  });

  it("has expected total supply", async function () {
    expect(await this.botto.totalSupply()).to.be.bignumber.equal(initialSupply);
  });

  it("transfers supply to owner", async function () {
    expect(await this.botto.balanceOf(owner)).to.be.bignumber.equal(
      initialSupply
    );
  });
});
