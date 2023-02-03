const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('withdrawNXMStakeAndRewards', function () {
  beforeEach(async function () {
    const { stakingPoolFactory, tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const createPoolTx = await stakingPoolFactory.create(AddressZero);
    const { events } = await createPoolTx.wait();
    const { poolId, stakingPoolAddress } = events[0].args;

    this.poolId = poolId;
    this.poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, parseEther('1'));

    const depositAmount = parseEther('100');
    await tokenController.connect(this.poolSigner).depositStakedNXM(member.address, depositAmount, this.poolId);

    const rewardsAmount = parseEther('20');
    await tokenController.connect(this.poolSigner).mintStakingPoolNXMRewards(rewardsAmount, this.poolId);
  });

  it('reverts if caller is not staking pool contract', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const depositAmount = parseEther('50');
    const rewardsAmount = parseEther('10');
    await expect(
      tokenController.withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, this.poolId),
    ).to.be.revertedWith('TokenController: msg.sender not staking pool');
  });

  it('reduces staking pool deposits', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);

    const depositAmount = parseEther('50');
    const rewardsAmount = 0;
    await tokenController
      .connect(this.poolSigner)
      .withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, this.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.sub(depositAmount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('reduces staking pool rewards', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);

    const depositAmount = 0;
    const rewardsAmount = parseEther('10');
    await tokenController
      .connect(this.poolSigner)
      .withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, this.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards.sub(rewardsAmount));
  });

  it('transfer nxm from the contract to the receiver', async function () {
    const { tokenController, nxm } = this.contracts;
    const [member] = this.accounts.members;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialUserBalance = await nxm.balanceOf(member.address);
    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);

    const depositAmount = parseEther('50');
    const rewardsAmount = parseEther('10');
    const totalWithdrawn = depositAmount.add(rewardsAmount);

    await tokenController
      .connect(this.poolSigner)
      .withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, this.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const userBalance = await nxm.balanceOf(member.address);
    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);

    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.sub(depositAmount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards.sub(rewardsAmount));

    expect(userBalance).to.equal(initialUserBalance.add(totalWithdrawn));
    expect(tcBalance).to.equal(initialTcBalance.sub(totalWithdrawn));
  });
});
