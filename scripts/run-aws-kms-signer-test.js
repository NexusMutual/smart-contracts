const { ethers, nexus } = require('hardhat');

const main = async () => {
  const testMessage = 'Hello, mutants!';

  // get signer and sign message
  console.log('Getting signer and signing message...');
  const signer = nexus.awsKms.getSigner(ethers.provider);
  const [signature, ethAddress] = await Promise.all([signer.signMessage(testMessage), signer.getAddress()]);

  // recover address from signature
  console.log('Recovering address from signature...');
  const eip191Hash = ethers.hashMessage(testMessage);
  const recoveredAddress = ethers.recoverAddress(eip191Hash, signature);

  if (recoveredAddress !== ethAddress) {
    throw new Error(`Recovered address ${recoveredAddress} does not match signer address ${ethAddress}`);
  }

  console.log(`Recovered address matches signature address (${recoveredAddress})`);
};

main();
