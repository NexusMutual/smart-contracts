const { network, ethers } = require('hardhat');

const { BigNumber } = ethers;
const { AddressZero } = ethers.constants;
const { formatEther, parseEther, formatUnits } = ethers.utils;

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

async function buyCover(productId, poolId, cover, buyer, amount, period, paymentAsset) {
  const product = await cover.products(productId);

  const stakingPoolAddr = await cover.stakingPool(poolId);
  const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddr, buyer);

  const stakingProducts = await ethers.getContractAt('StakingProducts', Addresses.StakingProducts, buyer);

  const globalCapacityRatio = await cover.globalCapacityRatio();
  console.log('Global capacity ratio:', globalCapacityRatio.toString());

  const capacityReductionRatio = product.capacityReductionRatio;
  console.log('Capacity reduction ratio for product', productId, ':', capacityReductionRatio.toString());

  const { timestamp: now } = await ethers.provider.getBlock('latest');
  const stakedProduct = await stakingProducts.getProduct(poolId, productId);
  console.log('Staked Product:', {
    lastEffectiveWeight: stakedProduct.lastEffectiveWeight,
    targetWeight: stakedProduct.targetWeight,
    targetPrice: stakedProduct.targetPrice.toString(),
    bumpedPrice: stakedProduct.bumpedPrice.toString(),
    bumpedPriceUpdateTime: stakedProduct.bumpedPriceUpdateTime,
  });

  const [trancheCapacities, totalCapacity] = await stakingPool.getActiveTrancheCapacities(
    productId,
    globalCapacityRatio,
    capacityReductionRatio,
  );
  console.log('Total capacity on productId ', productId, ':', totalCapacity.div(100).toString(), ' NXM'); // 2 decimals
  console.log(
    'Tranche capacities for productId',
    productId,
    ':',
    trancheCapacities.map(c => formatUnits(c, '2')),
  );

  const activeAllocationsBefore = await stakingPool.getActiveAllocations(productId);
  console.log(
    'Active allocation before buy cover on product',
    productId,
    ':',
    activeAllocationsBefore.map(c => formatUnits(c, '2')),
  );

  // Calculate premium for productId 0
  const NXM_PER_ALLOCATION_UNIT = await cover.NXM_PER_ALLOCATION_UNIT();
  const ALLOCATION_UNITS_PER_NXM = 100;
  const TARGET_PRICE_DENOMINATOR = await stakingProducts.TARGET_PRICE_DENOMINATOR();
  const [expectedPremium] = await stakingProducts.calculatePremium(
    stakedProduct, // staked product
    period, // cover period
    divCeil(amount, parseEther('0.01')), // cover amount with 2 decimals
    activeAllocationsBefore[7], // used capacity - 8th tranche - change if you are depositing in a different tranche
    totalCapacity, // total capacity
    stakedProduct.targetPrice, // target price
    now, // current time,
    NXM_PER_ALLOCATION_UNIT, // NXM per allocation unit from Cover.sol
    ALLOCATION_UNITS_PER_NXM, // allocation units per NXM from Cover.sol
    TARGET_PRICE_DENOMINATOR, // target price denominator from StakingProducts.sol
  );
  console.log('Expected premium: ', formatEther(expectedPremium));

  // Buy cover
  const premiumWithSlippage = expectedPremium.mul('101').div('100'); // 1% tolerance
  await cover.buyCover(
    {
      owner: BUYER,
      productId,
      coverAsset: paymentAsset,
      amount,
      period,
      maxPremiumInAsset: premiumWithSlippage,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: 0, // new cover
    },
    [{ poolId, coverAmountInAsset: amount.toString() }],
    { value: premiumWithSlippage },
  );
  console.log('Bought a cover!');

  const activeAllocationsAfter = await stakingPool.getActiveAllocations(productId);
  console.log(
    'Active allocation after the cover buy on product',
    productId,
    ':',
    activeAllocationsAfter.map(c => formatUnits(c, '2')),
  );
}

async function main() {
  console.log(`Using network: ${network.name}`);

  const buyer = await getSigner(BUYER);
  const cover = await ethers.getContractAt('Cover', Addresses.Cover, buyer);

  const pool = await ethers.getContractAt('Pool', Addresses.Pool, buyer);
  const tokenPrice = await pool.getTokenPrice();
  console.log('NXM token price', formatEther(tokenPrice));

  const poolId = 1;

  // Buy cover generic inputs
  const paymentAsset = 0; // ETH
  const period = 30 * 24 * 3600; // 30 days
  const amount = parseEther('0.1'); // 0.1 ETH

  console.log('========= ProductId 0 on PoolId 1 ==========');
  await buyCover(0, poolId, cover, buyer, amount, period, paymentAsset);

  console.log('========= ProductId 1 on PoolId 1 ==========');
  await buyCover(1, poolId, cover, buyer, amount, period, paymentAsset);

  console.log('========= ProductId 73 on PoolId 1 ==========');
  await buyCover(73, poolId, cover, buyer, amount, period, paymentAsset);

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
