const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { submitProposal } = require('../utils').governance;
const { enrollClaimAssessor } = require('../utils/enroll');
const { stake } = require('../utils/staking');
const { BigNumber } = require('ethers');
const { parseEther, defaultAbiCoder } = ethers.utils;
const { AddressZero } = ethers.constants;
const { acceptClaim } = require('../utils/voteClaim');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const priceDenominator = '10000';

async function emergencyPauseSetup() {
  const fixture = await loadFixture(setup);
  const { tk } = fixture.contracts;
  const [member1, member2, member3] = fixture.accounts.members;
  await enrollClaimAssessor(fixture.contracts, [member1, member2, member3]);

  const members = fixture.accounts.members.slice(0, 5);
  const amount = parseEther('10000');

  for (const member of members) {
    await tk.connect(fixture.accounts.defaultSender).transfer(member.address, amount);
  }

  return fixture;
}

describe('emergency pause', function () {
  it('should revert when not called by emergency admin', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { master } = fixture.contracts;
    const [unknown] = fixture.accounts.nonMembers;

    await expect(master.connect(unknown).setEmergencyPause(true), 'NXMaster: Not emergencyAdmin');
  });

  it('should be able to start and end emergency pause', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { master } = fixture.contracts;
    const emergencyAdmin = fixture.accounts.emergencyAdmin;

    assert.equal(await master.isPause(), false);

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    assert.equal(await master.isPause(), true);

    await master.connect(emergencyAdmin).setEmergencyPause(false);

    assert.equal(await master.isPause(), false);
  });

  it('should be able to perform proxy and replaceable upgrades during emergency pause', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { master, gv, spf, tk, stakingNFT } = fixture.contracts;
    const emergencyAdmin = fixture.accounts.emergencyAdmin;
    const owner = fixture.accounts.defaultSender;

    const voters = [owner, ...fixture.accounts.advisoryBoardMembers];
    assert.equal(await master.isPause(), false);

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    const mcrCode = hex('MC');
    const tcCode = hex('TC');

    const MCR = await ethers.getContractFactory('MCR');
    const newMCR = await MCR.deploy(master.address, 0);
    const TokenController = await ethers.getContractFactory('TokenController');
    const newTokenControllerImplementation = await TokenController.deploy(spf.address, tk.address, stakingNFT.address);

    const contractCodes = [mcrCode, tcCode];
    const newAddresses = [newMCR.address, newTokenControllerImplementation.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);
    await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, voters);

    const tcAddress = await master.getLatestAddress(tcCode);
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', tcAddress);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newTokenControllerImplementation.address);
  });

  it('should be able to perform master upgrade during emergency pause', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { master, gv } = fixture.contracts;
    const emergencyAdmin = fixture.accounts.emergencyAdmin;
    const owner = fixture.accounts.defaultSender;

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    const NXMaster = await ethers.getContractFactory('NXMaster');
    const newMaster = await NXMaster.deploy();

    const upgradeContractsData = defaultAbiCoder.encode(['address'], [newMaster.address]);

    await submitProposal(gv, ProposalCategory.upgradeMaster, upgradeContractsData, [
      owner,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', master.address);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newMaster.address);
  });

  it('stops cover purchases', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { master, cover } = fixture.contracts;
    const emergencyAdmin = fixture.accounts.emergencyAdmin;
    const [member] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const amount = parseEther('1');
    const expectedPremium = amount.div(10);

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    await expect(
      cover.connect(member).buyCover(
        {
          owner: member.address,
          coverId: 0,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount.toString() }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('System is paused');
  });

  it('stops claim payouts on redeemPayout', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, master } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;
    const emergencyAdmin = fixture.accounts.emergencyAdmin;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCTS[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: 0,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    // redeem payout
    await expect(ci.redeemClaimPayout(0)).to.be.revertedWith('System is paused');
  });

  it('stops claim voting', async function () {
    const fixture = await loadFixture(emergencyPauseSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, master } = fixture.contracts;
    const [coverBuyer1, staker1] = fixture.accounts.members;
    const emergencyAdmin = fixture.accounts.emergencyAdmin;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCTS[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: 0,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentStakingAmount = parseEther('1000');
    await as.connect(staker1).stake(assessmentStakingAmount);

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    await expect(as.connect(staker1).castVotes([0], [true], ['Assessment data hash'], 0)).to.be.revertedWith(
      'System is paused',
    );
  });
});
