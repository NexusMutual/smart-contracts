const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther, ZeroAddress } = ethers;

async function loadDepositStakedNXM() {
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

describe('depositStakedNXM', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await loadDepositStakedNXM();
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(
      tokenController.depositStakedNXM(member.address, amount, fixture.poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyStakingPool');
  });

  it('increases staking pool deposits', async function () {
    const fixture = await loadDepositStakedNXM();
    const { tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await nxm.mint(member.address, amount);
    await nxm.connect(member).approve(tokenController, amount);
    await tokenController.connect(fixture.poolSigner).depositStakedNXM(member.address, amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits + amount);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('transfer nxm from the specified account to the contract', async function () {
    const fixture = await loadDepositStakedNXM();
    const { tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = parseEther('10');
    await nxm.mint(member.address, amount);
    await nxm.connect(member).approve(tokenController, amount);

    const initialTcBalance = await nxm.balanceOf(tokenController);
    const initialUserBalance = await nxm.balanceOf(member.address);

    await tokenController.connect(fixture.poolSigner).depositStakedNXM(member.address, amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController);
    const userBalance = await nxm.balanceOf(member.address);

    expect(tcBalance).to.equal(initialTcBalance + amount);
    expect(userBalance).to.equal(initialUserBalance - amount);
  });
});
