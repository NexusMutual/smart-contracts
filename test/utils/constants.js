const ParamType = {
  MIN_DEPOSIT_AMOUNT: 0,
  MIN_STAKE_PERCENTAGE: 1,
  MAX_LEVERAGE: 2,
  DEALLOCATE_LOCK_TIME: 3,
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
