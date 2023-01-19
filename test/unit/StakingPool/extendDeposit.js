const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getTranches, getNewRewardShares, TRANCHE_DURATION, generateRewards, setTime } = require('./helpers');
const { setEtherBalance, increaseTime } = require('../utils').evm;

const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const depositToFixture = {
  amount: parseEther('100'),
  trancheId: 0,
  tokenId: MaxUint256,
  destination: AddressZero,
};

const productParams = {
  productId: 0,
  weight: 100,
  initialPrice: 500,
  targetPrice: 500,
};

const poolInitParams = {
  poolId: 0,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [productParams],
  ipfsDescriptionHash: 'Description Hash',
};

const depositNftId = 0;
const managerDepositId = MaxUint256;

describe('extendDeposit', function () {
  beforeEach(async function () {
    const { stakingPool, stakingNFT, cover } = this;
    const manager = this.accounts.defaultSender;
    const [user] = this.accounts.members;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));
    this.coverSigner = coverSigner;

    const { poolId, initialPoolFee, maxPoolFee, products, ipfsDescriptionHash } = poolInitParams;
    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, false, initialPoolFee, maxPoolFee, products, poolId, ipfsDescriptionHash);

    // Move to the beginning of the next tranche
    const { firstActiveTrancheId: trancheId } = await getTranches();
    await setTime((trancheId + 1) * TRANCHE_DURATION);

    expect(await stakingNFT.totalSupply()).to.equal(0);

    const { amount, tokenId } = depositToFixture;
    const tx = await stakingPool.connect(user).depositTo(amount, trancheId + 1, tokenId, AddressZero);
    await expect(tx).to.emit(stakingNFT, 'Transfer').withArgs(AddressZero, user.address, depositNftId);

    expect(await stakingNFT.totalSupply()).to.equal(1);
  });

  it('reverts if system is paused', async function () {
    const { stakingPool, master } = this;
    const [user] = this.accounts.members;
    const { firstActiveTrancheId, maxTranche } = await getTranches();

    // enable emergency pause
    await master.setEmergencyPause(true);

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, maxTranche, firstActiveTrancheId, 0),
    ).to.be.revertedWith('System is paused');
  });

  it('reverts if token id is max uint', async function () {
    const { stakingPool } = this;
    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const managerAddress = await stakingPool.manager();
    const managerSigner = await ethers.getImpersonatedSigner(managerAddress);

    await expect(
      stakingPool.connect(managerSigner).extendDeposit(MaxUint256, firstActiveTrancheId, maxTranche, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'InvalidTokenId');
  });

  it('reverts if new tranche ends before the initial tranche', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, maxTranche, firstActiveTrancheId, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'NewTrancheEndsBeforeInitialTranche');
  });

  it('reverts if new tranche is not yet available', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche + 1, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'RequestedTrancheIsNotYetActive');
  });

  it('reverts if the new tranche already expired', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId } = await getTranches();

    await increaseTime(TRANCHE_DURATION * 2);

    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, firstActiveTrancheId + 1, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'RequestedTrancheIsExpired');
  });

  it('reverts when the user is not token owner nor approved tries to extend the deposit', async function () {
    const { stakingPool } = this;
    const [notNFTOwnerNorApproved] = this.accounts.nonMembers;
    const { firstActiveTrancheId } = await getTranches();

    await expect(
      stakingPool
        .connect(notNFTOwnerNorApproved)
        .extendDeposit(depositNftId, firstActiveTrancheId, firstActiveTrancheId + 1, 0),
    ).to.be.revertedWithCustomError(stakingPool, 'NotTokenOwnerOrApproved');
  });

  it('withdraws and make a new deposit if initial tranche is expired', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await increaseTime(TRANCHE_DURATION);

    await expect(stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0)).to.emit(
      stakingPool,
      'StakeDeposited',
    );
    // TODO validate it also emits withdraw event
  });

  it('updates tranches including accNxmPerRewardsShare and lastAccNxmUpdate', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.lastAccNxmUpdate();

    await increaseTime(TRANCHE_DURATION);

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const accNxmPerRewardsShareAfter = await stakingPool.accNxmPerRewardsShare();
    const lastAccNxmUpdateAfter = await stakingPool.lastAccNxmUpdate();
    const { timestamp } = await ethers.provider.getBlock('latest');
    const depositData = await stakingPool.deposits(depositNftId, maxTranche);

    expect(accNxmPerRewardsShareAfter).to.gt(accNxmPerRewardsShareBefore);
    expect(accNxmPerRewardsShareAfter).to.equal(depositData.lastAccNxmPerRewardShare);
    expect(lastAccNxmUpdateAfter).to.gt(lastAccNxmUpdateBefore);
    expect(lastAccNxmUpdateAfter).to.equal(timestamp);
  });

  it('removes the initial tranche deposit and stores the new tranche deposit', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);

    expect(initialDeposit.stakeShares).to.not.equal(0);
    expect(initialDeposit.rewardsShares).to.not.equal(0);

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const updatedInitialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const newTrancheDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    const newRewardsIncrease = await getNewRewardShares({
      stakingPool,
      initialStakeShares: initialDeposit.stakeShares,
      stakeSharesIncrease: 0,
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: maxTranche,
    });

    expect(updatedInitialDeposit.stakeShares).to.equal(0);
    expect(updatedInitialDeposit.rewardsShares).to.equal(0);
    expect(updatedInitialDeposit.pendingRewards).to.equal(0);
    expect(updatedInitialDeposit.lastAccNxmPerRewardShare).to.equal(0);

    expect(newTrancheDeposit.stakeShares).to.equal(initialDeposit.stakeShares);
    expect(newTrancheDeposit.rewardsShares).to.equal(initialDeposit.rewardsShares.add(newRewardsIncrease));
    expect(newTrancheDeposit.pendingRewards).to.equal(
      initialDeposit.rewardsShares
        .mul(newTrancheDeposit.lastAccNxmPerRewardShare.sub(initialDeposit.lastAccNxmPerRewardShare))
        .div(parseEther('1')),
    );
    expect(newTrancheDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShare);
  });

  it('allows to increase the deposit', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const activeStake = await stakingPool.activeStake();
    const stakeSharesSupply = await stakingPool.stakeSharesSupply();

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    const newRewardsIncrease = await getNewRewardShares({
      stakingPool,
      initialStakeShares: initialDeposit.stakeShares,
      stakeSharesIncrease: updatedDeposit.stakeShares.sub(initialDeposit.stakeShares),
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: maxTranche,
    });

    expect(updatedDeposit.stakeShares).to.equal(
      initialDeposit.stakeShares.add(topUpAmount.mul(stakeSharesSupply).div(activeStake)),
    );
    expect(updatedDeposit.rewardsShares).to.equal(initialDeposit.rewardsShares.add(newRewardsIncrease));
    expect(updatedDeposit.pendingRewards).to.equal(
      initialDeposit.rewardsShares
        .mul(updatedDeposit.lastAccNxmPerRewardShare.sub(initialDeposit.lastAccNxmPerRewardShare))
        .div(parseEther('1')),
    );
    expect(updatedDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShare);
  });

  it('allows to increase the deposit in expired tranche', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    await increaseTime(TRANCHE_DURATION);

    const topUpAmount = parseEther('5');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();

    const newRewardsShares = await getNewRewardShares({
      stakingPool,
      initialStakeShares: 0,
      stakeSharesIncrease: updatedDeposit.stakeShares,
      initialTrancheId: maxTranche,
      newTrancheId: maxTranche,
    });

    const expectedStakeShares = Math.floor(Math.sqrt(amount.add(topUpAmount)));
    expect(updatedDeposit.stakeShares).to.equal(expectedStakeShares);
    expect(updatedDeposit.rewardsShares).to.equal(newRewardsShares);
    expect(updatedDeposit.pendingRewards).to.equal(0);
    expect(updatedDeposit.lastAccNxmPerRewardShare).to.equal(accNxmPerRewardsShare);
  });

  it('updates the initial and new tranche stake shares and reward shares', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    const managerDeposit = await stakingPool.deposits(managerDepositId, firstActiveTrancheId);
    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const initialTranche = await stakingPool.tranches(firstActiveTrancheId);

    expect(initialTranche.stakeShares).to.equal(initialDeposit.stakeShares);
    expect(initialTranche.rewardsShares).to.equal(initialDeposit.rewardsShares.add(managerDeposit.rewardsShares));

    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, 0);

    const newTrancheDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const updatedInitialTranche = await stakingPool.tranches(firstActiveTrancheId);
    const newTranche = await stakingPool.tranches(maxTranche);

    expect(updatedInitialTranche.stakeShares).to.equal(0);
    expect(updatedInitialTranche.rewardsShares).to.equal(managerDeposit.rewardsShares);

    expect(newTranche.stakeShares).to.equal(newTrancheDeposit.stakeShares);
    expect(newTranche.rewardsShares).to.equal(newTrancheDeposit.rewardsShares);
  });

  it('updates global stake and reward shares supply', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    const initialDeposit = await stakingPool.deposits(depositNftId, firstActiveTrancheId);
    const activeStake = await stakingPool.activeStake();
    const stakeSharesSupply = await stakingPool.stakeSharesSupply();
    const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const updatedDeposit = await stakingPool.deposits(depositNftId, maxTranche);
    const stakeSharesSupplyAfter = await stakingPool.stakeSharesSupply();
    const rewardsSharesSupplyAfter = await stakingPool.rewardsSharesSupply();

    const newRewardsIncrease = await getNewRewardShares({
      stakingPool,
      initialStakeShares: initialDeposit.stakeShares,
      stakeSharesIncrease: updatedDeposit.stakeShares.sub(initialDeposit.stakeShares),
      initialTrancheId: firstActiveTrancheId,
      newTrancheId: maxTranche,
    });

    expect(stakeSharesSupplyAfter).to.equal(stakeSharesSupply.add(topUpAmount.mul(stakeSharesSupply).div(activeStake)));
    expect(rewardsSharesSupplyAfter).to.equal(rewardsSharesSupply.add(newRewardsIncrease));
  });

  it('transfers increased deposit amount to token controller', async function () {
    const { stakingPool, nxm, tokenController } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await generateRewards(stakingPool, this.coverSigner);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(topUpAmount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(topUpAmount));
  });

  it('transfers correctly increased deposit amount if previous deposit exists', async function () {
    const { stakingPool, nxm, tokenController } = this;
    const [user] = this.accounts.members;
    const { amount } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    // add deposit to new tranche
    await stakingPool.connect(user).depositTo(amount, maxTranche, depositNftId, AddressZero);

    await generateRewards(stakingPool, this.coverSigner);

    const userBalanceBefore = await nxm.balanceOf(user.address);
    const tokenControllerBalanceBefore = await nxm.balanceOf(tokenController.address);

    const topUpAmount = parseEther('50');
    await stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);

    const userBalanceAfter = await nxm.balanceOf(user.address);
    const tokenControllerBalanceAfter = await nxm.balanceOf(tokenController.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(topUpAmount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(topUpAmount));
  });

  it('emits DepositExtended event', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const topUpAmount = parseEther('50');
    await expect(stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount))
      .to.emit(stakingPool, 'DepositExtended')
      .withArgs(user.address, depositNftId, firstActiveTrancheId, maxTranche, topUpAmount);
  });

  it('does not emit DepositExtended if initial tranche is expired', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await increaseTime(TRANCHE_DURATION);

    const topUpAmount = parseEther('50');
    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount),
    ).to.not.emit(stakingPool, 'DepositExtended');
  });

  it('reverts if pool is private', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const manager = this.accounts.defaultSender;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await stakingPool.connect(manager).setPoolPrivacy(true);

    const topUpAmount = parseEther('50');
    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount),
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');
  });

  it('reverts if pool is private and tranche expired', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const manager = this.accounts.defaultSender;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    await stakingPool.connect(manager).setPoolPrivacy(true);

    await increaseTime(TRANCHE_DURATION);

    const topUpAmount = parseEther('50');
    await expect(
      stakingPool.connect(user).extendDeposit(depositNftId, firstActiveTrancheId, maxTranche, topUpAmount),
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');
  });
});