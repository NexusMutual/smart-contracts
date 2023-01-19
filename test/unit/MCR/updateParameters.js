const { expect } = require('chai');
const { ethers } = require('hardhat');

const accounts = require('../utils').accounts;
const { MCRUintParamType } = require('../utils').constants;
const { toBytes8 } = require('../utils').helpers;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

describe('updateUintParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { mcr } = this;
    const param = MCRUintParamType.mcrFloorIncrementThreshold;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const address of nonGov) {
      const signer = await ethers.getSigner(address);
      await expect(mcr.connect(signer).updateUintParameters(param, 0)).to.be.reverted;
    }
  });

  it('should correctly update the uint parameters', async function () {
    const { mcr } = this;
    const params = Object.keys(MCRUintParamType);

    const value = 42;

    for (const paramName of params) {
      const before = await mcr[paramName]();
      expect(before).to.not.be.equal(value);

      const signer = await ethers.getSigner(governanceContract);
      await mcr.connect(signer).updateUintParameters(MCRUintParamType[paramName], value);

      const actual = await mcr[paramName]();
      expect(actual).to.be.equal(value);
    }
  });

  it('should revert on unknown parameter code', async function () {
    const { mcr } = this;

    const signer = await ethers.getSigner(governanceContract);
    await expect(mcr.connect(signer).updateUintParameters(toBytes8('RAND'), '123')).to.be.revertedWith(
      'Invalid param code',
    );
  });
});
