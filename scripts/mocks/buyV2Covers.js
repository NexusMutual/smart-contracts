const { network, ethers } = require('hardhat');
const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);

const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const { BUYER } = process.env;

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

async function main() {
  console.log(`Using network: ${network.name}`);

  const buyer = await getSigner(BUYER);
  const cover = await ethers.getContractAt('Cover', Addresses.Cover, buyer);

  const paymentAsset = 0; // ETH
  const period = 3600 * 24 * 364; // 30 days
  const amount = parseEther('1');
  const targetPriceRatio = '260';
  const priceDenominator = '10000';
  const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

  await cover.buyCover(
    {
      owner: BUYER,
      productId: 0,
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: expectedPremium },
  );

  console.log('Bought a cover!');

  await cover.buyCover(
    {
      owner: BUYER,
      productId: 1,
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: expectedPremium },
  );

  console.log('Bought a cover!');

  await cover.buyCover(
    {
      owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // owner.address,
      productId: 73, // custodian
      coverAsset: 0,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
      coverId: MaxUint256.toString(),
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    { value: expectedPremium },
  );

  console.log('Bought a cover!');

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
