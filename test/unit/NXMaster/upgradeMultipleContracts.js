const {
  constants: { AddressZero },
} = require('ethers');
const { hex } = require('../utils').helpers;
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('upgradeMultipleContracts', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts when not called by governance', async function () {
    const { master } = fixture;
    await expect(master.upgradeMultipleContracts([], [])).to.be.revertedWith('Not authorized');
  });

  it('reverts when contract code does not exist', async function () {
    const { governance } = fixture;

    await expect(
      governance.upgradeMultipleContracts([hex('XX')], ['0x0000000000000000000000000000000000000001']),
    ).to.be.revertedWith('NXMaster: Non-existant or non-upgradeable contract code');
  });

  it('reverts when contract address is 0t', async function () {
    const { governance } = fixture;

    await expect(governance.upgradeMultipleContracts([hex('GV')], [AddressZero])).to.be.revertedWith(
      'NXMaster: Contract address is 0',
    );
  });
});
