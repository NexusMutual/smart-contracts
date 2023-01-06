const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const { submitProposal } = require('../utils').governance;
const { enrollClaimAssessor } = require('../utils/enroll');
const { stake } = require('../utils/staking');
const { BigNumber } = require('ethers');
const { parseEther, defaultAbiCoder } = ethers.utils;
const { MaxUint256, AddressZero } = ethers.constants;
const { acceptClaim } = require('../utils/voteClaim');

const priceDenominator = '10000';

describe('emergency pause', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;
    const [member1, member2, member3] = this.accounts.members;
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');

    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('should revert when not called by emergency admin', async function () {
    const { master } = this.contracts;
    const [unknown] = this.accounts.nonMembers;

    await expect(master.connect(unknown).setEmergencyPause(true), 'NXMaster: Not emergencyAdmin');
  });

  it('should be able to start and end emergency pause', async function () {
    const { master } = this.contracts;
    const emergencyAdmin = this.accounts.emergencyAdmin;

    assert.equal(await master.isPause(), false);

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    assert.equal(await master.isPause(), true);

    await master.connect(emergencyAdmin).setEmergencyPause(false);

    assert.equal(await master.isPause(), false);
  });

  it('should be able to perform proxy and replaceable upgrades during emergency pause', async function () {
    const { master, gv, qd, lcr, spf } = this.contracts;
    const emergencyAdmin = this.accounts.emergencyAdmin;
    const owner = this.accounts.defaultSender;

    assert.equal(await master.isPause(), false);

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    const mcrCode = hex('MC');
    const tcCode = hex('TC');

    const MCR = await ethers.getContractFactory('MCR');
    const newMCR = await MCR.deploy(master.address);
    const TokenController = await ethers.getContractFactory('TokenController');
    const newTokenControllerImplementation = await TokenController.deploy(qd.address, lcr.address, spf.address);

    const contractCodes = [mcrCode, tcCode];
    const newAddresses = [newMCR.address, newTokenControllerImplementation.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);
    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const tcAddress = await master.getLatestAddress(tcCode);
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', tcAddress);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newTokenControllerImplementation.address);
  });

  it('should be able to perform master upgrade during emergency pause', async function () {
    const { master, gv } = this.contracts;
    const emergencyAdmin = this.accounts.emergencyAdmin;
    const owner = this.accounts.defaultSender;

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    const NXMaster = await ethers.getContractFactory('NXMaster');
    const newMaster = await NXMaster.deploy();

    const upgradeContractsData = defaultAbiCoder.encode(['address'], [newMaster.address]);

    await submitProposal(gv, ProposalCategory.upgradeMaster, upgradeContractsData, [owner]);

    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', master.address);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newMaster.address);
  });

  it('stops token buys and sells', async function () {
    const { master, p1: pool } = this.contracts;
    const emergencyAdmin = this.accounts.emergencyAdmin;

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    await expect(pool.buyNXM('0', { value: parseEther('1') })).to.be.revertedWith('System is paused');
    await expect(pool.sellNXM(parseEther('1'), '0')).to.be.revertedWith('System is paused');
  });

  it('stops cover purchases', async function () {
    const { master, cover } = this.contracts;
    const emergencyAdmin = this.accounts.emergencyAdmin;
    const [member] = this.accounts.members;

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
          coverId: MaxUint256,
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
        [{ poolId: '0', coverAmountInAsset: amount.toString(), allocationId: MaxUint256 }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('System is paused');
  });

  it('stops claim payouts on redeemPayout', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool0, as, master } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;
    const emergencyAdmin = this.accounts.emergencyAdmin;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCTS[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
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
      [{ poolId: '0', coverAmountInAsset: amount.toString(), allocationId: MaxUint256 }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    await master.connect(emergencyAdmin).setEmergencyPause(true);

    // redeem payout
    await expect(ic.redeemClaimPayout(0)).to.be.revertedWith('System is paused');
  });

  it('stops claim voting', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool0, as, master } = this.contracts;
    const [coverBuyer1, staker1] = this.accounts.members;
    const emergencyAdmin = this.accounts.emergencyAdmin;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCTS[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
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
      [{ poolId: '0', coverAmountInAsset: amount.toString(), allocationId: MaxUint256 }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
