const { ethers } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { Role } = require('../utils').constants;

describe.only('storageCleanup', function () {
  it('cleans up _unused2 mapping', async function () {
    const { contracts } = this.withEthers;
    const { mr: memberRoles } = contracts;

    {
      const res = await memberRoles._unused2('0x181Aea6936B407514ebFC0754A37704eB8d98F91');
      assert.equal(res, '0x1337DEF18C680aF1f9f45cBcab6309562975b1dD');
    }

    {
      await memberRoles.storageCleanup();
      const res = await memberRoles._unused2('0x181Aea6936B407514ebFC0754A37704eB8d98F91');
      assert.equal(res, '0x0000000000000000000000000000000000000000');
    }
  });
});
