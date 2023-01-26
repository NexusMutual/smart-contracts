const { network, ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);
const { BUYER } = process.env;

const stakedProductTemplate = {
  lastEffectiveWeight: BigNumber.from(50),
  targetWeight: BigNumber.from(70), // 70%
  targetPrice: BigNumber.from(200), // 2%
  bumpedPrice: BigNumber.from(200), // 2%
  bumpedPriceUpdateTime: BigNumber.from(0),
};

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

function divCeil(a, b) {
  a = BigNumber.from(a);
  let result = a.div(b);
  if (!a.mod(b).isZero()) {
    result = result.add(1);
  }
  return result;
}

async function main() {
  console.log(`Using network: ${network.name}`);

  const buyer = await getSigner(BUYER);
  const cover = await ethers.getContractAt('Cover', Addresses.Cover, buyer);
  const stakingPool0Addr = await cover.stakingPool(0);
  const stakingPool0 = await ethers.getContractAt('StakingPool', stakingPool0Addr, buyer);

  // Buy cover inputs
  const paymentAsset = 0; // ETH
  const period = 3600 * 24 * 364; // 30 days
  const amount = '1'; // 0.01 ETH

  // Premium calculation inputs
  const { timestamp: now } = await ethers.provider.getBlock('latest');
  const product = { ...stakedProductTemplate, bumpedPriceUpdateTime: now };
  let initialCapacityUsed = BigNumber.from(0);
  // assumes:
  //   - staking pool deposit: 100 NXM
  //   - global capacity factor: 1
  //   - capacity reduction ratio: 0
  const totalCapacity = divCeil(parseEther('100'), parseEther('0.01'));
  let actualPremium;

  // Calculate premium
  [actualPremium] = await stakingPool0.calculatePremium(
    product,
    period,
    amount,
    initialCapacityUsed,
    totalCapacity,
    product.targetPrice,
    now,
  );
  // Buy Cover
  await cover.buyCover(
    {
      owner: BUYER,
      productId: 0,
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: actualPremium,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: actualPremium },
  );
  // Update used capacity
  initialCapacityUsed = initialCapacityUsed.add(amount);

  console.log('Bought a cover!');

  // Calculate premium
  [actualPremium] = await stakingPool0.calculatePremium(
    product,
    period,
    amount,
    initialCapacityUsed,
    totalCapacity,
    product.targetPrice,
    now,
  );
  // Buy Cover
  await cover.buyCover(
    {
      owner: BUYER,
      productId: 1,
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: actualPremium,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: actualPremium },
  );
  // Update used capacity
  initialCapacityUsed = initialCapacityUsed.add(amount);

  console.log('Bought a cover!');

  // Calculate premium
  [actualPremium] = await stakingPool0.calculatePremium(
    product,
    period,
    amount,
    initialCapacityUsed,
    totalCapacity,
    product.targetPrice,
    now,
  );
  // Buy Cover
  await cover.buyCover(
    {
      owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // owner.address,
      productId: 73, // custodian
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: actualPremium,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: actualPremium },
  );

  console.log('Bought a cover!');

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
