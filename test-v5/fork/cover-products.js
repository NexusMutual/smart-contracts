const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');

const {
  Address,
  EnzymeAdress,
  V2Addresses,
  calculateProxyAddress,
  formatInternalContracts,
  getSigner,
  submitGovernanceProposal,
} = require('./utils');
const { ContractTypes, ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const evm = require('./evm')();

const { BigNumber } = ethers;
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

/* ========== CONSTRUCTOR PARAMS ========== */

const BUCKET_DURATION = 7 * 24 * 60 * 60;

describe('coverProducts', function () {
  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', V2Addresses.NXMaster));
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
  });

  it('load contracts', async function () {
    this.mcr = await ethers.getContractAt(abis.MCR, addresses.MCR);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt(abis.LegacyQuotationData, addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt(abis.LegacyClaimsReward, addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.pooledStaking = await ethers.getContractAt(abis.LegacyPooledStaking, addresses.LegacyPooledStaking);
    this.yieldTokenIncidents = await ethers.getContractAt(abis.YieldTokenIncidents, addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);

    this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);
    this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

    // Token Mocks
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
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

  it('add new CoverProducts (CP) contract', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // TODO: brute force salt for CoverProducts proxy address on change freeze
    // node scripts/create2/find-salt.js -f '0x01BFd82675DBCc7762C84019cA518e701C0cD07e' \
    //                                   -c '0xffffffffffffffffffffffffffffffffffffffff' \
    //                                   -t cafea OwnedUpgradeabilityProxy
    //
    // 203789506829 -> 0xcafead81a2c2508e7344155eB0DA67a3a487AA8d
    const coverProductsCreate2Salt = 203789506829;
    this.coverProducts = await ethers.deployContract('CoverProducts', []);
    const coverProductsTypeAndSalt = BigNumber.from(coverProductsCreate2Salt).shl(8).add(ContractTypes.Proxy);
    console.log({
      coverProductsCreate2Salt,
      coverProductsTypeAndSalt: coverProductsTypeAndSalt.toString(),
    });

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes(ContractCode.CoverProducts)], [this.coverProducts.address], [coverProductsTypeAndSalt]],
      ),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('CoverProducts Contracts before:', formatInternalContracts(contractsBefore));
    console.info('CoverProducts Contracts after:', formatInternalContracts(contractsAfter));

    const expectedCoverProductsProxyAddress = calculateProxyAddress(this.master.address, coverProductsCreate2Salt);
    const actualCoverProductsProxyAddress = await this.master.getLatestAddress(toUtf8Bytes('CP'));
    expect(actualCoverProductsProxyAddress).to.equal(expectedCoverProductsProxyAddress);

    // set this.coverProducts to the coverProducts proxy contract
    this.coverProducts = await ethers.getContractAt('CoverProducts', actualCoverProductsProxyAddress);
  });

  it('Collect storage data before upgrade', async function () {
    const stakingPoolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    this.contractData = {
      individualClaims: { before: {}, after: {} },
      yieldTokenIncidents: { before: {}, after: {} },
      cover: { before: {}, after: {} },
      stakingPool: { before: {}, after: {} },
      stakingProducts: { before: {}, after: {} },
    };

    // Cover
    const productTypesCount = await this.cover.productTypesCount();
    this.contractData.cover.before.productTypes = [];
    this.contractData.cover.before.productTypeNames = [];
    this.contractData.cover.before.productNames = [];
    this.contractData.cover.before.allowedPools = {};

    for (let i = 0; i < productTypesCount; i++) {
      const productType = await this.cover.productTypes(i);
      const productTypeName = await this.cover.productTypeNames(i);
      this.contractData.cover.before.productTypes.push(productType);
      this.contractData.cover.before.productTypeNames.push(productTypeName);
    }

    this.contractData.cover.before.products = await this.cover.getProducts();
    const productsCount = this.contractData.cover.before.products.length;

    for (let i = 0; i < productsCount; i++) {
      const productName = await this.cover.productNames(i);
      this.contractData.cover.before.productNames.push(productName);

      const allowedPools = [];
      let hasAllowedPools = false;

      if (!this.contractData.cover.before.products[i].isDeprecated) {
        for (let j = 1; j <= stakingPoolCount; j++) {
          const isAllowed = await this.cover.isPoolAllowed(i, j);

          if (isAllowed) {
            allowedPools.push(j);
          } else {
            hasAllowedPools = true;
          }
        }
      }

      if (hasAllowedPools) {
        this.contractData.cover.before.allowedPools[i] = allowedPools;
      }
    }

    // IndividualClaims
    this.contractData.individualClaims.before.claimsCount = await this.individualClaims.getClaimsCount();
    this.contractData.individualClaims.before.claims = [];
    this.contractData.individualClaims.before.claimSubmissions = [];

    for (let i = 0; i < this.contractData.individualClaims.before.claimsCount; i++) {
      const claim = await this.individualClaims.claims(i);
      this.contractData.individualClaims.before.claims.push(claim);

      const lastClaimSubmissionOnCover = await this.individualClaims.lastClaimSubmissionOnCover(i);
      this.contractData.individualClaims.before.claimSubmissions.push(lastClaimSubmissionOnCover);
    }

    // YieldTokenIncidents
    const ytcConfig = await this.yieldTokenIncidents.config();
    this.contractData.yieldTokenIncidents.before.payoutRedemptionPeriodInDays = ytcConfig.payoutRedemptionPeriodInDays;
    this.contractData.yieldTokenIncidents.before.expectedPayoutRatio = ytcConfig.expectedPayoutRatio;
    this.contractData.yieldTokenIncidents.before.payoutDeductibleRatio = ytcConfig.payoutDeductibleRatio;
    this.contractData.yieldTokenIncidents.before.maxRewardInNXMWad = ytcConfig.maxRewardInNXMWad;
    this.contractData.yieldTokenIncidents.before.rewardRatio = ytcConfig.rewardRatio;
    this.contractData.yieldTokenIncidents.before.incidentsCount = await this.yieldTokenIncidents.getIncidentsCount();
    this.contractData.yieldTokenIncidents.before.incidents = [];

    for (let i = 0; i < this.contractData.yieldTokenIncidents.before.incidentsCount; i++) {
      const incident = this.yieldTokenIncidents.getIncidentDisplay(i);
      this.contractData.yieldTokenIncidents.before.incidents.push(incident);
    }

    // StakingProducts
    this.contractData.stakingProducts.before.stakingPoolsProducts = {};
    for (let i = 1; i <= stakingPoolCount; i++) {
      this.contractData.stakingProducts.before.stakingPoolsProducts[i] = [];
      for (let j = 0; j < productsCount; j++) {
        const stakingProduct = await this.stakingProducts.getProduct(i, j);
        this.contractData.stakingProducts.before.stakingPoolsProducts[i].push(stakingProduct);
      }
    }

    // StakikngPool
    const poolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    for (let i = 1; i <= poolCount; i++) {
      const stakingPoolAddress = await this.cover.stakingPool(i);
      const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);
      const manager = await stakingPool.manager();
      const poolFee = await stakingPool.getPoolFee();
      const maxPoolFee = await stakingPool.getMaxPoolFee();
      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();
      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.getLastAccNxmUpdate();
      const firstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();
      const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
      const nextAllocationId = await stakingPool.getNextAllocationId();

      this.contractData.stakingPool.before[i] = {
        manager,
        poolFee,
        maxPoolFee,
        activeStake,
        stakeSharesSupply,
        rewardsSharesSupply,
        rewardPerSecond,
        accNxmPerRewardsShare,
        lastAccNxmUpdate,
        firstActiveTrancheId,
        firstActiveBucketId,
        nextAllocationId,
      };
    }
  });

  it('Migrate the products and productTypes from the Cover to CoverProducts', async function () {
    const tx = await this.coverProducts.migrateCoverProducts();
    const receipt = await tx.wait();
    console.log('Migrate Products and ProductTypes gas used:', receipt.gasUsed.toString());
    console.log('Migrate Products and ProductTypes gas price:', receipt.effectiveGasPrice.toString());
    console.log('Migrate Products and ProductTypes cost:', receipt.effectiveGasPrice.mul(receipt.gasUsed).toString());

    this.coverProductsData = {};
    this.coverProductsData.products = await this.coverProducts.getProducts();
    this.coverProductsData.productTypes = await this.coverProducts.getProductTypes();
    this.coverProductsData.productTypeNames = [];
    this.coverProductsData.productNames = [];
    this.coverProductsData.allowedPools = {};

    const productsCount = this.coverProductsData.products.length;
    const productTypesCount = this.coverProductsData.productTypes.length;

    for (let i = 0; i < productsCount; i++) {
      const productName = await this.coverProducts.getProductName(i);
      this.coverProductsData.productNames.push(productName);

      const productBefore = this.contractData.cover.before.products[i];
      const productAfter = this.coverProductsData.products[i];

      expect(productAfter.productType).to.be.equal(productBefore.productType);
      expect(productAfter.yieldTokenAddress).to.be.equal(productBefore.yieldTokenAddress);
      expect(productAfter.coverAssets).to.be.equal(productBefore.coverAssets);
      expect(productAfter.initialPriceRatio).to.be.equal(productBefore.initialPriceRatio);
      expect(productAfter.capacityReductionRatio).to.be.equal(productBefore.capacityReductionRatio);
      expect(productAfter.isDeprecated).to.be.equal(productBefore.isDeprecated);
      expect(productAfter.useFixedPrice).to.be.equal(productBefore.useFixedPrice);

      expect(productName).to.be.equal(this.contractData.cover.before.productNames[i]);
    }

    for (let i = 0; i < productTypesCount; i++) {
      const productTypeName = await this.coverProducts.getProductTypeName(i);
      this.coverProductsData.productTypeNames.push(productTypeName);

      const productTypeBefore = this.contractData.cover.before.productTypes[i];
      const productTypeAfter = this.coverProductsData.productTypes[i];

      expect(productTypeAfter.claimMethod).to.be.equal(productTypeBefore.claimMethod);
      expect(productTypeAfter.gracePeriod).to.be.equal(productTypeBefore.gracePeriod);
      expect(productTypeName).to.be.equal(this.contractData.cover.before.productTypeNames[i]);
    }

    for (const allowedPools of Object.entries(this.contractData.cover.before.allowedPools)) {
      const [productId, allowedPoolsBefore] = allowedPools;
      const allowedPoolsAfter = await this.coverProducts.getAllowedPools(productId);
      expect(allowedPoolsAfter.length).to.be.equal(allowedPoolsBefore.length);
      expect(allowedPoolsAfter.map(poolId => poolId.toNumber())).to.have.members(allowedPoolsBefore);
    }
  });

  it('Upgrade contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    const individualClaims = await ethers.deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);

    const yieldTokenIncidents = await ethers.deployContract('YieldTokenIncidents', [
      this.nxm.address,
      this.coverNFT.address,
    ]);

    const stakingPool = await ethers.deployContract('StakingPool', [
      this.stakingNFT.address,
      this.nxm.address,
      this.cover.address,
      this.tokenController.address,
      this.master.address,
      this.stakingProducts.address,
    ]);

    const cover = await ethers.deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      stakingPool.address,
    ]);

    const stakingProducts = await ethers.deployContract('StakingProducts', [
      this.cover.address,
      this.stakingPoolFactory.address,
    ]);

    this.coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [this.master.address]);

    this.stakingViewer = await ethers.deployContract('StakingViewer', [
      this.master.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
    ]);

    const contractCodeAddressMapping = {
      [ContractCode.IndividualClaims]: individualClaims.address,
      [ContractCode.YieldTokenIncidents]: yieldTokenIncidents.address,
      [ContractCode.Cover]: cover.address,
      [ContractCode.StakingProducts]: stakingProducts.address,
    };

    // NOTE: Do not manipulate the map between Object.keys and Object.values otherwise the ordering could go wrong
    const codes = Object.keys(contractCodeAddressMapping).map(code => toUtf8Bytes(code));
    const addresses = Object.values(contractCodeAddressMapping);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    this.cover = await getContractByContractCode('Cover', ContractCode.Cover);
    this.individualClaims = await getContractByContractCode('IndividualClaims', ContractCode.IndividualClaims);
    this.yieldTokenIncidents = await getContractByContractCode('YieldTokenIncidents', ContractCode.YieldTokenIncidents);
    this.stakingProducts = await getContractByContractCode('StakingProducts', ContractCode.StakingProducts);

    console.info('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.info('Upgrade Contracts after:', formatInternalContracts(contractsAfter));
  });

  it('Compares storage of upgrade IndividualClaims contract', async function () {
    this.contractData.individualClaims.after.claimsCount = await this.individualClaims.getClaimsCount();
    this.contractData.individualClaims.after.claims = [];
    this.contractData.individualClaims.after.claimSubmissions = [];

    for (let i = 0; i < this.contractData.individualClaims.after.claimsCount; i++) {
      const claim = await this.individualClaims.claims(i);
      this.contractData.individualClaims.after.claims.push(claim);

      const lastClaimSubmissionOnCover = await this.individualClaims.lastClaimSubmissionOnCover(i);
      this.contractData.individualClaims.after.claimSubmissions.push(lastClaimSubmissionOnCover);
    }

    expect(this.contractData.individualClaims.after.claimsCount).to.be.equal(
      this.contractData.individualClaims.before.claimsCount,
    );

    this.contractData.individualClaims.before.claims.forEach((value, i) => {
      expect(this.contractData.individualClaims.after.claims[i]).to.be.deep.equal(value);
    });

    this.contractData.individualClaims.before.claimSubmissions.forEach((value, i) => {
      expect(this.contractData.individualClaims.after.claimSubmissions[i]).to.be.deep.equal(value);
    });
  });

  it('Compares storage of upgrade YieldTokenIncidents contract', async function () {
    const ytcConfig = await this.yieldTokenIncidents.config();
    this.contractData.yieldTokenIncidents.after.payoutRedemptionPeriodInDays = ytcConfig.payoutRedemptionPeriodInDays;
    this.contractData.yieldTokenIncidents.after.expectedPayoutRatio = ytcConfig.expectedPayoutRatio;
    this.contractData.yieldTokenIncidents.after.payoutDeductibleRatio = ytcConfig.payoutDeductibleRatio;
    this.contractData.yieldTokenIncidents.after.maxRewardInNXMWad = ytcConfig.maxRewardInNXMWad;
    this.contractData.yieldTokenIncidents.after.rewardRatio = ytcConfig.rewardRatio;
    this.contractData.yieldTokenIncidents.after.incidentsCount = await this.yieldTokenIncidents.getIncidentsCount();
    this.contractData.yieldTokenIncidents.after.incidents = [];

    for (let i = 0; i < this.contractData.yieldTokenIncidents.after.incidentsCount; i++) {
      const incident = this.yieldTokenIncidents.getIncidentDisplay(i);
      this.contractData.yieldTokenIncidents.after.incidents.push(incident);
    }

    expect(this.contractData.yieldTokenIncidents.after.incidentsCount).to.be.equal(
      this.contractData.yieldTokenIncidents.before.incidentsCount,
    );

    this.contractData.yieldTokenIncidents.before.incidents.forEach((value, i) => {
      expect(this.contractData.yieldTokenIncidents.after.incidents[i]).to.be.deep.equal(value);
    });
  });

  it('Compares storage of upgrade StakingProducts contract', async function () {
    const stakingPoolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    this.contractData.stakingProducts.after.stakingPoolsProducts = {};
    const productsCount = this.coverProductsData.products.length;

    for (let i = 1; i <= stakingPoolCount; i++) {
      this.contractData.stakingProducts.after.stakingPoolsProducts[i] = [];
      for (let j = 0; j < productsCount; j++) {
        const stakingProduct = await this.stakingProducts.getProduct(i, j);
        this.contractData.stakingProducts.after.stakingPoolsProducts[i].push(stakingProduct);
      }
    }

    Object.entries(this.contractData.stakingProducts.before.stakingPoolsProducts).forEach(
      ([poolId, stakingPoolsProducts]) => {
        expect(stakingPoolsProducts).to.be.deep.equal(
          this.contractData.stakingProducts.after.stakingPoolsProducts[poolId],
        );
      },
    );
  });

  it('Compares storage of upgrade StakingPool contract', async function () {
    const poolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    for (let i = 1; i <= poolCount; i++) {
      const stakingPoolAddress = await this.cover.stakingPool(i);
      const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);
      const manager = await stakingPool.manager();
      const poolFee = await stakingPool.getPoolFee();
      const maxPoolFee = await stakingPool.getMaxPoolFee();
      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();
      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();
      const lastAccNxmUpdate = await stakingPool.getLastAccNxmUpdate();
      const firstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();
      const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
      const nextAllocationId = await stakingPool.getNextAllocationId();

      expect(this.contractData.stakingPool.before[i].manager).to.be.equal(manager);
      expect(this.contractData.stakingPool.before[i].poolFee).to.be.equal(poolFee);
      expect(this.contractData.stakingPool.before[i].maxPoolFee).to.be.equal(maxPoolFee);
      expect(this.contractData.stakingPool.before[i].activeStake).to.be.equal(activeStake);
      expect(this.contractData.stakingPool.before[i].stakeSharesSupply).to.be.equal(stakeSharesSupply);
      expect(this.contractData.stakingPool.before[i].rewardsSharesSupply).to.be.equal(rewardsSharesSupply);
      expect(this.contractData.stakingPool.before[i].rewardPerSecond).to.be.equal(rewardPerSecond);
      expect(this.contractData.stakingPool.before[i].accNxmPerRewardsShare).to.be.equal(accNxmPerRewardsShare);
      expect(this.contractData.stakingPool.before[i].lastAccNxmUpdate).to.be.equal(lastAccNxmUpdate);
      expect(this.contractData.stakingPool.before[i].firstActiveTrancheId).to.be.equal(firstActiveTrancheId);
      expect(this.contractData.stakingPool.before[i].firstActiveBucketId).to.be.equal(firstActiveBucketId);
      expect(this.contractData.stakingPool.before[i].nextAllocationId).to.be.equal(nextAllocationId);
    }
  });

  it('change the CoverNFTDescriptor address', async function () {
    // change the CoverNFTDescriptor address in the CoverNFT contract
    await this.cover.connect(this.abMembers[0]).changeCoverNFTDescriptor(this.coverNFTDescriptor.address);
  });

  it('change the StakingPoolFactory operator', async function () {
    // change the CoverNFTDescriptor address in the CoverNFT contract
    await this.cover.changeStakingPoolFactoryOperator();
  });

  it('Recalculate the active cover amount', async function () {
    const ASSETS = {
      ETH: 0,
      DAI: 1,
      USDC: 6,
      NXM: 255,
    };

    const ethActiveCoverBefore = await this.cover.activeCover(ASSETS.ETH);
    const daiActiveCoverBefore = await this.cover.activeCover(ASSETS.DAI);
    const usdcActiveCoverBefore = await this.cover.activeCover(ASSETS.USDC);

    await this.cover.recalculateActiveCoverInAsset(ASSETS.ETH);
    await this.cover.recalculateActiveCoverInAsset(ASSETS.DAI);
    await this.cover.recalculateActiveCoverInAsset(ASSETS.USDC);

    const ethActiveCoverAfter = await this.cover.activeCover(ASSETS.ETH);
    const daiActiveCoverAfter = await this.cover.activeCover(ASSETS.DAI);
    const usdcActiveCoverAfter = await this.cover.activeCover(ASSETS.USDC);

    const lastBlock = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(lastBlock.timestamp / BUCKET_DURATION);

    console.log(`--------------------------------------------------------------`);
    console.log(`ETH Active Cover Before: ${ethActiveCoverBefore.totalActiveCoverInAsset.toString()}`);
    console.log(`ETH Active Cover After : ${ethActiveCoverAfter.totalActiveCoverInAsset.toString()}`);
    console.log(`--------------------------------------------------------------`);
    console.log(`DAI Active Cover Before: ${daiActiveCoverBefore.totalActiveCoverInAsset.toString()}`);
    console.log(`DAI Active Cover After : ${daiActiveCoverAfter.totalActiveCoverInAsset.toString()}`);
    console.log(`--------------------------------------------------------------`);
    console.log(`USDC Active Cover Before: ${usdcActiveCoverBefore.totalActiveCoverInAsset.toString()}`);
    console.log(`USDC Active Cover After : ${usdcActiveCoverAfter.totalActiveCoverInAsset.toString()}`);
    console.log(`--------------------------------------------------------------`);

    expect(ethActiveCoverAfter.lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(daiActiveCoverAfter.lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(usdcActiveCoverAfter.lastBucketUpdateId).to.be.equal(currentBucketId);

    expect(ethActiveCoverAfter.totalActiveCoverInAsset).to.be.lt(ethActiveCoverBefore.totalActiveCoverInAsset);
    expect(daiActiveCoverAfter.totalActiveCoverInAsset).to.be.lt(daiActiveCoverBefore.totalActiveCoverInAsset);
    expect(usdcActiveCoverAfter.totalActiveCoverInAsset).to.be.equal(usdcActiveCoverBefore.totalActiveCoverInAsset);
  });

  require('./basic-functionality-tests');
});
