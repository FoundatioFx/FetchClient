const version = Deno.args[0] ?? "0.0.0";
const outputPath = "npm/fetchclient.tgz";

await Deno.mkdir("npm", { recursive: true });

const command = new Deno.Command(Deno.execPath(), {
  args: [
    "pack",
    "--allow-dirty",
    "--set-version",
    version,
    "--output",
    outputPath,
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const status = await command.spawn().status;
if (!status.success) {
  Deno.exit(status.code);
}
