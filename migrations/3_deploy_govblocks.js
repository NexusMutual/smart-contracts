const NXMToken = artifacts.require('NXMToken');
const MemberRoles = artifacts.require('MemberRoles');
const owner = web3.eth.accounts[0];

module.exports = function(deployer) {
  deployer.then(async () => {
    const nxmtk = await NXMToken.deployed();
    await deployer.deploy(
      MemberRoles,
      '0x4e455855532d4d555455414c',
      nxmtk.address,
      owner
    );
  });
};
