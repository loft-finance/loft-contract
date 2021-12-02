module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy, get } = deployments;
  const { deployer, loftOwner } = await getNamedAccounts();

  const safeDecimalMath = await get("SafeDecimalMath");
  const addressResolver = await get("AddressResolver");

  await deploy("Liquidations", {
    from: deployer,
    proxy: {
      methodName: "initialize",
      proxyContract: "OptimizedTransparentProxy",
    },
    args: [addressResolver.address],
    log: true,
    libraries: { SafeDecimalMath: safeDecimalMath.address },
  });
};
module.exports.tags = ["Liquidations", "deploy"];
