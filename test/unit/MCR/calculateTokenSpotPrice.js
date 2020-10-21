const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const accounts = require('../utils').accounts;
const BN = web3.utils.BN;

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  governanceContracts: [governanceContract],
  internalContracts: [internalContract],
} = accounts;


describe('calculateTokenSpotPrice', function () {

  it('calculates token spot price correctly', async function () {
    const { mcr } = this;

    const mcrEth = new BN('162424730681679380000000');
    const mcrPercentage = new BN('13134');

    const price = await mcr.calculateTokenSpotPrice(mcrPercentage, mcrEth);
    console.log({
      price: price.toString()
    });
  });
});
