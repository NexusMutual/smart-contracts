const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther, ZeroAddress } = ethers;

async function mintStakingPoolNXMRewardsSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory } = fixture.contracts;

  const createPoolTx = await stakingPoolFactory.create(ZeroAddress);
  const { logs } = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = logs[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setBalance(stakingPoolAddress, parseEther('1'));

  return {
    ...fixture,
    poolId,
    poolSigner,
  };
}

describe('mintStakingPoolNXMRewards', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await loadFixture(mintStakingPoolNXMRewardsSetup);
    const { tokenController } = fixture.contracts;

    const amount = parseEther('10');
    await expect(tokenController.mintStakingPoolNXMRewards(amount, fixture.poolId)).to.be.revertedWithCustomError(
      tokenController,
      'OnlyStakingPool',
    );
  });

  it('increases staking pool rewards', async function () {
    const fixture = await loadFixture(mintStakingPoolNXMRewardsSetup);
    const { tokenController } = fixture.contracts;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).mintStakingPoolNXMRewards(amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards + amount);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits);
  });

  it('mints nxm to the contract', async function () {
    const fixture = await loadFixture(mintStakingPoolNXMRewardsSetup);
    const { tokenController, nxm } = fixture.contracts;

    const initialTcBalance = await nxm.balanceOf(tokenController);
    const initialTotalSupply = await nxm.totalSupply();

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).mintStakingPoolNXMRewards(amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController);
    const totalSupply = await nxm.totalSupply();

    expect(tcBalance).to.equal(initialTcBalance + amount);
    expect(totalSupply).to.equal(initialTotalSupply + amount);
  });
});
