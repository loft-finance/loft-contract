module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy, get, execute } = deployments;
  const { deployer, loftOwner } = await getNamedAccounts();
  const synthesizer = await get("Synthesizer");

  console.log(synthesizer.address);
  await execute(
    "LOFT",
    { from: deployer },
    "setSynthesizer",
    synthesizer.address
  );
};
module.exports.tags = ["InitLOFT", "Config", "deploy"];
//module.exports.dependencies = ['LOFT','Synthesizer','deploy'];
