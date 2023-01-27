const { network, ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { AddressZero, MaxUint256 } = ethers.constants;
const { formatEther, parseEther } = ethers.utils;

const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);
const { BUYER } = process.env;
const TRANCHE_DURATION = 91 * 24 * 3600; // 91 days

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
  const stakingPool0Addr = await cover.stakingPool(1);
  const stakingPool0 = await ethers.getContractAt('StakingPool', stakingPool0Addr, buyer);

  // Buy cover generic inputs
  const paymentAsset = 0; // ETH
  const period = 30 * 24 * 3600; // 30 days
  const amount = parseEther('0.001'); // 1 ETH
  const allocationAmount = divCeil(amount, parseEther('0.01')); // 2 decimals

  const globalCapacityRatio = await cover.globalCapacityRatio();
  console.log('Global capacity ratio:', globalCapacityRatio.toString());

  // Premium calculation inputs
  const productId = 0;
  const product = await cover.products(productId);
  const capacityReductionRatio = product.capacityReductionRatio;
  console.log('Capacity reduction ratio for product', productId, ':', capacityReductionRatio.toString());

  const { timestamp: now } = await ethers.provider.getBlock('latest');
  const stakedProduct = await stakingPool0.products(productId);
  console.log('Staked Product:', {
    lastEffectiveWeight: stakedProduct.lastEffectiveWeight,
    targetWeight: stakedProduct.targetWeight,
    targetPrice: stakedProduct.targetPrice.toString(),
    bumpedPrice: stakedProduct.bumpedPrice.toString(),
    bumpedPriceUpdateTime: stakedProduct.bumpedPriceUpdateTime,
  });

  const [trancheCapacities, totalCapacity] = await stakingPool0.getActiveTrancheCapacities(
    productId,
    globalCapacityRatio,
    capacityReductionRatio,
  );

  console.log('Total capacity on productId ', productId, ':', totalCapacity.div(100).toString(), ' NXM');
  console.log(
    'Active tranche capacities for productId',
    productId,
    ':',
    trancheCapacities.map(c => c.div(100).toString()), // 2 decimals
  );

  const activeAllocationsBefore = await stakingPool0.getActiveAllocations(productId);
  console.log(
    'Active allocation before buy cover on product',
    productId,
    ':',
    activeAllocationsBefore.map(c => c.div(100).toString()),
  ); // 2 decimals);

  const firstTrancheId = Math.floor(now / TRANCHE_DURATION);
  console.log('firstTrancheId', firstTrancheId);

  const initialCapacityUsed = BigNumber.from(0);

  // Calculate premium
  const [actualPremium] = await stakingPool0.calculatePremium(
    stakedProduct,
    period,
    allocationAmount,
    initialCapacityUsed,
    totalCapacity,
    stakedProduct.targetPrice,
    now,
  );
  console.log('Expected premium: ', formatEther(actualPremium));

  // Buy Cover
  await cover.buyCover(
    {
      owner: BUYER,
      productId: 0,
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: actualPremium.mul('101').div('100'),
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: actualPremium.mul('101').div('100') },
  );

  console.log('Bought a cover!');

  const activeAllocationsAfter = await stakingPool0.getActiveAllocations(productId);
  console.log(
    'Active allocation after the cover buy on product',
    productId,
    ':',
    activeAllocationsAfter.map(c => c.div(100).toString()), // 2 decimals
  );

  // // Update used capacity
  // initialCapacityUsed += allocationAmount; // 2 decimals
  //
  // // Calculate premium
  // [actualPremium] = await stakingPool0.calculatePremium(
  //   product,
  //   period,
  //   allocationAmount,
  //   initialCapacityUsed,
  //   totalCapacity,
  //   product.targetPrice,
  //   now,
  // );
  // // Buy Cover
  // await cover.buyCover(
  //   {
  //     owner: BUYER,
  //     productId: 1,
  //     coverAsset: 0,
  //     amount,
  //     period,
  //     maxPremiumInAsset: actualPremium,
  //     paymentAsset,
  //     commissionRatio: parseEther('0'),
  //     commissionDestination: AddressZero,
  //     ipfsData: '',
  //     coverId: MaxUint256.toString(),
  //   },
  //   [{ poolId: '0', coverAmountInAsset: amount.toString() }],
  //   { value: actualPremium },
  // );
  // // Update used capacity
  // initialCapacityUsed = initialCapacityUsed.add(BigNumber.from(allocationAmount)); // 2 decimals

  // console.log('Bought a cover!');

  // // Calculate premium
  // [actualPremium] = await stakingPool0.calculatePremium(
  //   product,
  //   period,
  //   allocationAmount,
  //   initialCapacityUsed,
  //   totalCapacity,
  //   product.targetPrice,
  //   now,
  // );
  // // Buy Cover
  // await cover.buyCover(
  //   {
  //     owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // owner.address,
  //     productId: 73, // custodian
  //     coverAsset: 0,
  //     amount,
  //     period,
  //     maxPremiumInAsset: actualPremium,
  //     paymentAsset,
  //     commissionRatio: parseEther('0'),
  //     commissionDestination: AddressZero,
  //     ipfsData: '',
  //     coverId: MaxUint256.toString(),
  //   },
  //   [{ poolId: '0', coverAmountInAsset: amount.toString() }],
  //   { value: actualPremium },
  // );
  //
  // console.log('Bought a cover!');

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
