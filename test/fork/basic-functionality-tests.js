const { ethers } = require('hardhat');
const { expect } = require('chai');

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
  Aave,
} = require('./utils');

const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { daysToSeconds, categoryParamsToValues } = require('../../lib/helpers');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const VariableDebtTokenAbi = require('./abi/aave/VariableDebtToken.json');
const { InternalContractsIDs } = require('../utils').constants;

const { BigNumber, deployContract } = ethers;
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther, defaultAbiCoder, toUtf8Bytes, formatEther, parseUnits } = ethers.utils;

const ASSESSMENT_VOTER_COUNT = 3;
const { DAI_ADDRESS, STETH_ADDRESS, RETH_ADDRESS, USDC_ADDRESS } = Address;
const { NXM_WHALE_1, NXM_WHALE_2, DAI_NXM_HOLDER, NXMHOLDER, DAI_HOLDER, HUGH } = UserAddress;
const { ENZYMEV4_VAULT_PROXY_ADDRESS } = EnzymeAdress;
const {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR,
  STETH_PRICE_FEED_ORACLE_AGGREGATOR,
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
  RETH_PRICE_FEED_ORACLE_AGGREGATOR,
  USDC_PRICE_FEED_ORACLE_AGGREGATOR,
} = PriceFeedOracle;

let ybDAI, ybETH, ybUSDC;

let ybDaiProductId, ybDaiCoverId, ybDaiIncidentId;
let ybUSDCProductId, ybUSDCCoverId, ybUSDCIncidentId;
let ybEthProductId;
let custodyProductId, custodyCoverId;
let protocolProductId, protocolCoverId;
let assessmentId, requestedClaimAmount, claimDeposit;
let poolId, trancheId, tokenId;

const NEW_POOL_MANAGER = NXM_WHALE_1;
const GNOSIS_SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

const compareProxyImplementationAddress = async (proxyAddress, addressToCompare) => {
  const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
  const implementationAddress = await proxy.implementation();
  expect(implementationAddress).to.be.equal(addressToCompare);
};

const getCapitalSupplyAndBalances = async (pool, tokenController, nxm, memberAddress) => {
  return {
    ethCapital: await pool.getPoolValueInEth(),
    nxmSupply: await tokenController.totalSupply(),
    ethBalance: await ethers.provider.getBalance(memberAddress),
    nxmBalance: await nxm.balanceOf(memberAddress),
  };
};

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

  it('load token contracts', async function () {
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.aaveUsdcVariableDebtToken = await ethers.getContractAt(VariableDebtTokenAbi, Aave.VARIABLE_DEBT_USDC_ADDRESS);
  });

  it('Impersonate addresses', async function () {
    await evm.impersonate(NXM_WHALE_1);
    await evm.impersonate(NXM_WHALE_2);
    await evm.impersonate(NXMHOLDER);
    await evm.impersonate(NEW_POOL_MANAGER);
    await evm.setBalance(NXM_WHALE_1, parseEther('100000'));
    await evm.setBalance(NXM_WHALE_2, parseEther('100000'));
    await evm.setBalance(NXMHOLDER, parseEther('100000'));
    await evm.setBalance(NEW_POOL_MANAGER, parseEther('100000'));
    await evm.setBalance(DAI_HOLDER, parseEther('100000'));
    await evm.setBalance(DAI_NXM_HOLDER, parseEther('100000'));

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
      AS: ['TC', 'MR', 'RA'],
      CI: ['TC', 'MR', 'P1', 'CO', 'AS', 'RA'],
      CG: ['TC', 'MR', 'P1', 'CO', 'AS', 'RA'],
      MC: ['P1', 'MR', 'CO'],
      P1: ['MC', 'MR', 'RA'],
      CO: ['P1', 'TC', 'MR', 'SP'],
      CL: ['CO', 'TC', 'CI'],
      MR: ['TC', 'P1', 'CO', 'PS', 'AS'],
      PS: ['TC', 'MR'],
      SP: [], // none
      TC: ['PS', 'AS', 'GV', 'P1'],
      RA: ['P1', 'MC', 'TC'],
    };

    const latestAddresses = {};
    const master = this.master;

    async function getLatestAddress(contractCode) {
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
        expect(storedDependencyAddress).to.be.equal(
          dependencyAddress,
          `Dependency ${dependency} for ${contractCode} is not set correctly ` +
            `(expected ${dependencyAddress}, got ${storedDependencyAddress})`,
        );
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

  it('Swap NXM for ETH', async function () {
    const [member] = this.abMembers;
    const nxmIn = parseEther('1');
    const minEthOut = parseEther('0.0152');

    const awEthBefore = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const before = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await evm.setNextBlockBaseFee(0);
    const tx = await this.ramm.connect(member).swap(nxmIn, minEthOut, deadline, { maxPriorityFeePerGas: 0 });
    const receipt = await tx.wait();

    const awEthAfter = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtDiff = aaveDebtAfter.sub(aaveDebtBefore);
    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);
    const awEthRewards = awEthAfter.sub(awEthBefore);

    const ethReceived = after.ethBalance.sub(before.ethBalance);
    const nxmSwappedForEthFilter = this.ramm.filters.NxmSwappedForEth(member.address);
    const nxmSwappedForEthEvents = await this.ramm.queryFilter(nxmSwappedForEthFilter, receipt.blockNumber);
    const ethOut = nxmSwappedForEthEvents[0]?.args?.ethOut;

    // ETH goes out of capital pool and debt and rewards are added
    const expectedCapital = before.ethCapital.sub(ethReceived).sub(ethDebt).add(awEthRewards);

    expect(ethOut).to.be.equal(ethReceived);
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn)); // member sends NXM
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn)); // nxmIn is burned
    expect(after.ethCapital).to.be.closeTo(expectedCapital, 1); // time sensitive due to rewards and debt
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethOut)); // member receives ETH
  });

  it('Swap ETH for NXM', async function () {
    const [member] = this.abMembers;
    const ethIn = parseEther('1');
    const minNxmOut = parseEther('28.8');

    const awEthBefore = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const before = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await evm.setNextBlockBaseFee(0);
    const tx = await this.ramm.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    const receipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const awEthAfter = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtDiff = aaveDebtAfter.sub(aaveDebtBefore);

    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);
    const awEthRewards = awEthAfter.sub(awEthBefore);

    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const nxmTransferFilter = this.nxm.filters.Transfer(ethers.constants.AddressZero, member._address);
    const nxmTransferEvents = await this.nxm.queryFilter(nxmTransferFilter, receipt.blockNumber);
    const nxmOut = nxmTransferEvents[0]?.args?.value;

    // ETH goes in the capital pool and aave debt and rewards are added
    const expectedCapital = before.ethCapital.add(ethIn).sub(ethDebt).add(awEthRewards);

    expect(nxmOut).to.be.equal(nxmReceived);
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn)); // member sends ETH
    expect(after.ethCapital).to.be.closeTo(expectedCapital, 1); // time sensitive due to rewards and debt
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived)); // nxmOut is minted
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmOut)); // member receives NXM
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

    const productTypesCountBefore = await this.coverProducts.getProductTypeCount();
    await this.coverProducts.connect(this.abMembers[0]).setProductTypes(productTypes);
    const productTypesCountAfter = await this.coverProducts.getProductTypeCount();
    expect(productTypesCountAfter).to.be.equal(productTypesCountBefore.add(productTypes.length));
  });

  it('Add ybDAI yield token cover', async function () {
    ybDAI = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);
    const productsCountBefore = await this.coverProducts.getProductCount();

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

    const productsCountAfter = await this.coverProducts.getProductCount();
    ybDaiProductId = productsCountAfter.toNumber() - 1;

    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
  });

  it('Add ybUSDC yield token cover', async function () {
    ybUSDC = await deployContract('ERC20MintableDetailed', ['yield bearing USDC', 'ybUSDC', 6]);
    const productsCountBefore = await this.coverProducts.getProductCount();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'ybUSDC yield token',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 2,
          yieldTokenAddress: ybUSDC.address,
          coverAssets: 64,
          initialPriceRatio: 1000,
          capacityReductionRatio: 1000,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsCountAfter = await this.coverProducts.getProductCount();
    ybUSDCProductId = productsCountAfter.toNumber() - 1;

    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
  });

  it('Add ybETH yield token cover', async function () {
    ybETH = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);
    const productsCountBefore = await this.coverProducts.getProductCount();

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

    const productsCountAfter = await this.coverProducts.getProductCount();
    ybEthProductId = productsCountAfter.toNumber() - 1;

    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
  });

  it('Add protocol product', async function () {
    const productsCountBefore = await this.coverProducts.getProductCount();

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

    const productsCountAfter = await this.coverProducts.getProductCount();
    protocolProductId = productsCountAfter.toNumber() - 1;
    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
  });

  it('Add custody product', async function () {
    const productsCountBefore = await this.coverProducts.getProductCount();

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

    const productsCountAfter = await this.coverProducts.getProductCount();
    custodyProductId = productsCountAfter.toNumber() - 1;
    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
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
        productId: ybUSDCProductId, // ybUSDC
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

    const address = await this.cover.stakingPool(poolId);
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

    await this.dai.connect(coverBuyer).approve(this.cover.address, amount);
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

  it('Buy ybUSDC yield token cover with USDC', async function () {
    await evm.impersonate(HUGH);
    const coverBuyer = await getSigner(HUGH);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 6; // USDC
    const amount = parseUnits('1000', 6);
    const commissionRatio = '500'; // 5%

    await this.usdc.connect(coverBuyer).approve(this.cover.address, amount);
    const coverCountBefore = await this.cover.coverDataCount();

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: ybUSDCProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: amount,
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
    ybUSDCCoverId = coverCountAfter;

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

  it('Add submit yield token incident proposal category', async function () {
    const params = ['Add incident', 1, 60, 15, 60, '', 'CG', 'submitIncident(uint24,uint96,uint32,uint256,string)'];
    const values = categoryParamsToValues(params);

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
        values,
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

    const proposalCategoryCount = await this.proposalCategory.totalCategories();
    const submitIncidentCategoryId = proposalCategoryCount.sub(1);

    await submitGovernanceProposal(
      submitIncidentCategoryId,
      defaultAbiCoder.encode(
        ['uint24', 'uint96', 'uint32', 'uint', 'string'],
        [ybDaiProductId, parseEther('1.1'), currentTime, parseEther('20000'), 'hashedMetadata'],
      ),
      this.abMembers,
      this.governance,
    );

    await castAssessmentVote.call(this);
  });

  it('Create Yield Token Incident for ybUSDC cover', async function () {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    ybUSDCIncidentId = (await this.yieldTokenIncidents.getIncidentsCount()).toNumber();

    const assessmentCountBefore = await this.assessment.getAssessmentsCount();
    assessmentId = assessmentCountBefore.toString();

    const proposalCategoryCount = await this.proposalCategory.totalCategories();
    const submitIncidentCategoryId = proposalCategoryCount.sub(1);

    await submitGovernanceProposal(
      submitIncidentCategoryId,
      defaultAbiCoder.encode(
        ['uint24', 'uint96', 'uint32', 'uint', 'string'],
        [ybUSDCProductId, parseUnits('1.1', 6), currentTime, parseEther('20000'), 'hashedMetadata'],
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

  it('redeem ybUSDC cover', async function () {
    const member = HUGH;
    const coverBuyer = await getSigner(member);

    const claimedAmount = parseUnits('1000', 6);

    await ybUSDC.mint(member, parseEther('10000000'));

    await ybUSDC.connect(coverBuyer).approve(this.yieldTokenIncidents.address, parseUnits('1000000', 6));

    const usdcBalanceBefore = await this.usdc.balanceOf(member);
    await this.yieldTokenIncidents
      .connect(coverBuyer)
      .redeemPayout(ybUSDCIncidentId, ybUSDCCoverId, 0, claimedAmount, member, []);

    const usdcBalanceAfter = await this.usdc.balanceOf(member);

    const priceBefore = parseEther('1.1');
    const coverAssetDecimals = ethers.BigNumber.from('10').pow(18);

    const { payoutDeductibleRatio } = await this.yieldTokenIncidents.config();
    const INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR = '10000';

    const ratio = priceBefore.mul(payoutDeductibleRatio);

    const payoutAmount = claimedAmount.mul(ratio).div(INCIDENT_PAYOUT_DEDUCTIBLE_DENOMINATOR).div(coverAssetDecimals);
    const expectedBalanceAfter = usdcBalanceBefore.add(payoutAmount);

    expect(usdcBalanceAfter).to.be.equal(expectedBalanceAfter);
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

  it('Buy protocol USDC cover', async function () {
    await evm.impersonate(HUGH);
    const coverBuyer = await getSigner(HUGH);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 6; // USDC
    const amount = parseUnits('1000', 6);
    const commissionRatio = '500'; // 5%

    const usdcTopUpAmount = parseUnits('1000000', 6);

    const coverCountBefore = await this.cover.coverDataCount();

    await this.usdc.connect(coverBuyer).approve(this.cover.address, usdcTopUpAmount);

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

  it('Submit claim for protocol cover in USDC', async function () {
    await evm.impersonate(HUGH);
    const coverBuyer = await getSigner(HUGH);

    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseUnits('1000', 6);
    const segmentId = (await this.cover.coverSegmentsCount(custodyCoverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(custodyCoverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      6, // USDC
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

  it('Process assessment and USDC payout for protocol cover', async function () {
    await castAssessmentVote.call(this);

    const coverIdV2 = protocolCoverId;
    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const memberAddress = await this.coverNFT.ownerOf(coverIdV2);

    const usdcBalanceBefore = await this.usdc.balanceOf(memberAddress);

    // redeem payout
    await this.individualClaims.redeemClaimPayout(claimId);

    const usdcBalanceAfter = await this.usdc.balanceOf(memberAddress);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(requestedClaimAmount));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('Update MCR GEAR parameter', async function () {
    const GEAR = toBytes('GEAR', 8);
    const currentGearValue = BigNumber.from(48000);
    const newGearValue = BigNumber.from(50000);

    expect(currentGearValue).to.be.eq(await this.mcr.gearingFactor());

    await submitMemberVoteGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMCRParameters,
      defaultAbiCoder.encode(['bytes8', 'uint'], [GEAR, newGearValue]),
      [...this.abMembers, ...this.members], // add other members
      this.governance,
    );

    expect(newGearValue).to.be.eq(await this.mcr.gearingFactor());
  });

  it('Gets all pool assets balances before upgrade', async function () {
    // Pool value related info
    this.aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    this.poolValueBefore = await this.pool.getPoolValueInEth();
    console.log(this.poolValueBefore.toString());
    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.address);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.address);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.address);
    this.rethBalanceBefore = await this.rEth.balanceOf(this.pool.address);
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
      this.stakingNFT.address,
    ]);

    // MCR - MCR.sol
    const mcr = await deployContract('MCR', [this.master.address, 0]);

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
      this.stakingNFT.address,
      this.nxm.address,
    ]);

    // PriceFeedOracle.sol
    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS, RETH_ADDRESS, USDC_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
      RETH_PRICE_FEED_ORACLE_AGGREGATOR,
      USDC_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18, 18, 6];
    const priceFeedOracle = await deployContract('PriceFeedOracle', [
      assetAddresses,
      assetAggregators,
      assetDecimals,
      this.safeTracker.address,
    ]);

    const swapOperatorAddress = await this.swapOperator.address;

    // P1 - Pool.sol
    const pool = await deployContract('Pool', [
      this.master.address,
      priceFeedOracle.address,
      swapOperatorAddress,
      this.nxm.address,
      this.pool.address,
    ]);

    // AS - Assessment.sol
    const assessment = await deployContract('Assessment', [this.nxm.address]);

    // CI - IndividualClaims.sol
    const individualClaims = await deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);

    // CG - YieldTokenIncidents.sol
    const yieldTokenIncidents = await deployContract('YieldTokenIncidents', [this.nxm.address, this.coverNFT.address]);

    // RA - Ramm.sol
    const ramm = await deployContract('Ramm', ['0']);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          ['MR', 'MC', 'CO', 'TC', 'PS', 'P1', 'AS', 'CI', 'CG', 'RA'].map(code => toUtf8Bytes(code)),
          [
            memberRoles,
            mcr,
            cover,
            tokenController,
            pooledStaking,
            pool,
            assessment,
            individualClaims,
            yieldTokenIncidents,
            ramm,
          ].map(c => c.address),
        ],
      ),
      this.abMembers,
      this.governance,
    );

    // Compare proxy implementation addresses
    await compareProxyImplementationAddress(this.memberRoles.address, memberRoles.address);
    await compareProxyImplementationAddress(this.pooledStaking.address, pooledStaking.address);
    await compareProxyImplementationAddress(this.tokenController.address, tokenController.address);
    await compareProxyImplementationAddress(this.individualClaims.address, individualClaims.address);
    await compareProxyImplementationAddress(this.assessment.address, assessment.address);
    await compareProxyImplementationAddress(this.yieldTokenIncidents.address, yieldTokenIncidents.address);
    await compareProxyImplementationAddress(this.cover.address, cover.address);
    await compareProxyImplementationAddress(this.ramm.address, ramm.address);

    // Compare non-proxy addresses
    expect(pool.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('P1')));
    expect(mcr.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('MC')));

    this.mcr = mcr;
    this.pool = pool;
  });

  it('Check Pool balance after upgrades', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);

    const poolValueDiff = poolValueAfter.sub(this.poolValueBefore);
    const aaveDebtDiff = aaveDebtAfter.sub(this.aaveDebtBefore);
    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const daiBalanceAfter = await this.dai.balanceOf(this.pool.address);
    const stEthBalanceAfter = await this.stEth.balanceOf(this.pool.address);
    const enzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.address);
    const rEthBalanceAfter = await this.rEth.balanceOf(this.pool.address);

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
      rethBalanceBefore: formatEther(this.rethBalanceBefore),
      rethBalanceAfter: formatEther(await this.rEth.balanceOf(this.pool.address)),
      rethBalanceDiff: formatEther(rEthBalanceAfter.sub(this.rethBalanceBefore)),
    });

    expect(poolValueDiff.abs(), 'Pool value in ETH should be the same').to.be.lte(ethDebt.add(2));
    expect(stEthBalanceAfter.sub(this.stEthBalanceBefore).abs(), 'stETH balance should be the same').to.be.lte(2);
    expect(ethBalanceAfter.sub(this.ethBalanceBefore), 'ETH balance should be the same').to.be.eq(0);
    expect(daiBalanceAfter.sub(this.daiBalanceBefore), 'DAI balance should be the same').to.be.eq(0);
    expect(
      enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore),
      'Enzyme shares balance should be the same',
    ).to.be.eq(0);
    expect(rEthBalanceAfter.sub(this.rethBalanceBefore), 'rETH balance should be the same').to.be.eq(0);
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
