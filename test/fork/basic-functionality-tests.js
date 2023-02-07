const { ethers } = require('hardhat');
const { parseEther, defaultAbiCoder, toUtf8Bytes, getCreate2Address, arrayify } = ethers.utils;
const { expect } = require('chai');
const { AddressZero, MaxUint256 } = ethers.constants;
const evm = require('./evm')();
const {
  Address,
  UserAddress,
  EnzymeAdress,
  PriceFeedOracle,
  deployContract,
  calculateCurrentTrancheId,
  getSigner,
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
  toBytes,
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

let ybDAI, ybETH, ybEthProductId, ybDaiProductId, ybDaiCoverId, ybEthCoverId, ybDaiAssessmentId, ybEthAssessmentId;
let stakingPool;
let tranchId;
let tokenId;

describe('basic functionality tests', function () {
  before(async () => {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    await evm.increaseTime(7 * 24 * 3600); // +7 days

    tranchId = await calculateCurrentTrancheId();
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

  it('buy NXM till you can sell NXM', async function () {
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
        productTypeId: MaxUint256,
        ipfsMetadata: 'protocolCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'protocolCoverIPFSHash',
          claimMethod: 0,
          gracePeriod: 30,
        },
      },
      {
        productTypeId: MaxUint256,
        ipfsMetadata: 'custodyCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'custodyCoverIPFSHash',
          claimMethod: 0,
          gracePeriod: 90,
        },
      },
      {
        productTypeId: MaxUint256,
        ipfsMetadata: 'yieldTokenCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
          claimMethod: 1,
          gracePeriod: 14,
        },
      },
    ];
    await this.cover.connect(this.abMembers[0]).setProductTypes(productTypes);
  });

  it('add ybDAI yield token cover', async function () {
    ybDAI = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);

    await this.cover.connect(this.abMembers[0]).setProducts([
      {
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 2,
          yieldTokenAddress: ybDAI.address,
          coverAssets: 2,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
        },
        allowedPools: [],
      },
    ]);
    const allProducts = await this.cover.getProducts();
    ybDaiProductId = allProducts.length - 1;
  });

  it('add ybETH yield token cover', async function () {
    ybETH = await deployContract('ERC20MintableDetailed', ['yield bearing DAI', 'ybDAI', 18]);

    await this.cover.connect(this.abMembers[0]).setProducts([
      {
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 2,
          yieldTokenAddress: ybETH.address,
          coverAssets: 1,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
        },
        allowedPools: [],
      },
    ]);
    const allProducts = await this.cover.getProducts();
    ybEthProductId = allProducts.length - 1;
  });

  it('create staking Pool', async function () {
    const [manager] = this.abMembers;
    const managerAddress = await manager.getAddress();
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
    await this.cover.connect(manager).createStakingPool(
      managerAddress,
      false, // isPrivatePool,
      '5', // initialPoolFee
      '5', // maxPoolFee,
      products,
      '', // ipfsDescriptionHash
    );

    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));
    const salt = Buffer.from(stakingPoolCountBefore.toString().padStart(64, '0'), 'hex');
    const initCodeHash = Buffer.from('203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920', 'hex');
    const address = getCreate2Address(this.stakingPoolFactory.address, salt, initCodeHash);

    stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('deposit to staking Pool', async function () {
    const [manager] = this.abMembers;
    const managerAddress = await manager.getAddress();
    const totalSupplyBefore = await this.stakingNFT.totalSupply();
    const amount = parseEther('10');

    await stakingPool.connect(manager).depositTo(amount, tranchId, MaxUint256, AddressZero);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    expect(totalSupplyAfter).to.equal(totalSupplyBefore.add(1));

    tokenId = totalSupplyAfter.sub(1);
    const owner = await this.stakingNFT.ownerOf(tokenId);
    expect(owner).to.equal(managerAddress);
  });

  it('extend deposit for staking Pool', async function () {
    const [manager] = this.abMembers;
    const managerAddress = await manager.getAddress();
    const amount = parseEther('5');

    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const tokenControllerBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);
    await stakingPool.connect(manager).extendDeposit(tokenId, tranchId, tranchId + 1, amount);
    const tokenControllerBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);

    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
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

  it('buy ybDAI yield token cover with DAI', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 1; // DAI
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const dai = await ethers.getContractAt('ERC20MintableDetailed', DAI_ADDRESS);
    await dai.connect(coverBuyer).approve(this.cover.address, amount);
    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      [{ poolId: '0', coverAmountInAsset: amount }],
      { value: '0' },
    );

    ybDaiCoverId = (await this.cover.coverDataCount()).sub(1);
  });

  it('buy ybETH yield token cover with ETH', async function () {
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 0; // ETH
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: MaxUint256,
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
      [{ poolId: '0', coverAmountInAsset: amount }],
      { value: amount },
    );

    ybEthCoverId = (await this.cover.coverDataCount()).sub(1);
  });

  it('submit claim for ybDAI cover', async function () {
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

  it('submit claim for ybETH cover', async function () {
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

  it.skip('vote for the ybDAI claim', async function () {
    const [manager] = this.abMembers;
    const assessmentStakingAmount = parseEther('1000');

    await this.assessment.connect(manager).stake(assessmentStakingAmount);
    await this.assessment.connect(manager).castVotes(ybDaiAssessmentId, [true], ['Assessment data hash'], 0);
  });

  it.skip('vote for the ybETH claim', async function () {
    const [manager] = this.abMembers;
    const assessmentStakingAmount = parseEther('1000');

    await this.assessment.connect(manager).stake(assessmentStakingAmount);
    await this.assessment.connect(manager).castVotes(ybEthAssessmentId, [true], ['Assessment data hash'], 0);
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

  it('performs hypothetical future Governance upgrade', async function () {
    const newGovernance = await deployContract('Governance');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', this.governance.address);
    this.governance = await ethers.getContractAt('Governance', this.governance.address);
    const governanceAddressAfter = await proxy.implementation();
    expect(governanceAddressAfter).to.be.equal(newGovernance.address);
  });

  it('performs hypothetical future NXMaster upgrade', async function () {
    const newMaster = await deployContract('NXMaster');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMaster, // upgradeMasterAddress(address)
      defaultAbiCoder.encode(['address'], [newMaster.address]),
      this.abMembers,
      this.governance,
    );
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', this.master.address);
    const masterAddressAfter = await proxy.implementation();
    expect(masterAddressAfter).to.be.equal(newMaster.address);
  });

  it.skip('performs hypothetical future upgrade of proxy and non-proxy', async function () {
    // CR - ClaimRewards.sol
    const newClaimsReward = await deployContract('LegacyClaimsReward', [this.master.address, DAI_ADDRESS]);

    // TC - TokenController.sol
    const tokenController = await deployContract('TokenController', [
      this.quotationData.address,
      newClaimsReward.address,
      this.stakingPoolFactory.address,
    ]);

    // MCR - MCR.sol
    const mcr = await deployContract('MCR', [this.master.address]);

    // MR - MemberRoles.sol
    const memberRoles = await deployContract('MemberRoles');

    // CO - Cover.sol
    const cover = await deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);

    // PS - PooledStaking.sol
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const pooledStaking = await deployContract('LegacyPooledStaking', [coverProxyAddress, this.productsV1.address]);

    // PriceFeedOracle.sol
    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18];
    this.priceFeedOracle = await deployContract('PriceFeedOracle', [assetAddresses, assetAggregators, assetDecimals]);

    // P1 - Pool.sol
    const pool = await deployContract('Pool', [
      this.master.address,
      this.priceFeedOracle.address,
      this.swapOperator.address,
      DAI_ADDRESS,
      STETH_ADDRESS,
      ENZYMEV4_VAULT_PROXY_ADDRESS,
    ]);

    // CL - CoverMigrator.sol
    const coverMigrator = await deployContract('CoverMigrator', [this.quotationData.address, this.productsV1.address]);

    // GW - Gateway.sol
    const gateway = await deployContract('LegacyGateway');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          [
            toUtf8Bytes('MR'),
            toUtf8Bytes('MC'),
            toUtf8Bytes('CO'),
            toUtf8Bytes('CR'),
            toUtf8Bytes('TC'),
            toUtf8Bytes('PS'),
            toUtf8Bytes('P1'),
            toUtf8Bytes('CL'),
            toUtf8Bytes('GW'),
          ],
          [
            memberRoles.address,
            mcr.address,
            cover.address,
            newClaimsReward.address,
            tokenController.address,
            pooledStaking.address,
            pool.address,
            coverMigrator.address,
            gateway.address,
          ],
        ],
      ),
      this.abMembers,
      this.governance,
    );

    this.memberRoles = await ethers.getContractAt('MemberRoles', this.memberRoles.address);
    this.mcr = await ethers.getContractAt('MCR', mcr.address);
    this.cover = await ethers.getContractAt('Cover', coverProxyAddress);

    const tokenControllerAddress = await this.master.contractAddresses(toUtf8Bytes('TC'));
    this.tokenController = await ethers.getContractAt('TokenController', tokenControllerAddress);

    const pooledStakingAddress = await this.master.contractAddresses(toUtf8Bytes('PS'));
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', pooledStakingAddress);
    this.pool = pool;
    this.coverMigrator = await ethers.getContractAt('CoverMigrator', coverMigrator.address);

    const gatewayAddress = await this.master.contractAddresses(toUtf8Bytes('GW'));
    this.gateway = await ethers.getContractAt('LegacyGateway', gatewayAddress);

    this.claimsReward = newClaimsReward;
  });
});
