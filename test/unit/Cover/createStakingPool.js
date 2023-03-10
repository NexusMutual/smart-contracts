const fs = require('fs');
const { artifacts, ethers } = require('hardhat');
const { expect } = require('chai');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');

const newPoolFixture = {
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  productInitializationParams: [
    {
      productId: 0,
      weight: 100,
      initialPrice: '500',
      targetPrice: '500',
    },
  ],
  ipfsDescriptionHash: 'Description Hash',
};

describe('createStakingPool', function () {
  it('reverts if system is paused', async function () {
    const { cover, master } = this;
    const [stakingPoolCreator] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    await master.setEmergencyPause(true);

    await expect(
      cover.connect(stakingPoolCreator).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        '', // ipfsDescriptionHash
      ),
    ).to.be.revertedWith('System is paused');
  });

  it('should create and initialize a new pool minimal beacon proxy pool', async function () {
    const { cover, stakingPoolFactory, stakingProducts } = this;
    const [stakingPoolManager] = this.accounts.members;
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

    const poolId = 1;
    const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
    const initCodeHash = Buffer.from(requiredHash, 'hex');
    const expectedAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);

    // calculated address check
    const reportedAddress = await cover.stakingPool(poolId);
    expect(reportedAddress).to.be.equal(expectedAddress);

    const tx = await cover.connect(stakingPoolManager).createStakingPool(
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

    const stakingPoolInstance = await ethers.getContractAt('CoverMockStakingPool', expectedAddress);

    // validate variable is initialized
    const contractPoolId = await stakingPoolInstance.getPoolId();
    expect(contractPoolId).to.be.equal(poolId);

    // check initialize values
    expect(await stakingPoolInstance.isPrivatePool()).to.be.equal(false);
    expect(await stakingPoolInstance.getPoolFee()).to.be.equal(initialPoolFee);
    expect(await stakingPoolInstance.getMaxPoolFee()).to.be.equal(maxPoolFee);
    expect(await stakingPoolInstance.ipfsHash()).to.be.equal(ipfsDescriptionHash);

    // check initial product values
    const { timestamp } = await ethers.provider.getBlock('latest');
    for (const product of productInitializationParams) {
      const coverProduct = await cover.products(product.productId);
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

  it('should fail to create a new pool called from pooled staking with forbidden product', async function () {
    const { cover } = this;
    const { initialPoolFee, maxPoolFee, ipfsDescriptionHash } = newPoolFixture;

    // target price is below minimum, but we're using pooled staking so we can override it
    const initialProducts = [
      { productId: 0, weight: 100, initialPrice: '500', targetPrice: '0' },
      { productId: 1, weight: 70, initialPrice: '300', targetPrice: '0' },
    ];

    await expect(
      cover.connect(this.pooledStakingSigner).createStakingPool(
        true, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        initialProducts,
        ipfsDescriptionHash,
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(1);
  });

  it('should create and initialize a new pool called from pooled staking', async function () {
    const { cover, stakingPoolFactory, stakingProducts } = this;
    const { initialPoolFee, maxPoolFee, ipfsDescriptionHash } = newPoolFixture;

    // target price is below minimum, but we're using pooled staking so we can override it
    const initialProducts = [
      { productId: 0, weight: 100, initialPrice: '500', targetPrice: '0' },
      { productId: 3, weight: 70, initialPrice: '300', targetPrice: '0' },
    ];

    const [poolId, expectedAddress] = await cover.connect(this.pooledStakingSigner).callStatic.createStakingPool(
      true, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      initialProducts,
      ipfsDescriptionHash,
    );

    const tx = await cover.connect(this.pooledStakingSigner).createStakingPool(
      true, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      initialProducts,
      ipfsDescriptionHash,
    );

    // check address
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedAddress);
    const stakingPoolInstance = await ethers.getContractAt('CoverMockStakingPool', expectedAddress);

    // validate variable is initialized
    const contractPoolId = await stakingPoolInstance.getPoolId();
    expect(contractPoolId).to.be.equal(poolId);

    // check initialize values
    expect(await stakingPoolInstance.isPrivatePool()).to.be.equal(true);
    expect(await stakingPoolInstance.getPoolFee()).to.be.equal(initialPoolFee);
    expect(await stakingPoolInstance.getMaxPoolFee()).to.be.equal(maxPoolFee);
    expect(await stakingPoolInstance.ipfsHash()).to.be.equal(ipfsDescriptionHash);

    // check initial product values
    const { timestamp } = await ethers.provider.getBlock('latest');
    for (const product of initialProducts) {
      const { lastEffectiveWeight, targetWeight, targetPrice, bumpedPrice, bumpedPriceUpdateTime } =
        await stakingProducts.getProduct(poolId, product.productId);
      expect(lastEffectiveWeight).to.be.equal(product.weight);
      expect(targetWeight).to.be.equal(product.weight);
      expect(targetPrice).to.be.equal(product.targetPrice);
      // Pooled staking does not have initial price override
      expect(bumpedPrice).to.be.equal(product.initialPrice);
      expect(bumpedPriceUpdateTime).to.be.equal(timestamp);
    }
  });

  it('reverts when caller is not a member', async function () {
    const { cover } = this;
    const [nonMember] = this.accounts.nonMembers;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    await expect(
      cover.connect(nonMember).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        '', // ipfsDescriptionHash
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it('emits StakingPoolCreated event', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const tx = await cover.connect(stakingPoolCreator).createStakingPool(
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    const poolId = 1;
    const expectedSPAddress = await cover.stakingPool(poolId);
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedSPAddress);
  });

  it('increments staking pool count', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    const stakingPoolCountBefore = await stakingPoolFactory.stakingPoolCount();

    await cover.connect(stakingPoolCreator).createStakingPool(
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      '', // ipfsDescriptionHash
    );

    const stakingPoolCountAfter = await stakingPoolFactory.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));
  });

  it('should fail to initialize products with targetPrice below global minimum', async function () {
    const { cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [stakingPoolCreator] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    const products = [{ ...productInitializationParams[0], targetPrice: GLOBAL_MIN_PRICE_RATIO - 1 }];
    await expect(
      cover.connect(stakingPoolCreator).createStakingPool(
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        products,
        '', // ipfsDescriptionHash
      ),
    ).to.be.revertedWithCustomError(cover, 'TargetPriceBelowGlobalMinPriceRatio');
  });
});
