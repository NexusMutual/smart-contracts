const { ethers } = require('hardhat');

const MR = '0x055CC48f7968FD8640EF140610dd4038e1b03926';

const accounts = [''];

const main = async () => {
  const mr = await ethers.getContractAt('TestnetMemberRoles', MR);

  for (const account of accounts) {
    await mr.joinOnTestnet(account);
  }
  console.log('Whitelisted accounts: ', accounts);

  // Funding the accounts
  const amount = ethers.utils.hexValue(ethers.utils.parseUnits('10000', 'ether').toHexString());
  await ethers.provider.send('tenderly_addBalance', [accounts, amount]);
  console.log('Funded accounts: ', accounts);
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
