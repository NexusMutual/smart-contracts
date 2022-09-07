const { accounts } = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { NXMasterOwnerParamType } = require('../utils').constants;

const [, , nonMember] = accounts;

describe('updateOwnerParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { master } = this;
    const param = NXMasterOwnerParamType.kycAuthority;

    await expectRevert.unspecified(master.updateOwnerParameters(param, ZERO_ADDRESS, { from: nonMember }));
  });

  it('should correctly update emergency admin parameter', async function () {
    const { master, governance } = this;

    const newAdmin = '0x0000000000000000000000000000000000000001';
    await governance.updateOwnerParameters(NXMasterOwnerParamType.emergencyAdmin, newAdmin);

    const emergencyAdmin = await master.emergencyAdmin();
    assert.equal(emergencyAdmin, newAdmin);
  });
});
