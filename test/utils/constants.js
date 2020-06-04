const { hex } = require('./helpers');

const ParamType = {
  MIN_STAKE: hex('MIN_STAK'),
  MAX_EXPOSURE: hex('MAX_EXPO'),
  MIN_UNSTAKE: hex('MIN_UNST'),
  UNSTAKE_LOCK_TIME: hex('UNST_LKT'),
};

const Role = {
  NonMember: 0,
  Member: 1,
  AdvisoryBoard: 2,
  Owner: 3,
};

module.exports = {
  ParamType,
  Role,
};
