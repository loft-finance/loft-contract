const { toBytes32 } = require("../utils");

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy, get, execute } = deployments;
  const { deployer, loftOwner } = await getNamedAccounts();

  const loft = await get("LOFT");
  const oracle = await get("Oracle");
  const feePool = await get("FeePool");
  const exchanger = await get("Exchanger");
  const rewardEscrow = await get("RewardEscrow");
  const synthesizer = await get("Synthesizer");
  const liquidations = await get("Liquidations");

  await execute(
    "AddressResolver",
    { from: deployer },
    "importAddresses",
    [
      toBytes32("LOFT"),
      toBytes32("Oracle"),
      toBytes32("FeePool"),
      toBytes32("Exchanger"),
      toBytes32("RewardEscrow"),
      toBytes32("Synthesizer"),
      toBytes32("Liquidations"),
    ],
    [
      loft.address,
      oracle.address,
      feePool.address,
      exchanger.address,
      rewardEscrow.address,
      synthesizer.address,
      liquidations.address,
    ]
  );
};
module.exports.tags = ["InitAddressResolver", "Config", "deploy"];
//module.exports.dependencies = ['AddressResolver','LOFT','Oracle','FeePool','Exchanger','RewardEscrow','Synthesizer'];
