// Puts a local app on the internet with Tailscale Funnel: https://TAILSCALE_HOSTNAME.<your tailnet>.ts.net →
// http://localhost:LOCAL_PORT. Any browser can open the address, with nothing to install where it's opened.
// Settings come from .env next to this script (README.md describes each one). Runs on Windows, macOS and
// Linux with Node 20.12 or later; nothing from npm.
//
// It installs Tailscale if it's missing, signs this computer in (with TAILSCALE_API_KEY, or through a link
// it prints), names it TAILSCALE_HOSTNAME, keeps it connected on Windows while nobody is signed in, and turns
// on Funnel for LOCAL_PORT, which stays on across restarts. With TAILSCALE_API_KEY it also turns off the
// computer's key expiry, so it never has to sign in again. Running it again only changes what's different.
//
// Usage: node tailscale-funnel/setup.mjs
// Offline again: tailscale funnel reset
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api.tailscale.com/api/v2";
const ENV_FILE = path.join(import.meta.dirname, ".env");
const DOWNLOADS = "https://tailscale.com/download";
const MACHINES = "https://login.tailscale.com/admin/machines";

/** A problem the person running the script can fix: printed without a stack trace. */
class SetupError extends Error {}

function fail(message) {
  throw new SetupError(message);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof SetupError)) throw error;
  console.error(`\n${error.message}`);
  process.exit(1);
}

async function main() {
  const { apiKey, hostname, port } = readSettings();
  const api = apiKey ? tailscaleApi(apiKey) : null;
  const tailscale = findTailscale() ?? (await installTailscale());
  console.log(`Tailscale ${spawnSync(tailscale, ["version"], { encoding: "utf8" }).stdout.split("\n")[0].trim()}`);

  await signIn(tailscale, api, hostname);
  const { Self: self } = await readStatus(tailscale);
  if (!self.KeyExpiry) {
    console.log("Key expiry: off");
  } else if (api) {
    await api("POST", `/device/${self.ID}/key`, { keyExpiryDisabled: true });
    console.log("Key expiry: turned off");
  } else {
    const date = new Date(self.KeyExpiry).toLocaleDateString();
    console.warn(
      `Note: this computer has to sign in to Tailscale again on ${date}, and the address stops working until it ` +
        `does. To stop that, open ${MACHINES}, and in this computer's … menu pick Disable key expiry.`,
    );
  }

  const service = `http://localhost:${port}`;
  if (!(await answers(service))) {
    console.warn(
      `Note: nothing answers at ${service} yet, so visitors get an error page until it does ` +
        "(ChessBuddy: npm run build, then npm start).",
    );
  }
  // The first time, Tailscale prints a link to turn on HTTPS and Funnel for the tailnet, and waits for it.
  asRoot(
    tailscale,
    ["funnel", "--bg", String(port)],
    "tailscale funnel failed. If it asked you to turn on HTTPS or Funnel, do that with its link and run this again.",
  );
  const { Self: named } = await readStatus(tailscale);
  console.log(`\nDone: https://${named.DNSName.replace(/\.$/, "")} → ${service}`);
  console.log("A new address can take up to 10 minutes to start working.");
}

function readSettings() {
  if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} is missing: copy .env.example there (see README.md).`);
  process.loadEnvFile(ENV_FILE);
  const apiKey = process.env.TAILSCALE_API_KEY?.trim() || null;
  const hostname = (process.env.TAILSCALE_HOSTNAME?.trim() || "chessbuddy").toLowerCase();
  const port = Number(process.env.LOCAL_PORT?.trim() || 3001);
  if (apiKey && !apiKey.startsWith("tskey-api-")) {
    fail("TAILSCALE_API_KEY must be an API access token, which starts with tskey-api- (README.md says how to create one).");
  }
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) {
    fail(`TAILSCALE_HOSTNAME may only have letters, digits and dashes, such as chessbuddy, not "${hostname}".`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`LOCAL_PORT must be a port number such as 3001, not "${process.env.LOCAL_PORT}".`);
  }
  return { apiKey, hostname, port };
}

/** Calls the Tailscale API and returns its JSON answer, or fails with Tailscale's own error message. */
function tailscaleApi(apiKey) {
  return async (method, route, body) => {
    let response;
    try {
      response = await fetch(`${API}${route}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      });
    } catch (error) {
      fail(`Couldn't reach the Tailscale API: ${error.cause?.message ?? error.message}`);
    }
    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) : null;
    let reason = `HTTP ${response.status}`;
    try {
      reason = JSON.parse(text).message || reason;
    } catch {
      // Not JSON: keep the status.
    }
    const hint = [401, 403].includes(response.status)
      ? " Check TAILSCALE_API_KEY: access tokens stop working when they expire (README.md)."
      : "";
    fail(`Tailscale refused ${method} ${route}: ${reason}.${hint}`);
  };
}

/** The tailscale command, from the PATH or where its installers put it; undefined when it isn't installed. */
function findTailscale() {
  const candidates = ["tailscale"];
  if (process.platform === "win32") {
    if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, "Tailscale", "tailscale.exe"));
  } else if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/bin/tailscale",
      "/usr/local/bin/tailscale",
      "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
    );
  }
  return candidates.find((command) => succeeds(command, ["version"]));
}

async function installTailscale() {
  console.log("Installing Tailscale…");
  if (process.platform === "win32" && succeeds("winget", ["--version"])) {
    run("winget", ["install", "--exact", "--id", "Tailscale.Tailscale"], "winget couldn't install Tailscale.");
  } else if (process.platform === "darwin" && succeeds("brew", ["--version"])) {
    run("brew", ["install", "tailscale"], "Homebrew couldn't install Tailscale.");
    run("sudo", ["brew", "services", "start", "tailscale"], "Couldn't start the Tailscale service.");
  } else if (process.platform === "linux") {
    // Tailscale's own installer picks the package for the distribution and asks for sudo itself.
    const url = "https://tailscale.com/install.sh";
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) fail(`Couldn't download Tailscale's installer from ${url}.`);
    const installer = path.join(os.tmpdir(), `tailscale-install-${process.pid}.sh`);
    writeFileSync(installer, await response.text());
    try {
      run("sh", [installer], "Tailscale's installer failed.");
    } finally {
      rmSync(installer, { force: true });
    }
  } else {
    fail(`Install Tailscale from ${DOWNLOADS} and run this again.`);
  }
  return (
    findTailscale() ?? fail("Tailscale is installed, but this terminal can't find it yet: open a new one and run this again.")
  );
}

/** Signs this computer in to Tailscale and names it, or only renames it when it's already connected. */
async function signIn(tailscale, api, hostname) {
  // On Windows, unattended mode keeps Tailscale connected while nobody is signed in to Windows.
  const prefs = [`--hostname=${hostname}`, ...(process.platform === "win32" ? ["--unattended"] : [])];
  const { BackendState: state } = await readStatus(tailscale);
  if (state === "Running") {
    asRoot(tailscale, ["set", ...prefs], "tailscale set failed.");
    return;
  }
  const args = ["up", ...prefs];
  if (state === "NeedsLogin" && api) {
    // A single-use key that expires in 10 minutes signs in without a browser.
    const { key } = await api("POST", "/tailnet/-/keys", {
      capabilities: { devices: { create: { reusable: false, ephemeral: false, preauthorized: true } } },
      expirySeconds: 600,
    });
    args.push(`--auth-key=${key}`);
  } else if (state === "NeedsLogin") {
    console.log("Sign in to Tailscale with the link below (any browser, on any device):");
  }
  asRoot(tailscale, args, "tailscale up failed: see its message above.");
}

/** `tailscale status --json`, once the Tailscale service answers (it can take a moment after installing). */
async function readStatus(tailscale) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const { stdout } = spawnSync(tailscale, ["status", "--json"], { encoding: "utf8" });
    try {
      return JSON.parse(stdout);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  fail("The Tailscale service doesn't answer: start the Tailscale app or service, and run this again.");
}

/** Whether anything answers at the local service. */
async function answers(service) {
  try {
    await fetch(service, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

function succeeds(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

/**
 * Runs a command in this terminal, where it may ask questions and prints its own errors. When it fails, the
 * script stops with `failure`, which never repeats the arguments: they can hold a sign-in key.
 */
function run(command, args, failure) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) fail(failure);
}

/** Runs a tailscale command that changes settings: Linux only lets root do that, so it goes through sudo there. */
function asRoot(command, args, failure) {
  if (process.platform !== "linux" || process.getuid() === 0) return run(command, args, failure);
  if (!succeeds("sudo", ["-V"])) fail("Changing Tailscale's settings on Linux needs root: run this as root.");
  run("sudo", [command, ...args], failure);
}
