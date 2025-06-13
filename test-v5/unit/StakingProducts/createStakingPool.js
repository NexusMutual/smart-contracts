const fs = require('fs');
const { artifacts, ethers } = require('hardhat');
const { expect } = require('chai');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const product = {
  productId: 200,
  weight: 100,
  initialPrice: '500',
  targetPrice: '500',
};

const newPoolFixture = {
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  productInitializationParams: [product],
  ipfsDescriptionHash: 'staking-pool-ipfs-metadata',
};

async function createStakingPoolSetup() {
  const fixture = await loadFixture(setup);
  const { coverProducts, initialProducts } = fixture;
  const coverProductTemplate = {
    productType: 1,
    minPrice: 0,
    __gap: 0,
    coverAssets: 1111,
    initialPriceRatio: 500,
    capacityReductionRatio: 0,
    useFixedPrice: false,
  };

  const productId = initialProducts.length;
  const productParam = { ...coverProductTemplate, initialPriceRatio: coverProductTemplate.initialPriceRatio };

  await coverProducts.setProduct(productParam, productId);
  await coverProducts.setProductType({ claimMethod: 0, gracePeriod: 7 * 24 * 3600 /* = 7 days */ }, productId);

  // set product with min price
  const productParamMinPrice = { ...coverProductTemplate, minPrice: 10 };
  await coverProducts.setProduct(productParamMinPrice, productId + 1);
  fixture.productIdMinPrice = productId + 1;

  return fixture;
}

describe('createStakingPool', function () {
  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts, master } = fixture;
    const [stakingPoolCreator] = fixture.accounts.members;

    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    await master.setEmergencyPause(true);

    await expect(
      stakingProducts.connect(stakingPoolCreator).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        ipfsDescriptionHash,
      ),
    ).to.be.revertedWith('System is paused');
  });

  it('reverts if ipfsHash is empty', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts } = fixture;
    const [stakingPoolCreator] = fixture.accounts.members;

    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    const createStakingPool = stakingProducts.connect(stakingPoolCreator).createStakingPool(
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      '', // empty ipfsHash
    );
    await expect(createStakingPool).to.be.revertedWithCustomError(stakingProducts, 'IpfsHashRequired');
  });

  it('should create and initialize a new pool minimal beacon proxy pool', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { cover, stakingPoolFactory, stakingProducts, coverProducts } = fixture;
    const [stakingPoolManager] = fixture.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    // beacon proxy init code hash
    const stakingLibraryPath = 'contracts/libraries/StakingPoolLibrary.sol';
    const stakingLibrary = fs.readFileSync(stakingLibraryPath, 'utf8').toString();
    const hardcodedInitCodeHash = stakingLibrary.match(/hex'([0-9a-f]+)' \/\/ init code hash/i)[1];

    const { bytecode: proxyBytecode } = await artifacts.readArtifact('MinimalBeaconProxy');
    const requiredHash = bytesToHex(keccak256(hexToBytes(proxyBytecode.replace(/^0x/i, ''))));

    // we're skipping this expect test when running the coverage
    // solidity-coverage instrumentation modifies the contract code so we manually patched the
    // bytecode of the contracts that are using the library. if the cover bytecode contains the
    // hardcoded init code hash (i.e. not patched) - we're not in coverage
    const { bytecode: coverBytecode } = await artifacts.readArtifact('Cover');

    if (coverBytecode.includes(hardcodedInitCodeHash)) {
      expect(hardcodedInitCodeHash).to.equal(
        requiredHash,
        'StakingPoolLibrary does not contain the actual MinimalBeaconProxy init code hash',
      );
    }

    const stakingPoolCount = await stakingPoolFactory.stakingPoolCount();
    const poolId = stakingPoolCount.toNumber() + 1;
    const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
    const initCodeHash = Buffer.from(requiredHash, 'hex');
    const expectedAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);

    // calculated address check
    const reportedAddress = await stakingProducts.stakingPool(poolId);
    expect(reportedAddress).to.be.equal(expectedAddress);

    const tx = await stakingProducts.connect(stakingPoolManager).createStakingPool(
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    // actual address check
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedAddress);

    const proxyInstance = await ethers.getContractAt('MinimalBeaconProxy', expectedAddress);
    const beacon = await proxyInstance.beacon();
    expect(beacon).to.be.equal(cover.address);

    const stakingPoolInstance = await ethers.getContractAt('COMockStakingPool', expectedAddress);

    // validate variable is initialized
    const contractPoolId = await stakingPoolInstance.getPoolId();
    expect(contractPoolId).to.be.equal(poolId);

    // check initialize values
    expect(await stakingPoolInstance.isPrivatePool()).to.be.equal(false);
    expect(await stakingPoolInstance.getPoolFee()).to.be.equal(initialPoolFee);
    expect(await stakingPoolInstance.getMaxPoolFee()).to.be.equal(maxPoolFee);

    // check initial product values
    const { timestamp } = await ethers.provider.getBlock('latest');
    for (const product of productInitializationParams) {
      const coverProduct = await coverProducts.getProduct(product.productId);
      const { lastEffectiveWeight, targetWeight, targetPrice, bumpedPrice, bumpedPriceUpdateTime } =
        await stakingProducts.getProduct(poolId, product.productId);
      expect(lastEffectiveWeight).to.be.equal(product.weight);
      expect(targetWeight).to.be.equal(product.weight);
      expect(targetPrice).to.be.equal(product.targetPrice);
      // cant override initial price if not pooled staking
      expect(bumpedPrice).to.be.equal(coverProduct.initialPriceRatio);
      expect(bumpedPriceUpdateTime).to.be.equal(timestamp);
    }
  });

  // TODO: currently this test is messed up
  it.skip('should fail to create a new pool called from pooled staking - Not a member', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { coverProducts, stakingProducts } = fixture;
    const { initialPoolFee, maxPoolFee, ipfsDescriptionHash } = newPoolFixture;

    const initialProducts = [
      { productId: 0, weight: 100, initialPrice: '500', targetPrice: '1000' },
      { productId: 1, weight: 70, initialPrice: '300', targetPrice: '1000' },
    ];

    const [poolId] = await stakingProducts.connect(fixture.pooledStakingSigner).callStatic.createStakingPool(
      true, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      [],
      ipfsDescriptionHash,
    );

    expect(await coverProducts.isPoolAllowed(0 /* productId */, poolId)).to.be.equal(false);
    expect(await coverProducts.isPoolAllowed(1 /* productId */, poolId)).to.be.equal(false);

    await expect(
      stakingProducts.connect(fixture.pooledStakingSigner).createStakingPool(
        true, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        initialProducts,
        ipfsDescriptionHash,
      ),
    )
      .to.be.revertedWithCustomError(stakingProducts, 'PoolNotAllowedForThisProduct')
      .withArgs(0);
  });

  it('reverts when caller is not a member', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts } = fixture;
    const [nonMember] = fixture.accounts.nonMembers;

    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    await expect(
      stakingProducts.connect(nonMember).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        ipfsDescriptionHash,
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it('emits StakingPoolCreated event', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts, stakingPoolFactory } = fixture;
    const [stakingPoolCreator] = fixture.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const tx = await stakingProducts.connect(stakingPoolCreator).createStakingPool(
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    const stakingPoolCount = await stakingPoolFactory.stakingPoolCount();
    const poolId = stakingPoolCount.toNumber();
    const expectedSPAddress = await stakingProducts.stakingPool(poolId);
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedSPAddress);
  });

  it('increments staking pool count', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts, stakingPoolFactory } = fixture;
    const [stakingPoolCreator] = fixture.accounts.members;

    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const stakingPoolCountBefore = await stakingPoolFactory.stakingPoolCount();

    await stakingProducts.connect(stakingPoolCreator).createStakingPool(
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    const stakingPoolCountAfter = await stakingPoolFactory.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));
  });

  it('should fail to initialize products with targetPrice below default minimum', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts } = fixture;
    const { DEFAULT_MIN_PRICE_RATIO } = fixture.config;
    const [stakingPoolCreator] = fixture.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const products = [{ ...productInitializationParams[0], targetPrice: DEFAULT_MIN_PRICE_RATIO - 1 }];
    await expect(
      stakingProducts.connect(stakingPoolCreator).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        products,
        ipfsDescriptionHash,
      ),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetPriceBelowMinPriceRatio');
  });

  it('should fail to initialize products with targetPrice below configured minimum price', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { stakingProducts, coverProducts, productIdMinPrice } = fixture;
    const [stakingPoolCreator] = fixture.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;
    const [productMinPrice] = await coverProducts.getMinPrices([productIdMinPrice]);

    const products = [{ ...productInitializationParams[0], productId: 201, targetPrice: productMinPrice - 1 }];

    await expect(
      stakingProducts.connect(stakingPoolCreator).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        products,
        ipfsDescriptionHash,
      ),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetPriceBelowMinPriceRatio');
  });
});
