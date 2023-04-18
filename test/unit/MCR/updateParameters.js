const { expect } = require('chai');

const { MCRUintParamType } = require('../utils').constants;
const { toBytes8 } = require('../utils').helpers;

describe('updateUintParameters', function () {
  it('should revert when called by non governance addresses', async function () {
    const { mcr } = this;
    const param = MCRUintParamType.mcrFloorIncrementThreshold;
    const [nonMember] = this.accounts.nonMembers;
    const [member] = this.accounts.members;
    const [advisoryBoardMember] = this.accounts.advisoryBoardMembers;
    const [internalContract] = this.accounts.internalContracts;
    const nonGov = [nonMember, member, advisoryBoardMember, internalContract];

    for (const signer of nonGov) {
      await expect(mcr.connect(signer).updateUintParameters(param, 0)).to.be.reverted;
    }
  });

  it('should correctly update the uint parameters', async function () {
    const { mcr } = this;
    const params = Object.keys(MCRUintParamType);

    const value = 42;

    const [governanceContract] = this.accounts.governanceContracts;
    for (const paramName of params) {
      const before = await mcr[paramName]();
      expect(before).to.not.be.equal(value);

      await mcr.connect(governanceContract).updateUintParameters(MCRUintParamType[paramName], value);

      const actual = await mcr[paramName]();
      expect(actual).to.be.equal(value);
    }
  });

  it('should revert on unknown parameter code', async function () {
    const { mcr } = this;

    const [governanceContract] = this.accounts.governanceContracts;
    await expect(mcr.connect(governanceContract).updateUintParameters(toBytes8('RAND'), '123')).to.be.revertedWith(
      'Invalid param code',
    );
  });
});
