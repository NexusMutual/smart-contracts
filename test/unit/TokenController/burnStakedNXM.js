const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { ZeroAddress, parseEther } = ethers;

async function laodBurnStakedNXMFixture() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory, tokenController, nxm } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const createPoolTx = await stakingPoolFactory.create(ZeroAddress);
  const receipt = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = receipt.logs[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setBalance(stakingPoolAddress, parseEther('1'));

  const amount = parseEther('100');
  await nxm.mint(member, amount);
  await nxm.connect(member).approve(tokenController, amount);
  await nxm.connect(member).approve(stakingPoolAddress, amount);
  await tokenController.connect(poolSigner).depositStakedNXM(member.address, amount, poolId);

  return { ...fixture, poolId, poolSigner };
}

describe('burnStakedNXM', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await laodBurnStakedNXMFixture();
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(tokenController.connect(member).burnStakedNXM(amount, fixture.poolId)).to.be.revertedWithCustomError(
      tokenController,
      'OnlyStakingPool',
    );
  });

  it('reduces staking pool deposits', async function () {
    const fixture = await laodBurnStakedNXMFixture();
    const { tokenController } = fixture.contracts;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).burnStakedNXM(amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits - amount);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('burns nxm from the contract', async function () {
    const fixture = await laodBurnStakedNXMFixture();
    const { tokenController, nxm } = fixture.contracts;

    const initialTcBalance = await nxm.balanceOf(tokenController);
    const initialTotalSupply = await nxm.totalSupply();

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).burnStakedNXM(amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController);
    const totalSupply = await nxm.totalSupply();

    expect(tcBalance).to.equal(initialTcBalance - amount);
    expect(totalSupply).to.equal(initialTotalSupply - amount);
  });
});
