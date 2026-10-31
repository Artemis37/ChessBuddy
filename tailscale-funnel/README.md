# Tailscale Funnel

`setup.mjs` puts ChessBuddy on the internet at `https://<TAILSCALE_HOSTNAME>.<your-tailnet>.ts.net` with [Tailscale Funnel](https://tailscale.com/kb/1223/funnel). Type that address into any browser, anywhere: only the computer running ChessBuddy needs Tailscale. It's free, with no request quota or time limit (Funnel's bandwidth is capped, at a level Tailscale doesn't publish, far above what ChessBuddy uses). The script runs on Windows, macOS and Linux and needs only Node 20.12 or later.

The address is public: anyone who has it sees ChessBuddy's login page, and your password protects the rest.

## 1. Fill in `.env`

`.env` in this folder holds the settings and is git-ignored. `.env.example` is the same file without secrets: on another computer, copy it to `.env`.

| Variable | Required | What it is |
|---|---|---|
| `TAILSCALE_API_KEY` | No | A Tailscale API access token. With it, the script signs the computer in without a browser and turns off its key expiry, so it never has to sign in again. Without it, you sign in through a link the script prints and [turn off key expiry](#key-expiry) yourself. [How to create one](#tailscale_api_key). |
| `TAILSCALE_HOSTNAME` | No (default `chessbuddy`) | The computer's name in Tailscale, which starts the address: `https://chessbuddy.<your-tailnet>.ts.net`. If another of your devices already has the name, Tailscale adds a number, such as `chessbuddy-1`. |
| `LOCAL_PORT` | No (default `3001`) | The port of the app on this computer. ChessBuddy's server listens on 3001 (`API_PORT` in the main `.env`). |

### `TAILSCALE_API_KEY`

1. Create a free account at [login.tailscale.com](https://login.tailscale.com/start), with Google, Microsoft, GitHub or another sign-in. The free Personal plan is for non-commercial use.
2. Open [Settings → Keys](https://login.tailscale.com/admin/settings/keys) → **Generate access token**.
3. Pick how long it lasts (1 to 90 days), **Generate**, and paste the `tskey-api-…` token into `.env`. Tailscale shows it only once.

The token can manage your whole Tailscale account, so keep it private. Only the setup uses it, so a short lifetime is fine; when it has expired, generate a new one before setting up another computer.

## 2. Run it

From the project folder (Linux asks for your password through sudo):

```bash
node tailscale-funnel/setup.mjs
```

It installs Tailscale if it's missing, signs the computer in, names it `TAILSCALE_HOSTNAME`, keeps it connected on Windows while nobody is signed in (Run unattended), and turns on Funnel for `LOCAL_PORT`. Funnel stays on across restarts. Running the script again is safe: it only changes what's different.

The first time, Tailscale prints a link to turn on HTTPS and Funnel for your account: open it, turn them on, and the script carries on. A brand-new address can take up to 10 minutes to start working.

Then start ChessBuddy (`npm run build`, then `npm start`) and open the address the script printed.

## Keep it reachable

- <a id="key-expiry"></a>**Key expiry**: without `TAILSCALE_API_KEY`, open [Machines](https://login.tailscale.com/admin/machines), and in the computer's **…** menu pick **Disable key expiry**. Otherwise it has to sign in again after 180 days, and the address stops working until it does.
- **Sleep**: set the computer never to sleep, and keep Docker Desktop and `npm start` running.

## Taking it offline

- `tailscale funnel reset` turns Funnel off (on Linux, with sudo).
- `tailscale logout` also removes the computer from your Tailscale account.

## When it doesn't work

- **Error page or 502**: ChessBuddy isn't running on `LOCAL_PORT`. Start it.
- **The address doesn't open**: wait up to 10 minutes after the first setup, and check `tailscale funnel status`.
- **"Tailscale refused" from the script**: `TAILSCALE_API_KEY` is wrong or expired. Generate a new one.
