const { accounts } = require('hardhat');
const {
  constants: { AddressZero },
} = require('ethers');
const { assert, expect } = require('chai');

const { NXMasterOwnerParamType } = require('../utils').constants;

const [, , nonMember] = accounts;

describe('updateOwnerParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { master } = this;
    const param = NXMasterOwnerParamType.kycAuthority;

    expect(master.updateOwnerParameters(param, AddressZero, { from: nonMember })).to.be.revertedWith('Not authorized');
  });

  it('should correctly update emergency admin parameter', async function () {
    const { master, governance } = this;

    const newAdmin = '0x0000000000000000000000000000000000000001';
    await governance.updateOwnerParameters(NXMasterOwnerParamType.emergencyAdmin, newAdmin);

    const emergencyAdmin = await master.emergencyAdmin();
    assert.equal(emergencyAdmin, newAdmin);
  });
});
