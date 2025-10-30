const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { addresses, abis } = require('@nexusmutual/deployments');

const { UserAddress, getSigner, calculateCurrentTrancheId } = require('./utils');
const { enrollMember } = require('../integration/utils/enroll');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const evm = require('./evm')();
const ASSESSMENT_VOTER_COUNT = 3;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function castAssessmentVote(assessmentId) {
  // vote
  await Promise.all(
    this.abMembers
      .slice(0, ASSESSMENT_VOTER_COUNT)
      .map(abMember => this.assessment.connect(abMember).castVotes([assessmentId], [true], [''], 0)),
  );

  const { poll } = await this.assessment.assessments(assessmentId);

  const payoutCooldown = (await this.assessment.getPayoutCooldown()).toNumber();

  const futureTime = poll.end + payoutCooldown;

  await setTime(futureTime);
}

describe('CoverBroker', function () {
  let coverId;
  let coverBrokerProductId;
  let poolId;
  let tokenId;
  let assessmentId;
  let requestedClaimAmount;
  let claimDeposit;

  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
    this.evm = evm;
  });

  require('./setup');

  it('Impersonate new pool manager', async function () {
    await Promise.all([
      evm.impersonate(UserAddress.NXM_WHALE_1),
      evm.setBalance(UserAddress.NXM_WHALE_1, parseEther('1000000')),
    ]);
    this.manager = await getSigner(UserAddress.NXM_WHALE_1);
  });

  it('Change MemberRoles KYC Auth wallet to add new members', async function () {
    await Promise.all([
      evm.impersonate(addresses.Governance),
      evm.setBalance(addresses.Governance, parseEther('1000')),
    ]);
    const governanceSigner = await getSigner(addresses.Governance);

    this.kycAuthSigner = ethers.Wallet.createRandom().connect(ethers.provider);

    await this.memberRoles.connect(governanceSigner).setKycAuthAddress(this.kycAuthSigner.address);
  });

  it('Add product to be used for coverBroker', async function () {
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'CoverBroker Product',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 0,
          minPrice: 0,
          __gap: 0,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsAfter = await this.coverProducts.getProducts();
    coverBrokerProductId = productsAfter.length - 1;
    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Create StakingPool', async function () {
    const products = [
      {
        productId: coverBrokerProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
    ];

    const stakingPoolCountBefore = await this.stakingPoolFactory.stakingPoolCount();
    await this.stakingProducts.connect(this.manager).createStakingPool(false, 5, 5, products, 'description');
    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    poolId = stakingPoolCountAfter.toNumber();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const address = await this.cover.stakingPool(poolId);
    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('Deposit to StakingPool', async function () {
    const trancheId = await calculateCurrentTrancheId();
    const managerAddress = await this.manager.getAddress();
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const totalSupplyBefore = await this.stakingNFT.totalSupply();
    const amount = parseEther('100');

    await this.nxm.connect(this.manager).approve(this.tokenController.address, amount);
    await this.stakingPool.connect(this.manager).depositTo(amount, trancheId + 2, 0, AddressZero);

    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    tokenId = totalSupplyAfter;
    const owner = await this.stakingNFT.ownerOf(tokenId);

    expect(totalSupplyAfter).to.equal(totalSupplyBefore.add(1));
    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(owner).to.equal(managerAddress);
  });

  it('get old cover broker owner', async function () {
    this.oldCoverBroker = await ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker);
    const coverBrokerOwnerAddress = await this.oldCoverBroker.owner();
    this.coverBrokerOwner = await getSigner(coverBrokerOwnerAddress);
  });

  it('Deploy CoverBroker contract and transfer ownership and membership', async function () {
    const coverBrokerOwnerAddress = await this.coverBrokerOwner.getAddress();
    this.coverBroker = await ethers.deployContract('CoverBroker', [
      this.cover.address,
      this.memberRoles.address,
      this.nxm.address,
      this.master.address,
      coverBrokerOwnerAddress,
    ]);

    const ownerAfter = await this.coverBroker.owner();
    expect(coverBrokerOwnerAddress).to.be.equal(ownerAfter);
  });

  it('pass membership from old coverBroker to new coverBroker', async function () {
    await this.oldCoverBroker.connect(this.coverBrokerOwner).switchMembership(this.coverBroker.address);
  });

  it('max approve Cover contract', async function () {
    await Promise.all([
      this.coverBroker.connect(this.coverBrokerOwner).maxApproveCoverContract(this.usdc.address),
      this.coverBroker.connect(this.coverBrokerOwner).maxApproveCoverContract(this.cbBTC.address),
      this.coverBroker.connect(this.coverBrokerOwner).maxApproveCoverContract(this.nxm.address),
    ]);
  });

  it('Buy cover using CoverBroker', async function () {
    this.coverBuyer = ethers.Wallet.createRandom().connect(ethers.provider);
    await Promise.all([
      evm.setBalance(this.coverBuyer.address, parseEther('1000000')),
      evm.impersonate(this.coverBuyer.address),
    ]);

    const amount = parseEther('1');
    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.coverBroker.connect(this.coverBuyer).buyCover(
      {
        coverId: '0',
        owner: this.coverBuyer.address,
        productId: coverBrokerProductId,
        coverAsset: 0, // ETH
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: 0, // ETH
        commissionRatio: '0',
        commissionDestination: '0xd2eee629994e83194db1d59cfcf9eaa923c8e110',
        ipfsData: 'QmPS2YYpgkwYu8jhaWQouLyvUsJeBg3BVf5WcAF1XJ2URy',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
    coverId = coverCountAfter;
  });

  it('Cover Buyer fails to claim cover without becoming a member', async function () {
    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const coverData = await this.cover.getCoverData(coverId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      coverData.period,
      0, // ETH
    );

    await expect(
      this.individualClaims
        .connect(this.coverBuyer)
        .submitClaim(coverId, requestedAmount, ipfsHash, { value: deposit }),
    ).to.be.reverted;
  });

  it('Cover Buyer becomes a member', async function () {
    await enrollMember(
      { mr: this.memberRoles, tk: this.nxm, tc: this.tokenController },
      [this.coverBuyer],
      this.kycAuthSigner,
      { initialTokens: 0 },
    );

    const isMember = await this.memberRoles.isMember(this.coverBuyer.address);
    expect(isMember).to.be.equal(true);
  });

  it('Cover Buyer submits claim', async function () {
    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const coverData = await this.cover.getCoverData(coverId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      coverData.period,
      0, // ETH
    );
    await this.individualClaims
      .connect(this.coverBuyer)
      .submitClaim(coverId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Stake for assessment', async function () {
    // stake
    const amount = parseEther('100');
    await Promise.all(
      this.abMembers.slice(0, ASSESSMENT_VOTER_COUNT).map(async abMember => {
        const memberAddress = await abMember.getAddress();
        const { amount: stakeAmountBefore } = await this.assessment.stakeOf(memberAddress);
        await this.assessment.connect(abMember).stake(amount);
        const { amount: stakeAmountAfter } = await this.assessment.stakeOf(memberAddress);
        expect(stakeAmountAfter).to.be.equal(stakeAmountBefore.add(amount));
      }),
    );
  });

  it('Process assessment for custody cover and ETH payout', async function () {
    await castAssessmentVote.call(this, assessmentId);

    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const balanceBefore = await ethers.provider.getBalance(this.coverBuyer.address);

    // redeem payout
    if (network.name !== 'tenderly') {
      await this.evm.setNextBlockBaseFee(0);
    }
    await this.individualClaims.connect(this.coverBuyer).redeemClaimPayout(claimId, { gasPrice: 0 });

    const balanceAfter = await ethers.provider.getBalance(this.coverBuyer.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(requestedClaimAmount).add(claimDeposit));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  require('./basic-functionality-tests');
});
