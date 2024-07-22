const { ethers } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');

const SIGNER_TYPE = {
  LOCAL: 'local',
  AWS_KMS: 'aws-kms',
};

const getSigner = async (kind = SIGNER_TYPE.LOCAL) => {
  if (kind === SIGNER_TYPE.LOCAL) {
    const [signer] = await ethers.getSigners();
    return signer;
  }

  const provider = ethers.provider;
  const { AWS_KMS_KEY_ID, AWS_REGION } = process.env;

  if (kind === SIGNER_TYPE.AWS_KMS) {
    return new AwsKmsSigner(AWS_KMS_KEY_ID, AWS_REGION, provider);
  }

  throw new Error(`Invalid signer type: ${kind}`);
};

module.exports = { SIGNER_TYPE, getSigner };

if (require.main === module) {
  (async () => {
    // get signer
    const signer = await getSigner(SIGNER_TYPE.AWS_KMS);
    const address = await signer.getAddress();
    console.log(`Signer address: ${address}`);

    // send tx to self
    const tx = await signer.sendTransaction({
      to: address,
      value: '0',
      maxFeePerGas: ethers.utils.parseUnits('15', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei'),
    });
    console.log(`Tx sent: https://etherscan.io/tx/${tx.hash}`);

    process.exit();
  })().catch(console.error);
}
