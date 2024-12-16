const { ethers } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');

const SIGNER_TYPE = {
  LOCAL: 'local',
  AWS_KMS: 'aws-kms',
};

const CONTRACT_DEPLOYER = '0x46842a7d9372bb7dba08f0729393deda230a03b5';

const getSigner = async (kind = SIGNER_TYPE.LOCAL) => {
  const provider = ethers.provider;
  const { AWS_KMS_KEY_ID, AWS_REGION } = process.env;

  // Use contract deployer address to closely mimic main-net deployment
  if (kind === SIGNER_TYPE.LOCAL) {
    await provider.send('hardhat_impersonateAccount', [CONTRACT_DEPLOYER]);
    const signer = await provider.getSigner(CONTRACT_DEPLOYER);
    return signer;
  }

  if (kind === SIGNER_TYPE.AWS_KMS) {
    return new AwsKmsSigner(AWS_KMS_KEY_ID, AWS_REGION, provider);
  }

  throw new Error(`Invalid signer type: ${kind}`);
};

module.exports = { SIGNER_TYPE, getSigner };

if (require.main === module) {
  (async () => {
    const testMessage = 'Hello, mutants!';

    // get signer and sign message
    const signer = await getSigner(SIGNER_TYPE.AWS_KMS);
    const [signature, ethAddress] = await Promise.all([signer.signMessage(testMessage), signer.getAddress()]);

    // recover address from signature
    const eip191Hash = ethers.utils.hashMessage(testMessage);
    const recoveredAddress = ethers.utils.recoverAddress(eip191Hash, signature);

    if (recoveredAddress !== ethAddress) {
      throw new Error(`Recovered address ${recoveredAddress} does not match signer address ${ethAddress}`);
    }

    console.log(`Recovered address matches signature address (${recoveredAddress})`);
    process.exit();
  })().catch(console.error);
}
