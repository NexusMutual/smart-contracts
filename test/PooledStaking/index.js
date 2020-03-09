const { accounts, contract, web3 } = require('@openzeppelin/test-environment');
const { BN, constants, expectEvent, expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');

const [nonMember, member, abMember] = accounts;

describe('PooledStaking', function () {

  beforeEach(async function () {
    this.master = await MasterMock.new();
    this.staking = await PooledStaking.new();
    await this.staking.initialize(this.master.address);
  });

  it('should revert when called by non members', async function () {
    const { staking } = this;
    await expectRevert(
      staking.stake(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

});
