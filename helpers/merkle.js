const { solidityKeccak256 } = require("ethers/lib/utils");
const MerkleTree = require("merkle-tree-solidity").default;

const merklize = function (elements) {
  const merkleElements = elements.map((element) => {
    return makeElement(element.account, element.amount.toString());
  });

  return new MerkleTree(merkleElements);
};

 function merkelizeInWei (elements) {
  const merkleElements = elements.map(element => {
    return makeElement(element.account, element.amountInWei)
  })

  return new MerkleTree(merkleElements);
};

const makeElement = function (who, amount) {
  return Buffer.from(
    solidityKeccak256(["address", "uint256"], [who, amount]).replace(/^0x/, ""),
    "hex"
  );
};

module.exports = {
  merklize,
  merkelizeInWei,
  makeElement,
};
