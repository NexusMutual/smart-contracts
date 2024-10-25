const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { addresses } = require('@nexusmutual/deployments');

const { Address, EnzymeAdress, getSigner, UserAddress, calculateCurrentTrancheId } = require('./utils');
const { ContractCode } = require('../../lib/constants');
const { enrollMember } = require('../integration/utils/enroll');
const { daysToSeconds } = require('../../lib/helpers');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const { NXM_WHALE_2 } = UserAddress;
const evm = require('./evm')();
const ASSESSMENT_VOTER_COUNT = 3;

const { parseEther, toUtf8Bytes } = ethers.utils;
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

  const { payoutCooldownInDays } = await this.assessment.config();

  const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

  await setTime(futureTime);
}

describe('CoverBroker', function () {
  let coverId;
  let coverBrokerProductId;
  let poolId;
  let tokenId;
  let trancheId;
  let assessmentId;
  let requestedClaimAmount;
  let claimDeposit;

  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', addresses.NXMaster));
    const contractAddress = await this.master?.getLatestAddress(toUtf8Bytes(contractCode));
    return ethers.getContractAt(contractName, contractAddress);
  }

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
    trancheId = await calculateCurrentTrancheId();
  });

  it('load contracts', async function () {
    this.stakingProducts = await ethers.getContractAt('StakingProducts', addresses.StakingProducts);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.stakingViewer = await ethers.getContractAt('StakingViewer', addresses.StakingViewer);
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.pool = await ethers.getContractAt('ILegacyPool', addresses.Pool);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', addresses.YieldTokenIncidents);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', addresses.LegacyPooledStaking);
    this.gateway = await ethers.getContractAt('LegacyGateway', addresses.LegacyGateway);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('Impersonate new pool manager', async function () {
    await evm.impersonate(NXM_WHALE_2);
    await evm.setBalance(NXM_WHALE_2, parseEther('1000000'));
    this.manager = await getSigner(NXM_WHALE_2);
  });

  it('Change MemberRoles KYC Auth wallet to add new members', async function () {
    await evm.impersonate(addresses.Governance);
    await evm.setBalance(addresses.Governance, parseEther('1000'));
    const governanceSigner = await getSigner(addresses.Governance);

    this.kycAuthSigner = ethers.Wallet.createRandom().connect(ethers.provider);

    await this.memberRoles.connect(governanceSigner).setKycAuthAddress(this.kycAuthSigner.address);
  });

  it('Add product to be used for coverBroker', async function () {
    const productsBefore = await this.cover.getProducts();

    await this.cover.connect(this.abMembers[0]).setProducts([
      {
        productName: 'CoverBroker Product',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 0,
          yieldTokenAddress: AddressZero,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsAfter = await this.cover.getProducts();
    coverBrokerProductId = productsAfter.length - 1;
    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Create StakingPool', async function () {
    const manager = this.manager;
    const products = [
      {
        productId: coverBrokerProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
    ];

    const stakingPoolCountBefore = await this.stakingPoolFactory.stakingPoolCount();
    await this.cover.connect(manager).createStakingPool(false, 5, 5, products, 'description');
    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    poolId = stakingPoolCountAfter.toNumber();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const address = await this.cover.stakingPool(poolId);
    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('Deposit to StakingPool', async function () {
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

  it('Cover Broker Owner becomes a member', async function () {
    this.coverBrokerOwner = ethers.Wallet.createRandom().connect(ethers.provider);
    await evm.setBalance(this.coverBrokerOwner.address, parseEther('1000'));

    await enrollMember(
      { mr: this.memberRoles, tk: this.nxm, tc: this.tokenController },
      [this.coverBrokerOwner],
      this.kycAuthSigner,
      { initialTokens: 0 },
    );

    const isMember = await this.memberRoles.isMember(this.coverBrokerOwner.address);
    expect(isMember).to.be.equal(true);
  });

  it('Deploy CoverBroker contract and transfer ownership and membership', async function () {
    this.coverBroker = await ethers.deployContract('CoverBroker', [
      this.cover.address,
      this.memberRoles.address,
      this.nxm.address,
      this.master.address,
      this.coverBrokerOwner.address,
    ]);

    const ownerAfter = await this.coverBroker.owner();
    expect(this.coverBrokerOwner.address).to.be.equal(ownerAfter);

    await this.memberRoles.connect(this.coverBrokerOwner).switchMembership(this.coverBroker.address);
    const isMember = await this.memberRoles.isMember(this.coverBroker.address);
    expect(isMember).to.be.equal(true);
  });

  it('Buy cover using CoverBroker', async function () {
    this.coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    await evm.setBalance(this.coverBuyer.address, parseEther('1000000'));

    const coverAsset = 0; // ETH
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.coverDataCount();

    await this.coverBroker.connect(this.coverBuyer).buyCover(
      {
        coverId: 0,
        owner: this.coverBuyer.address,
        productId: coverBrokerProductId, // find cover product id
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: this.coverBuyer.address,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.coverDataCount();
    coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(this.coverBuyer.address, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Cover Buyer fails to claim cover without becoming a member', async function () {
    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const segmentId = (await this.cover.coverSegmentsCount(coverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(coverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      0, // ETH
    );
    await expect(
      this.individualClaims
        .connect(this.coverBuyer)
        .submitClaim(coverId, segmentId, requestedAmount, ipfsHash, { value: deposit }),
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
    const segmentId = (await this.cover.coverSegmentsCount(coverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(coverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      0, // ETH
    );
    await this.individualClaims
      .connect(this.coverBuyer)
      .submitClaim(coverId, segmentId, requestedAmount, ipfsHash, { value: deposit });

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
    const amount = parseEther('500');
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
    const tx = await this.individualClaims.connect(this.coverBuyer).redeemClaimPayout(claimId);
    const receipt = await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(this.coverBuyer.address);
    expect(balanceAfter).to.be.equal(
      balanceBefore.add(requestedClaimAmount).add(claimDeposit).sub(receipt.effectiveGasPrice.mul(receipt.gasUsed)),
    );

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });
});
