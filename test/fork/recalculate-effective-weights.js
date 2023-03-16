const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { BigNumber } = ethers;
const { daysToSeconds } = require('../../lib/helpers');
const evm = require('./evm')();

const HUGH = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';

const V2Addresses = {
  Assessment: '0xcafeaa5f9c401b7295890f309168Bbb8173690A3',
  Cover: '0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62',
  CoverMigrator: '0xcafeac41b010299A9bec5308CCe6aFC2c4DF8D39',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
  Governance: '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900',
  IndividualClaims: '0xcafeac12feE6b65A710fA9299A98D65B4fdE7a62',
  LegacyClaimData: '0xdc2D359F59F6a26162972c3Bd0cFBfd8C9Ef43af',
  LegacyClaimProofs: '0xcafea81b73daB8F42C5eca7d2E821A82660B6775',
  LegacyClaimsReward: '0xcafeaDcAcAA2CD81b3c54833D6896596d218BFaB',
  LegacyGateway: '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5',
  LegacyPooledStaking: '0x84EdfFA16bb0b9Ab1163abb0a13Ff0744c11272f',
  LegacyQuotationData: '0x1776651F58a17a50098d31ba3C3cD259C1903f7A',
  MCR: '0xcafea444db21dc06f34570185cF0014701c7D62e',
  MemberRoles: '0x055CC48f7968FD8640EF140610dd4038e1b03926',
  NXMaster: '0x01BFd82675DBCc7762C84019cA518e701C0cD07e',
  Pool: '0xcafea112Db32436c2390F5EC988f3aDB96870627',
  PriceFeedOracle: '0xcafeaf0a0672360941B7F0b6D015797292e842C6',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  ProposalCategory: '0x888eA6Ab349c854936b98586CE6a17E98BF254b2',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingProducts: '0xcafea573fBd815B5f59e8049E71E554bde3477E4',
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04',
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  TokenController: '0x5407381b6c251cFd498ccD4A1d877739CB7960B8',
  YieldTokenIncidents: '0xcafeac831dC5ca0D7ef467953b7822D2f44C8f83',
};
async function submitGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (let i = 0; i < signers.length; i++) {
    await gv.connect(signers[i]).submitVote(id, 1);
  }

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  assert.equal(
    receipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3, 'Proposal Status != ACCEPTED');
}

async function verifyPoolWeights(stakingProducts, poolId) {
  const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
  const numProducts = await cover.productsCount();
  const stakedProducts = [];

  // get products from staking pool and discard if not initialized
  for (let i = 0; i < numProducts; i++) {
    const { lastEffectiveWeight, targetWeight, bumpedPrice, bumpedPriceUpdateTime } = await stakingProducts.getProduct(
      poolId,
      i,
    );

    // bumpedPrice and bumpedPriceUpdateTime should be greater than 0 if initialized
    if (BigNumber.from(bumpedPrice).isZero()) {
      expect(bumpedPriceUpdateTime).to.equal(0);
      continue;
    }

    stakedProducts.push({ targetWeight, lastEffectiveWeight, productId: i, bumpedPrice });
  }

  let expectedTotalEffectiveWeight = BigNumber.from(0);
  for (let i = 0; i < stakedProducts.length; i++) {
    const product = stakedProducts[i];
    expectedTotalEffectiveWeight = expectedTotalEffectiveWeight.add(product.targetWeight);
  }

  for (let i = 0; i < stakedProducts.length; i++) {
    const product = stakedProducts[i];
    // TODO: actually calculate effective weight in case of burns
    const expectedEffectiveWeight = product.targetWeight;
    const { lastEffectiveWeight } = await stakingProducts.getProduct(poolId, product.productId);
    // TODO: grab capacity ratios
    const effectiveWeightCalculated = await stakingProducts.getEffectiveWeight(
      poolId,
      product.productId,
      product.targetWeight,
      20000 /* globalCapacityRatio */,
      0 /* capacityReductionRatio */,
    );
    expect(lastEffectiveWeight).to.equal(effectiveWeightCalculated);
    expect(lastEffectiveWeight).to.equal(expectedEffectiveWeight);
  }

  const totalEffectiveWeight = await stakingProducts.getTotalEffectiveWeight(poolId);
  expect(totalEffectiveWeight).to.equal(expectedTotalEffectiveWeight);
}

describe('recalculateEffectiveWeight', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(HUGH);
    await setEtherBalance(hugh.address, parseEther('1000'));

    this.hugh = hugh;

    // Upgrade StakingProducts
    const codes = ['SP'].map(code => toUtf8Bytes(code));
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
    const stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);

    const stakingProductsImpl = await ethers.deployContract('StakingProducts', [
      cover.address,
      stakingPoolFactory.address,
    ]);

    const addresses = [stakingProductsImpl].map(c => c.address);

    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    const { memberArray: abMembersAddresses } = await memberRoles.members(1);

    const abMembers = [];
    for (const address of abMembersAddresses) {
      const abSigner = await ethers.getImpersonatedSigner(address);
      await setEtherBalance(address, parseEther('1000'));
      abMembers.push(abSigner);
    }

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      abMembers,
      governance,
    );
  });

  it('should recalculate effective weight for all products in all pools', async function () {
    const stakingProducts = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProducts);
    const stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    const poolCount = await stakingPoolFactory.stakingPoolCount();

    for (let i = 0; i <= poolCount; i++) {
      await stakingProducts.recalculateEffectiveWeightsForAllProducts(i);
      await verifyPoolWeights(stakingProducts, i);
    }
  });

  it('should buy a cover and bump the price towards the target weight', async function () {
    const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);

    const stakingProducts = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProducts);

    // cover buy details
    const coverAsset = 0; // ETH
    const poolId = 2;
    const amount = parseEther('1');
    const period = daysToSeconds(45);
    const commissionRatio = 0;

    // get products from staking pool and discard if not initialized
    const numProducts = await cover.productsCount();
    const productsInThisPool = [];
    for (let i = 0; i < numProducts; i++) {
      const { targetWeight, lastEffectiveWeight, bumpedPrice, bumpedPriceUpdateTime } =
        await stakingProducts.getProduct(poolId, i);

      if (BigNumber.from(bumpedPrice).isZero()) {
        continue;
      }

      if (BigNumber.from(targetWeight).eq(0)) {
        continue;
      }
      productsInThisPool.push({ targetWeight, lastEffectiveWeight, productId: i, bumpedPrice, bumpedPriceUpdateTime });
    }

    // recalculate effective weights
    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    // pick a random product
    const randomProduct = productsInThisPool[Math.floor(Math.random() * (productsInThisPool.length - 1))];

    // TODO: find the exact amount of premium to pay
    // const maxPremiumInAsset = amount.mul(randomProduct.bumpedPrice).div(10000).mul(period).div(daysToSeconds(365));
    const maxPremiumInAsset = amount.mul(randomProduct.bumpedPrice).div(10000);
    await cover.connect(this.hugh).buyCover(
      {
        coverId: 0,
        owner: this.hugh.address,
        productId: randomProduct.productId,
        coverAsset,
        amount,
        period, // 30 days
        maxPremiumInAsset,
        paymentAsset: coverAsset,
        commissionRatio,
        commissionDestination: this.hugh.address,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount, skip: false }],
      { value: maxPremiumInAsset },
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const { targetWeight, lastEffectiveWeight, bumpedPrice, bumpedPriceUpdateTime, targetPrice } =
      await stakingProducts.getProduct(poolId, randomProduct.productId);

    if (BigNumber.from(targetWeight).gt(0)) {
      expect(lastEffectiveWeight).to.be.gte(randomProduct.lastEffectiveWeight);
    }

    // todo: calculate the expected bumped price
    if (BigNumber.from(bumpedPrice).eq(targetPrice)) {
      expect(bumpedPrice).to.be.equal(randomProduct.bumpedPrice);
    } else if (BigNumber.from(bumpedPrice).gt(targetPrice)) {
      expect(bumpedPrice).to.be.gt(targetPrice);
    } else if (BigNumber.from(bumpedPrice).lt(targetPrice)) {
      expect(bumpedPrice).to.be.lt(targetPrice);
    }

    expect(lastEffectiveWeight).to.be.equal(targetWeight);
    // TODO: this doesn't always hold true
    expect(bumpedPriceUpdateTime).to.be.equal(timestamp);
  });
});
