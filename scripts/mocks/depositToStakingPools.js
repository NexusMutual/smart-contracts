const { network, ethers } = require('hardhat');
const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);

const { BigNumber } = ethers;
const { AddressZero, MaxUint256 } = ethers.constants;
const { getCreate2Address, formatEther, parseEther, hexValue } = ethers.utils;

const INIT_CODE_HASH = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';
const { STAKER } = process.env;

/**
 * @param {Number} poolId
 * @param {Signer} signer
 * @returns {Promise<StakingPool>}
 */
const getStakingPool = async (poolId, signer) => {
  const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
  const initCodeHash = Buffer.from(INIT_CODE_HASH, 'hex');
  const stakingPoolAddress = getCreate2Address(Addresses.StakingPoolFactory, salt, initCodeHash);
  return ethers.getContractAt('StakingPool', stakingPoolAddress, signer);
};

const hex = n => hexValue(BigNumber.from(n));

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;

  if (['localhost', 'hardhat'].includes(network.name)) {
    await ethers.provider.send('hardhat_impersonateAccount', [address]);
    await ethers.provider.send('hardhat_setBalance', [address, hex(parseEther('1'))]);
  }

  return provider.getSigner(address);
};

const logDepositEvent = receipt => {
  // find event
  const event = receipt.events.find(e => e.event === 'StakeDeposited');

  // event not found
  if (!event) {
    console.log('StakeDeposited event not found');
    return;
  }

  // parse and log deposit data
  console.log('Deposit:', {
    user: event.args.user,
    amount: formatEther(event.args.amount) + ' NXM',
    trancheId: event.args.trancheId.toNumber(),
    tokenId: event.args.tokenId.toNumber(),
  });
};

async function main() {
  console.log(`Using network: ${network.name}`);

  const [owner] = await ethers.getSigners();
  const staker = await getSigner(STAKER);

  console.log('Owner address', owner.address);
  console.log('Staker address', await staker.getAddress());

  // impersonating token controller to mint nxm
  const tokenControllerSigner = await getSigner(Addresses.TokenController);
  const token = await ethers.getContractAt('NXMToken', Addresses.NXMToken, tokenControllerSigner);

  const oneMillionNXM = parseEther('1000000'); // https://youtu.be/EJR1H5tf5wE
  await token.mint(owner.address, oneMillionNXM);
  await token.mint(STAKER, oneMillionNXM);

  // approve nxm for staking
  await token.connect(owner).approve(Addresses.TokenController, MaxUint256);
  await token.connect(staker).approve(Addresses.TokenController, MaxUint256);

  // staking inputs
  const stakingAmount = parseEther('10000');
  const { timestamp: now } = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = Math.floor(now / (91 * 24 * 3600));
  const lastActiveTrancheId = firstActiveTrancheId + 7;

  console.log('Deposit to staking pool id: 0');
  const stakingPoolZero = await getStakingPool(0, owner);

  const firstDepositTx = await stakingPoolZero.depositTo(
    stakingAmount,
    lastActiveTrancheId,
    0, // new position
    AddressZero, // destination
  );

  logDepositEvent(await firstDepositTx.wait());

  console.log('Deposit to staking pool id: 1');
  const stakingPoolOne = await getStakingPool(1, staker);

  const secondDepositTx = await stakingPoolOne.depositTo(
    stakingAmount,
    lastActiveTrancheId,
    0, // new position
    AddressZero, // destination
  );

  logDepositEvent(await secondDepositTx.wait());

  console.log('Deposited successfully!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
