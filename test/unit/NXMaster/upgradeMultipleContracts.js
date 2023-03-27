const {
  constants: { AddressZero },
} = require('ethers');
const { hex } = require('../utils').helpers;
const { expect } = require('chai');

describe('upgradeMultipleContracts', function () {
  it('reverts when not called by governance', async function () {
    const { master } = this;
    expect(master.upgradeMultipleContracts([], [])).to.be.revertedWith('Not authorized');
  });

  it('reverts when contract code does not exist', async function () {
    const { governance } = this;

    expect(
      governance.upgradeMultipleContracts([hex('XX')], ['0x0000000000000000000000000000000000000001']),
    ).to.be.revertedWith('NXMaster: Non-existant or non-upgradeable contract code');
  });

  it('reverts when contract address is 0t', async function () {
    const { governance } = this;

    expect(governance.upgradeMultipleContracts([hex('GV')], [AddressZero])).to.be.revertedWith(
      'NXMaster: Contract address is 0',
    );
  });
});
