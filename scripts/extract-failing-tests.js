// scripts/extract-failing-tests.js
(async () => {
  const { promises: fs } = await import("fs");
  const path = (await import("path")).default;

  const input = process.argv[2] || path.join(process.cwd(), ".temp", "jest-output.json");
  const output = process.argv[3] || path.join(process.cwd(), ".temp", "failing-tests.txt");

  try {
    await fs.access(input);
  } catch {
    console.error("Input file not found:", input);
    process.exit(2);
  }

  const raw = await fs.readFile(input, "utf8");
  let j;
  try {
    j = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse JSON from", input, e.message);
    process.exit(2);
  }

  const fails = [];
  (j.testResults || []).forEach((tr) => {
    (tr.assertionResults || []).forEach((a) => {
      if (a.status === "failed") {
        const line = `${tr.name || "<unknown file>"} :: ${a.fullName || a.title}`;
        fails.push(line);
        if (a.failureMessages && a.failureMessages.length) {
          fails.push("\t" + a.failureMessages[0].split("\n").join("\n\t"));
        }
      }
    });
  });

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, fails.join("\r\n"));
  console.log("Wrote", fails.length, "failed assertions to", output);
})();
