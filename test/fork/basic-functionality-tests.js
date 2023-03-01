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

const { DAI_ADDRESS, STETH_ADDRESS } = Address;
const { NXM_WHALE_1, NXM_WHALE_2, DAI_NXM_HOLDER, NXMHOLDER } = UserAddress;
const { ENZYMEV4_VAULT_PROXY_ADDRESS } = EnzymeAdress;
const {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR,
  STETH_PRICE_FEED_ORACLE_AGGREGATOR,
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
} = PriceFeedOracle;

let ybDAI, ybETH, ybEthProductId, ybDaiProductId, ybDaiCoverId, ybEthCoverId;
let poolId;
let trancheId;
let tokenId;

async function compareProxyImplementationAddress(proxyAddress, addressToCompare) {
  const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
  const implementationAddress = await proxy.implementation();
  expect(implementationAddress).to.be.equal(addressToCompare);
}

describe('basic functionality tests', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    await evm.increaseTime(7 * 24 * 3600); // +7 days

    trancheId = await calculateCurrentTrancheId();
  });

  it('Impersonate members', async function () {
    await evm.impersonate(NXM_WHALE_1);
    await evm.impersonate(NXM_WHALE_2);
    await evm.impersonate(NXMHOLDER);
    await evm.setBalance(NXM_WHALE_1, parseEther('1000'));
    await evm.setBalance(NXM_WHALE_2, parseEther('1000'));
    await evm.setBalance(NXMHOLDER, parseEther('1000'));

    this.members = [];
    this.members.push(await getSigner(NXM_WHALE_1));
    this.members.push(await getSigner(NXM_WHALE_2));
    this.members.push(await getSigner(NXMHOLDER));
  });

  it('buy NXM Token', async function () {
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

  it('buy NXM until you can sell NXM', async function () {
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

  it('sell NXM Token', async function () {
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

  it('add product types', async function () {
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
    const productTypesCountBefore = await this.cover.productTypesCount();

    await this.cover.connect(this.abMembers[0]).setProductTypes(productTypes);

    const productTypesCountAfter = await this.cover.productTypesCount();

    expect(productTypesCountAfter).to.be.equal(productTypesCountBefore.add(productTypes.length));
  });

  it('add ybDAI yield token cover', async function () {
    ybDAI = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);
    const productsBefore = await this.cover.getProducts();

    await this.cover.connect(this.abMembers[0]).setProducts([
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

    const productsAfter = await this.cover.getProducts();
    ybDaiProductId = productsAfter.length - 1;

    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('add ybETH yield token cover', async function () {
    ybETH = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);
    const productsBefore = await this.cover.getProducts();

    await this.cover.connect(this.abMembers[0]).setProducts([
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

    const productsAfter = await this.cover.getProducts();
    ybEthProductId = productsAfter.length - 1;

    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('create staking Pool', async function () {
    const [manager] = this.abMembers;
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
    ];
    const stakingPoolCountBefore = await this.stakingPoolFactory.stakingPoolCount();
    await this.cover.connect(manager).createStakingPool(false, 5, 5, products, 'description');

    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    poolId = stakingPoolCountAfter.toNumber();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const address = await this.cover.stakingPool(poolId);

    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('deposit to staking Pool', async function () {
    const [manager] = this.abMembers;
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

  it('extend deposit for staking Pool', async function () {
    const [manager] = this.abMembers;
    const managerAddress = await manager.getAddress();
    const amount = parseEther('5');
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const tokenControllerBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    await this.stakingPool.connect(manager).extendDeposit(tokenId, trancheId, trancheId + 7, amount);

    const tokenControllerBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);

    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
  });

  it('buy ybDAI yield token cover with DAI', async function () {
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
    ybDaiCoverId = coverCountBefore;

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('buy ybETH yield token cover with ETH', async function () {
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
    ybEthCoverId = coverCountBefore;

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

  it.skip('submit claim for ybDAI cover', async function () {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.submitYieldTokenIncident,
      defaultAbiCoder.encode(
        ['uint24', 'uint96', 'uint32', 'uint', 'string'],
        [ybDaiProductId, parseEther('1.1'), currentTime, parseEther('20000'), 'hashedMetadata'],
      ),
      this.abMembers,
      this.governance,
    );
    // await evm.impersonate(this.governance.address);
    // await evm.setBalance(this.governance.address, parseEther('1000'));
    // const gov = await getSigner(this.governance.address);
    // await this.yieldTokenIncidents
    //   .connect(gov)
    //   .submitIncident(ybDaiProductId, parseEther('1.1'), currentTime, parseEther('20000'), 'hashedMetadata');
  });

  it.skip('submit claim for ybETH cover', async function () {
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.submitYieldTokenIncident,
      defaultAbiCoder.encode(
        ['uint24', 'uint96', 'uint32', 'uint', 'string'],
        [ybEthProductId, parseEther('1.1'), currentTime, parseEther('20000'), 'hashedMetadata'],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('sets DMCI to greater to 1% to allow floor increase', async function () {
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

  it('gets all pool values before upgrade', async function () {
    // Pool value related info
    this.poolValueBefore = await this.pool.getPoolValueInEth();
    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.address);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.address);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.address);
  });

  it('performs hypothetical future Governance upgrade', async function () {
    const newGovernance = await deployContract('Governance');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    await compareProxyImplementationAddress(this.governance.address, newGovernance.address);
  });

  it('performs hypothetical future NXMaster upgrade', async function () {
    const newMaster = await deployContract('NXMaster');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMaster, // upgradeMasterAddress(address)
      defaultAbiCoder.encode(['address'], [newMaster.address]),
      this.abMembers,
      this.governance,
    );
    await compareProxyImplementationAddress(this.master.address, newMaster.address);
  });

  it('performs hypothetical future upgrade of proxy and non-proxy', async function () {
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
      this.coverProxyAddress,
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

    // P1 - Pool.sol
    const pool = await deployContract('Pool', [
      this.master.address,
      priceFeedOracle.address,
      this.swapOperator.address,
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
    const gateway = await deployContract('LegacyGateway');

    // AS - Assessment.sol
    const assessment = await ethers.deployContract('Assessment', [this.nxm.address]);

    // IC - IndividualClaims.sol
    const individualClaims = await ethers.deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);

    // YT - YieldTokenIncidents.sol
    const yieldTokenIncidents = await ethers.deployContract('YieldTokenIncidents', [
      this.nxm.address,
      this.coverNFT.address,
    ]);

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
            toUtf8Bytes('IC'),
            toUtf8Bytes('YT'),
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

  it('Pool value check', async function () {
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

    // Why 2 wei difference?
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
});
