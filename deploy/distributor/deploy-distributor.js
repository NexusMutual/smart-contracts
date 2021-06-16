const { artifacts, web3, network } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const prompts = require('prompts');
const { hex } = require('../../lib/helpers');
const { FACTORY } = require('./addresses');

const DistributorFactory = artifacts.require('DistributorFactory');
const NXMaster = artifacts.require('NXMaster');
const SelfKyc = artifacts.require('SelfKyc');

async function run () {

  const params = await prompts([
    {
      type: 'text',
      name: 'tokenName',
      message: 'Input your token name (eg.: AwesomeDistributor)',
    },
    {
      type: 'text',
      name: 'tokenSymbol',
      message: 'Input your token symbol (eg.: AWD)',
    },
    {
      type: 'number',
      float: true,
      min: 0,
      round: 2,
      name: 'feePercentage',
      message: 'Input your fee percentage (eg. 7.25 for 7.25%)',
    },
    {
      type: 'text',
      name: 'treasury',
      message: 'Input your treasury address (all your fee profits and sellNXM ETH returns will be sent here!)',
      validate: value => web3.utils.isAddress(value) ? true : 'Not a valid Ethereum address',
    },
  ]);
  const factoryAddress = FACTORY[network.name];
  params.feePercentage *= 100;
  const { feePercentage, tokenName, tokenSymbol, treasury } = params;

  console.log(`Deploying on ${network.name} with factory: ${factoryAddress}`);

  const factory = await DistributorFactory.at(factoryAddress);
  const tx = await factory.newDistributor(
    feePercentage,
    treasury,
    tokenName,
    tokenSymbol,
    { value: ether('0.002') },
  );
  const distributorAddress = tx.logs[0].args.contractAddress;
  console.log(`Successfully deployed at ${distributorAddress}`);

  if (network.name !== 'mainnet') {
    console.log('Using test network. Self-approving kyc..');
    const master = await NXMaster.at(await factory.master());
    const { val: selfKycAddress } = await master.getOwnerParameters(hex('KYCAUTH'));
    const selfKyc = await SelfKyc.at(selfKycAddress);
    await selfKyc.approveKyc(distributorAddress);
    console.log('KYC approved.');
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
