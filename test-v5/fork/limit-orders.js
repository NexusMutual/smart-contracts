const { ethers } = require('hardhat');
const { expect } = require('chai');
const { addresses } = require('@nexusmutual/deployments');

const { getSigner, calculateCurrentTrancheId } = require('./utils');
const { enrollMember } = require('../integration/utils/enroll');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const { signLimitOrder } = require('../utils/buyCover');
const ASSESSMENT_VOTER_COUNT = 3;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function castAssessmentVote(assessmentId) {
  // vote
  for (const abMember of this.abMembers.slice(0, ASSESSMENT_VOTER_COUNT)) {
    await this.assessment.connect(abMember).castVotes([assessmentId], [true], [''], 0);
  }

  const { poll: pollResult } = await this.assessment.assessments(assessmentId);
  const poll = pollResult;

  const payoutCooldown = (await this.assessment.getPayoutCooldown()).toNumber();

  const futureTime = poll.end + payoutCooldown;

  await setTime(futureTime);
}

describe('LimitOrders', function () {
  let coverId;
  let limitOrdersProductId;
  let poolId;
  let tokenId;
  let assessmentId;
  let requestedClaimAmount;
  let claimDeposit;

  it('Impersonate new pool manager', async function () {
    await this.evm.impersonate(this.managerAddress);
    await this.evm.setBalance(this.managerAddress, parseEther('1000000'));
    this.manager = await getSigner(this.managerAddress);
  });

  it('Change MemberRoles KYC Auth wallet to add new members', async function () {
    await this.evm.impersonate(addresses.Governance);
    await this.evm.setBalance(addresses.Governance, parseEther('1000'));
    const governanceSigner = await getSigner(addresses.Governance);

    this.kycAuthSigner = ethers.Wallet.createRandom().connect(ethers.provider);

    await this.memberRoles.connect(governanceSigner).setKycAuthAddress(this.kycAuthSigner.address);
  });

  it('Add product to be used for LimitOrders', async function () {
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'LimitOrders Product',
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
    limitOrdersProductId = productsAfter.length - 1;
    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Create StakingPool', async function () {
    const manager = this.manager;
    const products = [
      {
        productId: limitOrdersProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
    ];

    const stakingPoolCountBefore = await this.stakingPoolFactory.stakingPoolCount();
    await this.stakingProducts.connect(manager).createStakingPool(false, 5, 5, products, 'description');
    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    poolId = stakingPoolCountAfter.toNumber();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const address = await this.cover.stakingPool(poolId);
    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('Deposit to StakingPool', async function () {
    const trancheId = await calculateCurrentTrancheId();
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const totalSupplyBefore = await this.stakingNFT.totalSupply();
    const amount = parseEther('100');

    await this.nxm.connect(manager).approve(this.tokenController.address, amount);
    await this.stakingPool.connect(manager).depositTo(amount, trancheId + 2, 0, AddressZero);

    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    tokenId = totalSupplyAfter;
    const owner = await this.stakingNFT.ownerOf(tokenId);

    expect(totalSupplyAfter).to.equal(totalSupplyBefore.add(1));
    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(owner).to.equal(managerAddress);
  });

  it('Buy cover using LimitOrders', async function () {
    this.coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    await this.evm.setBalance(this.coverBuyer.address, parseEther('20000000000'));
    await this.weth.connect(this.coverBuyer).deposit({ value: parseEther('100') });
    await this.weth.connect(this.coverBuyer).approve(this.limitOrders.address, parseEther('100'));

    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.coverNFT.totalSupply();

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const maxPremiumInAsset = parseEther('1').mul(260).div(10000);
    const orderDetails = {
      coverId: 0,
      productId: limitOrdersProductId,
      amount,
      period: 3600 * 24 * 30, // 30 days
      ipfsData: '',
      paymentAsset: 0,
      coverAsset: 0,
      owner: this.coverBuyer.address,
      commissionRatio,
      commissionDestination: this.managerAddress,
    };

    const executionDetails = {
      buyer: this.coverBuyer.address,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      renewableUntil: 0,
      renewablePeriodBeforeExpiration: 0,
      maxPremiumInAsset,
    };

    const settlementDetails = {
      fee: 0,
      feeDestination: this.managerAddress,
    };

    const { signature } = await signLimitOrder(
      this.limitOrders.address,
      { orderDetails, executionDetails },
      this.coverBuyer,
    );

    await this.limitOrders.connect(this.manager).executeOrder(
      {
        ...orderDetails,
        maxPremiumInAsset,
      },
      [{ poolId, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      settlementDetails,
    );

    const coverCountAfter = await this.coverNFT.totalSupply();
    coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(this.coverBuyer.address, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
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
    ).to.revertedWith('Caller is not a member');
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
    for (const abMember of this.abMembers.slice(0, ASSESSMENT_VOTER_COUNT)) {
      const memberAddress = await abMember.getAddress();
      const { amount: stakeAmountBefore } = await this.assessment.stakeOf(memberAddress);
      await this.assessment.connect(abMember).stake(amount);
      const { amount: stakeAmountAfter } = await this.assessment.stakeOf(memberAddress);
      expect(stakeAmountAfter).to.be.equal(stakeAmountBefore.add(amount));
    }
  });

  it('Process assessment for custody cover and ETH payout', async function () {
    await castAssessmentVote.call(this, assessmentId);

    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const balanceBefore = await ethers.provider.getBalance(this.coverBuyer.address);

    // redeem payout
    await this.evm.setNextBlockBaseFee(0);
    await this.individualClaims.connect(this.coverBuyer).redeemClaimPayout(claimId, { gasPrice: 0 });

    const balanceAfter = await ethers.provider.getBalance(this.coverBuyer.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(requestedClaimAmount).add(claimDeposit));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });
});
