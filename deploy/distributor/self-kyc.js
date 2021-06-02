const { artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../test/utils/helpers');
const { MASTER } = require('./addresses');
const prompts = require('prompts');

const Distributor = artifacts.require('Distributor');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const SelfKyc = artifacts.require('SelfKyc');

async function run () {

  if (network.name === 'mainnet') {
    console.error('Self-KYC not supported for mainnet.');
    process.exit(1);
  }

  const params = await prompts([
    {
      type: 'text',
      name: 'addressToKYC',
      message: 'Input address to pay fee for and KYC. (eg.: 0xeE218a2Fd4FCFF052EbC495c12D5736c09Fc7833)',
      validate: value => web3.utils.isAddress(value) ? true : `Not a valid Ethereum address`
    },
  ]);

  const masterAddress = MASTER[network.name];
  console.log({
    masterAddress,
    network: network.name
  })
  const master = await NXMaster.at(masterAddress);

  const { val: selfKycAddress } = await master.getOwnerParameters(hex('KYCAUTH'));
  console.log({ selfKycAddress });
  const selfKyc = await SelfKyc.at(selfKycAddress);

  console.log('Approving kyc..');
  const addressToKYC =  params.addressToKYC;
  await selfKyc.joinMutual(addressToKYC, {
    value: ether('0.002')
  });
  console.log('Done');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
