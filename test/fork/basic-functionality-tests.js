const {
  ethers,
  ethers: { deployContract },
} = require('hardhat');

const { parseEther, defaultAbiCoder, toUtf8Bytes, formatEther } = ethers.utils;
const { expect } = require('chai');
const { AddressZero, MaxUint256 } = ethers.constants;
const evm = require('./evm')();
const {
  Address,
  UserAddress,
  EnzymeAdress,
  PriceFeedOracle,
  calculateCurrentTrancheId,
  getSigner,
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
  toBytes,
  enableAsEnzymeReceiver,
} = require('./utils');

const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { BigNumber } = require('ethers');
const { proposalCategories } = require('../utils');
const { daysToSeconds } = require('../../lib/helpers');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const { InternalContractsIDs } = require('../utils').constants;

const { DAI_ADDRESS, STETH_ADDRESS } = Address;
const { NXM_WHALE_1, NXM_WHALE_2, DAI_NXM_HOLDER, NXMHOLDER, DAI_HOLDER } = UserAddress;
const { ENZYMEV4_VAULT_PROXY_ADDRESS } = EnzymeAdress;
const {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR,
  STETH_PRICE_FEED_ORACLE_AGGREGATOR,
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
} = PriceFeedOracle;

let ybDAI, ybETH;

let ybDaiProductId, ybDaiCoverId, ybDaiIncidentId;
let ybEthProductId;
let custodyProductId, custodyCoverId;
let protocolProductId, protocolCoverId;
let assessmentId, requestedClaimAmount, claimDeposit;
let poolId, trancheId, tokenId;

const NEW_POOL_MANAGER = NXM_WHALE_1;
async function compareProxyImplementationAddress(proxyAddress, addressToCompare) {
  const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
  const implementationAddress = await proxy.implementation();
  expect(implementationAddress).to.be.equal(addressToCompare);
}

const ASSESSMENT_VOTER_COUNT = 3;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function castAssessmentVote() {
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

describe('basic functionality tests', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    await evm.increaseTime(7 * 24 * 3600); // +7 days
    trancheId = await calculateCurrentTrancheId();
  });

  it('Impersonate addresses', async function () {
    await evm.impersonate(NXM_WHALE_1);
    await evm.impersonate(NXM_WHALE_2);
    await evm.impersonate(NXMHOLDER);
    await evm.impersonate(NEW_POOL_MANAGER);
    await evm.setBalance(NXM_WHALE_1, parseEther('1000'));
    await evm.setBalance(NXM_WHALE_2, parseEther('1000'));
    await evm.setBalance(NXMHOLDER, parseEther('1000'));
    await evm.setBalance(NEW_POOL_MANAGER, parseEther('1000'));
    await evm.setBalance(DAI_HOLDER, parseEther('1000'));

    this.members = [];
    this.members.push(await getSigner(NXM_WHALE_1));
    this.members.push(await getSigner(NXM_WHALE_2));
    this.members.push(await getSigner(NXMHOLDER));

    this.manager = await getSigner(NEW_POOL_MANAGER);

    await evm.impersonate(DAI_HOLDER);
    this.daiHolder = await getSigner(DAI_HOLDER);
  });

  it('Verify dependencies for each contract', async function () {
    // IMPORTANT: This mapping needs to be updated if we add new dependencies to the contracts.
    const dependenciesToVerify = {
      AS: ['TC', 'MR'],
      CI: ['TC', 'MR', 'P1', 'CO', 'AS'],
      CG: ['TC', 'MR', 'P1', 'CO', 'AS'],
      MC: ['P1', 'MR', 'CO'],
      P1: ['TC', 'MC', 'MR'],
      CO: ['P1', 'TC', 'MR', 'SP'],
      CL: ['CO', 'TC', 'CI'],
      MR: ['TC', 'P1', 'CO'], // add the following after MR upgrade: ['PS', 'AS'],
      GW: ['MR', 'CL', 'TK'],
      PS: ['TC', 'MR', 'TK'],
      SP: [], // none
      TC: ['PS', 'AS', 'CO', 'GV', 'P1'],
    };

    const latestAddresses = {};
    const master = this.master;
    const nxmAddress = this.nxm.address;
    async function getLatestAddress(contractCode) {
      if (contractCode === 'TK') {
        return nxmAddress;
      }
      if (!latestAddresses[contractCode]) {
        latestAddresses[contractCode] = await master.getLatestAddress(toUtf8Bytes(contractCode));
      }
      return latestAddresses[contractCode];
    }

    for (const contractCode of Object.keys(dependenciesToVerify)) {
      const dependencies = dependenciesToVerify[contractCode];

      const masterAwareV2 = await ethers.getContractAt('IMasterAwareV2', await getLatestAddress(contractCode));

      for (const dependency of dependencies) {
        const dependencyAddress = await getLatestAddress(dependency);

        const contractId = InternalContractsIDs[dependency];
        const storedDependencyAddress = await masterAwareV2.internalContracts(contractId);
        expect(storedDependencyAddress).to.be.equal(dependencyAddress);
      }
    }
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

  it('Buy NXM', async function () {
    const buyValue = parseEther('1');
    const buyer = this.abMembers[0];
    const buyerAddress = buyer.getAddress();

    const balanceBefore = await this.nxm.balanceOf(buyerAddress);
    const totalAssetValue = await this.pool.getPoolValueInEth();
    const mcrEth = this.mcr.getMCR();
    const expectedTokensReceived = await this.pool.calculateNXMForEth(buyValue, totalAssetValue, mcrEth);

    await this.pool.connect(buyer).buyNXM('0', { value: buyValue });
    const balanceAfter = await this.nxm.balanceOf(buyerAddress);
    expect(balanceAfter).to.be.equal(balanceBefore.add(expectedTokensReceived));
  });

  it('Buy NXM until you can sell NXM', async function () {
    const buyer = this.abMembers[0];
    const buyerAddress = await buyer.getAddress();

    let currentTotalAssetValue = await this.pool.getPoolValueInEth();
    let mcrEth = await this.mcr.getMCR();
    while (mcrEth > currentTotalAssetValue) {
      const buyValue = BigNumber.from(mcrEth.toString().slice(0, -2)).mul(5);
      await evm.setBalance(buyerAddress, parseEther('10000000'));
      await this.pool.connect(buyer).buyNXM('0', { value: buyValue });
      mcrEth = await this.mcr.getMCR();
      currentTotalAssetValue = await this.pool.getPoolValueInEth();
    }
    expect(currentTotalAssetValue).to.be.greaterThan(mcrEth);
  });

  it('Sell NXM', async function () {
    const sellValue = parseEther('1');
    const buyer = this.abMembers[0];
    const buyerAddress = buyer.getAddress();

    const balanceBefore = await ethers.provider.getBalance(buyerAddress);
    const currentTotalAssetValue = await this.pool.getPoolValueInEth();
    const mcr = await this.mcr.getMCR();
    const expectedTokensReceived = await this.pool.calculateEthForNXM(sellValue, currentTotalAssetValue, mcr);

    const tx = await this.pool.connect(buyer).sellNXM(sellValue, '0');
    const receipt = await tx.wait();
    const txCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
    const balanceAfter = await ethers.provider.getBalance(buyerAddress);

    expect(balanceAfter).to.be.equal(balanceBefore.add(expectedTokensReceived).sub(txCost));
  });

  it('Add product types', async function () {
    const productTypes = [
      {
        productTypeName: 'x',
        productTypeId: MaxUint256,
        ipfsMetadata: 'protocolCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'protocolCoverIPFSHash',
          claimMethod: 0,
          gracePeriod: 30,
        },
      },
      {
        productTypeName: 'y',
        productTypeId: MaxUint256,
        ipfsMetadata: 'custodyCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'custodyCoverIPFSHash',
          claimMethod: 0,
          gracePeriod: 90,
        },
      },
      {
        productTypeName: 'z',
        productTypeId: MaxUint256,
        ipfsMetadata: 'yieldTokenCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
          claimMethod: 1,
          gracePeriod: 14,
        },
      },
    ];

    const productTypesCountBefore = await this.coverProducts.productTypesCount();
    await this.coverProducts.connect(this.abMembers[0]).setProductTypes(productTypes);
    const productTypesCountAfter = await this.coverProducts.productTypesCount();
    expect(productTypesCountAfter).to.be.equal(productTypesCountBefore.add(productTypes.length));
  });

  it('Add ybDAI yield token cover', async function () {
    ybDAI = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'ybDAI yield token',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 2,
          yieldTokenAddress: ybDAI.address,
          coverAssets: 2,
          initialPriceRatio: 1000,
          capacityReductionRatio: 1000,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsAfter = await this.coverProducts.getProducts();
    ybDaiProductId = productsAfter.length - 1;

    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Add ybETH yield token cover', async function () {
    ybETH = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'ybETH yield token',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 2,
          yieldTokenAddress: ybETH.address,
          coverAssets: 1,
          initialPriceRatio: 1000,
          capacityReductionRatio: 1000,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsAfter = await this.coverProducts.getProducts();
    ybEthProductId = productsAfter.length - 1;

    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Add protocol product', async function () {
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'Protocol Product',
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

    const productsAfter = await this.coverProducts.getProducts();
    protocolProductId = productsAfter.length - 1;
    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Add custody product', async function () {
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'Custody Product',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 1,
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

    const productsAfter = await this.coverProducts.getProducts();
    custodyProductId = productsAfter.length - 1;
    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Create StakingPool', async function () {
    const manager = this.manager;
    const products = [
      {
        productId: ybDaiProductId, // ybDAI
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
      {
        productId: ybEthProductId, // ybETH
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
      {
        productId: custodyProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
      {
        productId: protocolProductId,
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

    const address = await this.stakingProducts.stakingPool(poolId);
    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('Deposit to StakingPool', async function () {
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const totalSupplyBefore = await this.stakingNFT.totalSupply();
    const amount = parseEther('100');

    await this.stakingPool.connect(manager).depositTo(amount, trancheId + 1, 0, AddressZero);

    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    tokenId = totalSupplyAfter;
    const owner = await this.stakingNFT.ownerOf(tokenId);

    expect(totalSupplyAfter).to.equal(totalSupplyBefore.add(1));
    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(owner).to.equal(managerAddress);
  });

  it('Extend existing deposit in StakingPool', async function () {
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const amount = parseEther('5000');
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const tokenControllerBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    await this.stakingPool.connect(manager).extendDeposit(tokenId, trancheId + 1, trancheId + 7, amount);

    const tokenControllerBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);

    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
  });

  it('Buy ybDAI yield token cover with DAI', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 1; // DAI
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const dai = await ethers.getContractAt('ERC20MintableDetailed', DAI_ADDRESS);
    await dai.connect(coverBuyer).approve(this.cover.address, amount);
    const coverCountBefore = await this.cover.coverDataCount();

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: ybDaiProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: '0' },
    );

    const coverCountAfter = await this.cover.coverDataCount();
    ybDaiCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Buy ybETH yield token cover with ETH', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 0; // ETH
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.coverDataCount();

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: ybEthProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.coverDataCount();

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Add proposal category 45 (Submit Incident for Yield Token)', async function () {
    await submitGovernanceProposal(
      // addCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.addCategory,
      defaultAbiCoder.encode(
        [
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string',
        ],
        proposalCategories[PROPOSAL_CATEGORIES.submitYieldTokenIncident],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('Create Yield Token Incident for ybDAI cover', async function () {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    ybDaiIncidentId = (await this.yieldTokenIncidents.getIncidentsCount()).toNumber();

    const assessmentCountBefore = await this.assessment.getAssessmentsCount();
    assessmentId = assessmentCountBefore.toString();

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.submitYieldTokenIncident,
      defaultAbiCoder.encode(
        ['uint24', 'uint96', 'uint32', 'uint', 'string'],
        [ybDaiProductId, parseEther('1.1'), currentTime, parseEther('20000'), 'hashedMetadata'],
      ),
      this.abMembers,
      this.governance,
    );

    await castAssessmentVote.call(this);
  });

  it('redeem ybDAI cover', async function () {
    const member = DAI_NXM_HOLDER;
    const coverBuyer = await getSigner(member);

    const claimedAmount = parseEther('1');

    await ybDAI.mint(member, parseEther('10000000'));

    await ybDAI.connect(coverBuyer).approve(this.yieldTokenIncidents.address, parseEther('10000000'));

    const daiBalanceBefore = await this.dai.balanceOf(member);
    await this.yieldTokenIncidents
      .connect(coverBuyer)
      .redeemPayout(ybDaiIncidentId, ybDaiCoverId, 0, claimedAmount, member, []);

    const daiBalanceAfter = await this.dai.balanceOf(member);

    const priceBefore = parseEther('1.1');
    const coverAssetDecimals = ethers.BigNumber.from('10').pow(18);

    const { payoutDeductibleRatio } = await this.yieldTokenIncidents.config();
    const INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR = '10000';

    const ratio = priceBefore.mul(payoutDeductibleRatio);

    const payoutAmount = claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals);
    const expectedBalanceAfter = daiBalanceBefore.add(payoutAmount);

    expect(daiBalanceAfter).to.be.equal(expectedBalanceAfter);
  });

  it('Buy custody cover and edit it', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 0; // ETH
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.coverDataCount();

    const period = 3600 * 24 * 30; // 30 days

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: custodyProductId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    // Edit cover to increase amount and period
    const passedPeriod = 3 * 24 * 3600; // 3 days
    await evm.increaseTime(passedPeriod);

    const coverCountAfter = await this.cover.coverDataCount();
    custodyCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
    const increasedAmount = amount.mul(2);
    const extraPeriod = 10 * 24 * 3600; // 10 days

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: custodyCoverId,
        owner: coverBuyerAddress,
        productId: custodyProductId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: increasedAmount }],
      { value: amount },
    );

    const postEditSegment = 1;
    const newSegmentCover = await this.cover.coverSegmentWithRemainingAmount(custodyCoverId, postEditSegment);

    expect(newSegmentCover.amount).to.be.equal(increasedAmount);
  });

  it('Buy custody cover', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 0; // ETH
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.coverDataCount();

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: custodyProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.coverDataCount();
    custodyCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Submit claim for ETH custody cover', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);

    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const segmentId = (await this.cover.coverSegmentsCount(custodyCoverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(custodyCoverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      0, // ETH
    );
    await this.individualClaims
      .connect(coverBuyer)
      .submitClaim(custodyCoverId, segmentId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Process assessment for custody cover and ETH payout', async function () {
    await castAssessmentVote.call(this);

    const coverIdV2 = custodyCoverId;
    const coverBuyerAddress = DAI_NXM_HOLDER;
    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const memberAddress = await this.coverNFT.ownerOf(coverIdV2);

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyerAddress);

    console.log(`Current member balance ${ethBalanceBefore.toString()}. Redeeming claim ${claimId}`);

    // redeem payout
    await this.individualClaims.redeemClaimPayout(claimId);

    const ethBalanceAfter = await ethers.provider.getBalance(memberAddress);

    console.log(`Check correct balance increase`);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(requestedClaimAmount).add(claimDeposit));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('Buy protocol DAI cover', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 1; // DAI
    const amount = parseEther('1000');
    const commissionRatio = '500'; // 5%

    const daiTopUpAmount = parseEther('1000000');
    await this.dai.connect(this.daiHolder).transfer(DAI_NXM_HOLDER, daiTopUpAmount);

    const coverCountBefore = await this.cover.coverDataCount();

    await this.dai.connect(coverBuyer).approve(this.cover.address, daiTopUpAmount);

    const maxPremiumInAsset = amount.mul(260).div(10000);

    console.log('Buying cover..');
    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
    );

    console.log('Bought..');
    const coverCountAfter = await this.cover.coverDataCount();
    protocolCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Submit claim for protocol cover in DAI', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);

    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1000');
    const segmentId = (await this.cover.coverSegmentsCount(custodyCoverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(custodyCoverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      1, // DAI
    );
    await this.individualClaims
      .connect(coverBuyer)
      .submitClaim(protocolCoverId, segmentId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Process assessment and DAI payout for protocol cover', async function () {
    await castAssessmentVote.call(this);

    const coverIdV2 = custodyCoverId;
    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const memberAddress = await this.coverNFT.ownerOf(coverIdV2);

    const daiBalanceBefore = await this.dai.balanceOf(memberAddress);

    // redeem payout
    await this.individualClaims.redeemClaimPayout(claimId);

    const daiBalanceAfter = await this.dai.balanceOf(memberAddress);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(requestedClaimAmount));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('Sets DMCI to greater to 1% to allow floor increase', async function () {
    const newMaxMCRFloorChange = BigNumber.from(100);

    const DMCI = toBytes('DMCI', 8);

    await submitMemberVoteGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMCRParameters,
      defaultAbiCoder.encode(['bytes8', 'uint'], [DMCI, newMaxMCRFloorChange]),
      [...this.abMembers, ...this.members], // add other members
      this.governance,
    );

    const maxMCRFloorAfter = await this.mcr.maxMCRFloorIncrement();

    expect(maxMCRFloorAfter).to.be.equal(newMaxMCRFloorChange);
  });

  it('Gets all pool assets balances before upgrade', async function () {
    // Pool value related info
    this.poolValueBefore = await this.pool.getPoolValueInEth();
    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.address);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.address);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.address);
  });

  it('Performs hypothetical future Governance upgrade', async function () {
    const newGovernance = await deployContract('Governance');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    await compareProxyImplementationAddress(this.governance.address, newGovernance.address);
  });

  it('Performs hypothetical future NXMaster upgrade', async function () {
    const newMaster = await deployContract('NXMaster');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMaster, // upgradeMasterAddress(address)
      defaultAbiCoder.encode(['address'], [newMaster.address]),
      this.abMembers,
      this.governance,
    );
    await compareProxyImplementationAddress(this.master.address, newMaster.address);
  });

  it('Performs hypothetical future upgrade of proxy and non-proxy', async function () {
    // CR - ClaimRewards.sol
    const newClaimsReward = await deployContract('LegacyClaimsReward', [this.master.address, DAI_ADDRESS]);

    // TC - TokenController.sol
    const tokenController = await deployContract('TokenController', [
      this.quotationData.address,
      newClaimsReward.address,
      this.stakingPoolFactory.address,
      this.nxm.address,
    ]);

    // MCR - MCR.sol
    const mcr = await deployContract('MCR', [this.master.address]);

    // MR - MemberRoles.sol
    const memberRoles = await deployContract('MemberRoles', [this.nxm.address]);

    // CO - Cover.sol
    const cover = await deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);

    // PS - PooledStaking.sol
    const pooledStaking = await deployContract('LegacyPooledStaking', [
      this.cover.address,
      this.productsV1.address,
      this.stakingNFT.address,
    ]);

    // PriceFeedOracle.sol
    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18];
    const priceFeedOracle = await deployContract('PriceFeedOracle', [assetAddresses, assetAggregators, assetDecimals]);

    const swapOperatorAddress = await this.pool.swapOperator();

    // P1 - Pool.sol
    const pool = await deployContract('Pool', [
      this.master.address,
      priceFeedOracle.address,
      swapOperatorAddress,
      DAI_ADDRESS,
      STETH_ADDRESS,
      ENZYMEV4_VAULT_PROXY_ADDRESS,
      this.nxm.address,
    ]);

    // Enable Pool as Enzyme receiver
    await enableAsEnzymeReceiver(pool.address);

    // CL - CoverMigrator.sol
    const coverMigrator = await deployContract('CoverMigrator', [this.quotationData.address, this.productsV1.address]);

    // GW - Gateway.sol
    const gateway = await deployContract('LegacyGateway', [this.quotationData.address]);

    // AS - Assessment.sol
    const assessment = await deployContract('Assessment', [this.nxm.address]);

    // CI - IndividualClaims.sol
    const individualClaims = await deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);

    // CG - YieldTokenIncidents.sol
    const yieldTokenIncidents = await deployContract('YieldTokenIncidents', [this.nxm.address, this.coverNFT.address]);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          [
            toUtf8Bytes('MR'),
            toUtf8Bytes('MC'),
            toUtf8Bytes('CO'),
            toUtf8Bytes('TC'),
            toUtf8Bytes('PS'),
            toUtf8Bytes('P1'),
            toUtf8Bytes('CL'),
            toUtf8Bytes('GW'),
            toUtf8Bytes('AS'),
            toUtf8Bytes('CI'),
            toUtf8Bytes('CG'),
          ],
          [
            memberRoles.address,
            mcr.address,
            cover.address,
            tokenController.address,
            pooledStaking.address,
            pool.address,
            coverMigrator.address,
            gateway.address,
            assessment.address,
            individualClaims.address,
            yieldTokenIncidents.address,
          ],
        ],
      ),
      this.abMembers,
      this.governance,
    );

    // Compare proxy implementation addresses
    await compareProxyImplementationAddress(this.memberRoles.address, memberRoles.address);
    await compareProxyImplementationAddress(this.pooledStaking.address, pooledStaking.address);
    await compareProxyImplementationAddress(this.tokenController.address, tokenController.address);
    await compareProxyImplementationAddress(this.gateway.address, gateway.address);
    await compareProxyImplementationAddress(this.individualClaims.address, individualClaims.address);
    await compareProxyImplementationAddress(this.assessment.address, assessment.address);
    await compareProxyImplementationAddress(this.yieldTokenIncidents.address, yieldTokenIncidents.address);
    await compareProxyImplementationAddress(this.cover.address, cover.address);

    // Compare non-proxy addresses
    expect(pool.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('P1')));
    expect(mcr.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('MC')));
    expect(coverMigrator.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('CL')));

    this.mcr = mcr;
    this.pool = pool;
  });

  it.skip('Check Pool balance after upgrades', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const poolValueDiff = poolValueAfter.sub(this.poolValueBefore);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const daiBalanceAfter = await this.dai.balanceOf(this.pool.address);
    const stEthBalanceAfter = await this.stEth.balanceOf(this.pool.address);
    const enzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.address);

    console.log({
      poolValueBefore: formatEther(this.poolValueBefore),
      poolValueAfter: formatEther(poolValueAfter),
      poolValueDiff: formatEther(poolValueDiff),
      ethBalanceBefore: formatEther(this.ethBalanceBefore),
      ethBalanceAfter: formatEther(ethBalanceAfter),
      ethBalanceDiff: formatEther(ethBalanceAfter.sub(this.ethBalanceBefore)),
      daiBalanceBefore: formatEther(this.daiBalanceBefore),
      daiBalanceAfter: formatEther(daiBalanceAfter),
      daiBalanceDiff: formatEther(daiBalanceAfter.sub(this.daiBalanceBefore)),
      stEthBalanceBefore: formatEther(this.stEthBalanceBefore),
      stEthBalanceAfter: formatEther(stEthBalanceAfter),
      stEthBalanceDiff: formatEther(stEthBalanceAfter.sub(this.stEthBalanceBefore)),
      enzymeSharesBalanceBefore: formatEther(this.enzymeSharesBalanceBefore),
      enzymeSharesBalanceAfter: formatEther(enzymeSharesBalanceAfter),
      enzymeSharesBalanceDiff: formatEther(enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore)),
    });

    expect(poolValueDiff.abs(), 'Pool value in ETH should be the same').lessThanOrEqual(BigNumber.from(2));
    expect(stEthBalanceAfter.sub(this.stEthBalanceBefore).abs(), 'stETH balance should be the same').lessThanOrEqual(
      BigNumber.from(2),
    );
    expect(ethBalanceAfter.sub(this.ethBalanceBefore), 'ETH balance should be the same').to.be.equal(0);
    expect(daiBalanceAfter.sub(this.daiBalanceBefore), 'DAI balance should be the same').to.be.equal(0);
    expect(
      enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore),
      'Enzyme shares balance should be the same',
    ).to.be.equal(0);
  });

  it('trigger emergency pause, do an upgrade and unpause', async function () {
    // this test verifies the scenario in which a critical vulnerability is detected
    // system is paused, system is upgraded, and system is resumed

    const emergencyAdminAddress = await this.master.emergencyAdmin();

    await evm.impersonate(emergencyAdminAddress);
    await evm.setBalance(emergencyAdminAddress, parseEther('1000'));
    const emergencyAdmin = await getSigner(emergencyAdminAddress);

    await this.master.connect(emergencyAdmin).setEmergencyPause(true);

    const newGovernance = await deployContract('Governance');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    await compareProxyImplementationAddress(this.governance.address, newGovernance.address);

    await this.master.connect(emergencyAdmin).setEmergencyPause(false);
  });
});
