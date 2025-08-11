const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther, ZeroAddress } = ethers;

async function burnStakingPoolNXMRewardsSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory, tokenController } = fixture.contracts;

  const createPoolTx = await stakingPoolFactory.create(ZeroAddress);
  const { logs } = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = logs[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setBalance(stakingPoolAddress, parseEther('1'));

  const amount = parseEther('100');
  await tokenController.connect(poolSigner).mintStakingPoolNXMRewards(amount, poolId);

  return {
    ...fixture,
    poolId,
    poolSigner,
  };
}

describe('burnStakingPoolNXMRewards', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await loadFixture(burnStakingPoolNXMRewardsSetup);
    const { tokenController } = fixture.contracts;

    const amount = parseEther('10');
    await expect(tokenController.burnStakingPoolNXMRewards(amount, fixture.poolId)).to.be.revertedWithCustomError(
      tokenController,
      'OnlyStakingPool',
    );
  });

  it('reduces staking pool rewards', async function () {
    const fixture = await loadFixture(burnStakingPoolNXMRewardsSetup);
    const { tokenController } = fixture.contracts;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).burnStakingPoolNXMRewards(amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards - amount);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits);
  });

  it('burns nxm from the contract', async function () {
    const fixture = await loadFixture(burnStakingPoolNXMRewardsSetup);
    const { tokenController, nxm } = fixture.contracts;

    const initialTcBalance = await nxm.balanceOf(tokenController);
    const initialTotalSupply = await nxm.totalSupply();

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).burnStakingPoolNXMRewards(amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController);
    const totalSupply = await nxm.totalSupply();

    expect(tcBalance).to.equal(initialTcBalance - amount);
    expect(totalSupply).to.equal(initialTotalSupply - amount);
  });
});
