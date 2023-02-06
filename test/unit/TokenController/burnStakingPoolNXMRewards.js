const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('burnStakingPoolNXMRewards', function () {
  beforeEach(async function () {
    const { stakingPoolFactory, tokenController } = this.contracts;

    const createPoolTx = await stakingPoolFactory.create(AddressZero);
    const { events } = await createPoolTx.wait();
    const { poolId, stakingPoolAddress } = events[0].args;

    this.poolId = poolId;
    this.poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, parseEther('1'));

    const amount = parseEther('100');
    await tokenController.connect(this.poolSigner).mintStakingPoolNXMRewards(amount, this.poolId);
  });

  it('reverts if caller is not pool contract', async function () {
    const { tokenController } = this.contracts;

    const amount = parseEther('10');
    await expect(tokenController.burnStakingPoolNXMRewards(amount, this.poolId)).to.be.revertedWith(
      'TokenController: msg.sender not staking pool',
    );
  });

  it('reduces staking pool rewards', async function () {
    const { tokenController } = this.contracts;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);

    const amount = parseEther('10');
    await tokenController.connect(this.poolSigner).burnStakingPoolNXMRewards(amount, this.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards.sub(amount));
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits);
  });

  it('burns nxm from the contract', async function () {
    const { tokenController, nxm } = this.contracts;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialTotalSupply = await nxm.totalSupply();

    const amount = parseEther('10');
    await tokenController.connect(this.poolSigner).burnStakingPoolNXMRewards(amount, this.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const totalSupply = await nxm.totalSupply();

    expect(tcBalance).to.equal(initialTcBalance.sub(amount));
    expect(totalSupply).to.equal(initialTotalSupply.sub(amount));
  });
});
