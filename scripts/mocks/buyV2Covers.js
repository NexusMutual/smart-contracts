const { network, ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { AddressZero, MaxUint256 } = ethers.constants;
const { formatEther, parseEther } = ethers.utils;

const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);
const { BUYER } = process.env;

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

async function buyCover(productId, cover, stakingPool0, amount, period, paymentAsset, globalCapacityRatio) {
  const allocationAmount = divCeil(amount, parseEther('0.01')); // 2 decimals

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

  // Calculate premium for productId 0
  const [actualPremium] = await stakingPool0.calculatePremium(
    stakedProduct,
    period,
    allocationAmount,
    0, // initialCapacityUsed
    totalCapacity,
    stakedProduct.targetPrice,
    now,
  );
  console.log('Expected premium: ', formatEther(actualPremium));

  // Buy cover for productId 0
  await cover.buyCover(
    {
      owner: BUYER,
      productId,
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
  const amount = parseEther('0.1'); // 0.1 ETH
  const globalCapacityRatio = await cover.globalCapacityRatio();
  console.log('Global capacity ratio:', globalCapacityRatio.toString());

  console.log('========= ProductId 0 ==========');
  await buyCover(0, cover, stakingPool0, amount, period, paymentAsset, globalCapacityRatio);

  console.log('========= ProductId 1 ==========');
  await buyCover(1, cover, stakingPool0, amount, period, paymentAsset, globalCapacityRatio);

  console.log('========= ProductId 73 ==========');
  await buyCover(73, cover, stakingPool0, amount, period, paymentAsset, globalCapacityRatio);

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
